import { randomBytes } from "node:crypto";
import inquirer from "inquirer";
import type { EnvConfig, ToolConfig, ToolPreset } from "../config/types.js";
import { ToolConfigService } from "../services/ToolConfigService.js";
import { BaseCommand } from "./ICommand.js";

/**
 * Interactive setup wizard for cyrus-docker
 * Prompts for credentials and creates .env.docker
 */
export class InitCommand extends BaseCommand {
	async execute(): Promise<void> {
		this.logger.header("Cyrus Docker Setup");

		// Check prerequisites
		const prereqs = await this.app.checkPrerequisites();
		this.app.printPrerequisiteStatus(prereqs);

		if (!this.app.allPrerequisitesMet(prereqs)) {
			this.app.printMissingPrerequisites(prereqs);
			this.logger.blank();
			this.logger.warn(
				"Please install missing prerequisites and run init again.",
			);
			process.exit(1);
		}

		this.logger.success("All prerequisites met!");
		this.logger.blank();

		// Check if .env.docker already exists
		if (this.app.docker.hasEnvFile()) {
			const { overwrite } = await inquirer.prompt<{ overwrite: boolean }>([
				{
					type: "confirm",
					name: "overwrite",
					message:
						"Configuration file already exists. Do you want to overwrite it?",
					default: false,
				},
			]);

			if (!overwrite) {
				this.logger.info("Keeping existing configuration.");
				return;
			}
		}

		// Collect credentials
		this.logger.info("Please provide your credentials:");
		this.logger.blank();

		const answers = await this.promptForCredentials();

		// Write .env.docker
		this.app.docker.writeEnvFile(answers);

		// Offer to configure container tools
		await this.promptForTools();

		// Print next steps
		this.printNextSteps();
	}

	/**
	 * Prompt user for all required and optional credentials
	 */
	private async promptForCredentials(): Promise<EnvConfig> {
		// First, ask which authentication method to use
		const { authMethod } = await inquirer.prompt<{
			authMethod: "anthropic" | "claude_code";
		}>([
			{
				type: "list",
				name: "authMethod",
				message: "Which authentication method would you like to use?",
				choices: [
					{
						name: "Anthropic API Key (from console.anthropic.com)",
						value: "anthropic",
					},
					{
						name: "Claude Code OAuth Token (from Claude Code CLI)",
						value: "claude_code",
					},
				],
			},
		]);

		// Prompt for the selected auth credential
		const authCredential =
			authMethod === "anthropic"
				? await inquirer.prompt<{ ANTHROPIC_API_KEY: string }>([
						{
							type: "password",
							name: "ANTHROPIC_API_KEY",
							message: "Anthropic API Key:",
							mask: "*",
							validate: (input: string) =>
								input.length > 0 || "API key is required",
						},
					])
				: await inquirer.prompt<{ CLAUDE_CODE_OAUTH_TOKEN: string }>([
						{
							type: "password",
							name: "CLAUDE_CODE_OAUTH_TOKEN",
							message: "Claude Code OAuth Token:",
							mask: "*",
							validate: (input: string) =>
								input.length > 0 || "OAuth token is required",
						},
					]);

		const answers = await inquirer.prompt<{
			LINEAR_CLIENT_ID: string;
			LINEAR_CLIENT_SECRET: string;
			LINEAR_WEBHOOK_SECRET: string;
			NGROK_AUTHTOKEN: string;
			GIT_USER_NAME: string;
			GIT_USER_EMAIL: string;
			GITHUB_TOKEN: string;
		}>([

			// Linear OAuth
			{
				type: "input",
				name: "LINEAR_CLIENT_ID",
				message:
					"Linear OAuth Client ID (from linear.app/settings/api/applications):",
				validate: (input: string) =>
					input.length > 0 || "Client ID is required",
			},
			{
				type: "password",
				name: "LINEAR_CLIENT_SECRET",
				message: "Linear OAuth Client Secret:",
				mask: "*",
				validate: (input: string) =>
					input.length > 0 || "Client Secret is required",
			},
			{
				type: "input",
				name: "LINEAR_WEBHOOK_SECRET",
				message: "Linear Webhook Secret (press Enter to auto-generate):",
				default: () => randomBytes(32).toString("hex"),
			},

			// ngrok (optional)
			{
				type: "password",
				name: "NGROK_AUTHTOKEN",
				message: "ngrok Authtoken (optional, from dashboard.ngrok.com):",
				mask: "*",
			},

			// Git Configuration
			{
				type: "input",
				name: "GIT_USER_NAME",
				message: "Git user name (for commits):",
			},
			{
				type: "input",
				name: "GIT_USER_EMAIL",
				message: "Git user email (for commits):",
			},

			// GitHub Token (optional)
			{
				type: "password",
				name: "GITHUB_TOKEN",
				message: "GitHub Personal Access Token (optional, for private repos):",
				mask: "*",
			},
		]);

		return {
			...authCredential,
			...answers,
			LINEAR_DIRECT_WEBHOOKS: "true",
			CYRUS_SERVER_PORT: "3456",
		};
	}

	/**
	 * Prompt user to optionally configure container tools
	 */
	private async promptForTools(): Promise<void> {
		this.logger.blank();

		const { configureTools } = await inquirer.prompt<{ configureTools: boolean }>([
			{
				type: "confirm",
				name: "configureTools",
				message: "Would you like to configure container development tools?",
				default: false,
			},
		]);

		if (!configureTools) {
			return;
		}

		const toolConfigService = new ToolConfigService(this.logger);
		const presets = toolConfigService.getAvailablePresets();

		// Prompt for presets
		const { selectedPresets } = await inquirer.prompt<{
			selectedPresets: ToolPreset[];
		}>([
			{
				type: "checkbox",
				name: "selectedPresets",
				message: "Select tool presets to install:",
				choices: presets.map((p) => ({
					name: `${p.name} - ${p.description}`,
					value: p.value,
				})),
			},
		]);

		// Build config if any presets selected
		if (selectedPresets.length > 0) {
			const config: ToolConfig = { presets: selectedPresets };
			toolConfigService.writeConfig(config);
		} else {
			this.logger.info("No tools selected. You can configure tools later with 'cyrus-docker tools'");
		}
	}

	/**
	 * Print next steps after successful init
	 */
	private printNextSteps(): void {
		this.logger.blank();
		this.logger.header("Setup Complete!");
		this.logger.blank();
		this.logger.info("Next steps:");
		this.logger.blank();
		this.logger.raw("  1. Start Cyrus with ngrok tunnel:");
		this.logger.raw("     $ cyrus-docker start");
		this.logger.blank();
		this.logger.raw(
			"  2. Configure Linear OAuth (use URLs shown after start):",
		);
		this.logger.raw("     - Go to linear.app/settings/api/applications");
		this.logger.raw("     - Set Callback URL and Webhook URL");
		this.logger.blank();
		this.logger.raw("  3. Run Linear OAuth flow:");
		this.logger.raw("     $ cyrus-docker auth");
		this.logger.blank();
		this.logger.raw("  4. Add a repository:");
		this.logger.raw(
			"     $ cyrus-docker add-repo https://github.com/your/repo.git",
		);
		this.logger.blank();
		this.logger.info("For more commands, run: cyrus-docker --help");
	}
}
