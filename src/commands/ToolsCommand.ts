import inquirer from "inquirer";
import type { ToolConfig, ToolPreset } from "../config/types.js";
import { ToolConfigService } from "../services/ToolConfigService.js";
import { BaseCommand } from "./ICommand.js";

/**
 * Interactive wizard for configuring development tools in the container
 */
export class ToolsCommand extends BaseCommand {
	private toolConfig: ToolConfigService;

	constructor(app: import("../Application.js").Application) {
		super(app);
		this.toolConfig = new ToolConfigService(this.logger);
	}

	async execute(): Promise<void> {
		this.logger.header("Configure Container Tools");
		this.logger.blank();

		// Check for existing config
		const existingConfig = this.toolConfig.readConfig();
		if (existingConfig) {
			const { action } = await inquirer.prompt<{
				action: "modify" | "clear" | "cancel";
			}>([
				{
					type: "list",
					name: "action",
					message: "Existing tool configuration found. What would you like to do?",
					choices: [
						{ name: "Modify existing configuration", value: "modify" },
						{ name: "Start fresh (clear existing)", value: "clear" },
						{ name: "Cancel", value: "cancel" },
					],
				},
			]);

			if (action === "cancel") {
				this.logger.info("Cancelled.");
				return;
			}

			if (action === "clear") {
				// Start with empty config
			}
		}

		// Get available presets
		const presets = this.toolConfig.getAvailablePresets();

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
					checked: existingConfig?.presets?.includes(p.value) ?? false,
				})),
			},
		]);

		// Prompt for additional APT packages
		const { aptPackages } = await inquirer.prompt<{ aptPackages: string }>([
			{
				type: "input",
				name: "aptPackages",
				message: "Additional APT packages? (comma-separated, or press Enter to skip)",
				default: existingConfig?.apt?.join(", ") ?? "",
			},
		]);

		// Prompt for npm packages
		const { npmPackages } = await inquirer.prompt<{ npmPackages: string }>([
			{
				type: "input",
				name: "npmPackages",
				message: "Additional npm packages? (comma-separated, or press Enter to skip)",
				default: existingConfig?.npm?.join(", ") ?? "",
			},
		]);

		// Prompt for pip packages
		const { pipPackages } = await inquirer.prompt<{ pipPackages: string }>([
			{
				type: "input",
				name: "pipPackages",
				message: "Additional pip packages? (comma-separated, or press Enter to skip)",
				default: existingConfig?.pip?.join(", ") ?? "",
			},
		]);

		// Build config
		const config: ToolConfig = {};

		if (selectedPresets.length > 0) {
			config.presets = selectedPresets;
		}

		const apt = this.parsePackageList(aptPackages);
		if (apt.length > 0) {
			config.apt = apt;
		}

		const npm = this.parsePackageList(npmPackages);
		if (npm.length > 0) {
			config.npm = npm;
		}

		const pip = this.parsePackageList(pipPackages);
		if (pip.length > 0) {
			config.pip = pip;
		}

		// Check if empty config
		if (Object.keys(config).length === 0) {
			this.logger.info("No tools selected. Configuration not saved.");
			return;
		}

		// Show summary
		this.logger.blank();
		this.logger.header("Configuration Summary");
		this.printConfigSummary(config);

		// Confirm save
		const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
			{
				type: "confirm",
				name: "confirm",
				message: "Save this configuration?",
				default: true,
			},
		]);

		if (!confirm) {
			this.logger.info("Configuration not saved.");
			return;
		}

		// Save config
		this.toolConfig.writeConfig(config);

		// Print next steps
		this.logger.blank();
		this.logger.info("Next steps:");
		this.logger.raw("  Run 'cyrus-docker start' to build with custom tools");
		this.logger.raw("  Or edit ~/.cyrus-docker/tools.yml directly for advanced options");
	}

	/**
	 * Parse comma-separated package list into array
	 */
	private parsePackageList(input: string): string[] {
		if (!input.trim()) {
			return [];
		}
		return input
			.split(",")
			.map((p) => p.trim())
			.filter((p) => p.length > 0);
	}

	/**
	 * Print configuration summary
	 */
	private printConfigSummary(config: ToolConfig): void {
		if (config.presets && config.presets.length > 0) {
			this.logger.keyValue("Presets", config.presets.join(", "));
		}
		if (config.apt && config.apt.length > 0) {
			this.logger.keyValue("APT packages", config.apt.join(", "));
		}
		if (config.npm && config.npm.length > 0) {
			this.logger.keyValue("npm packages", config.npm.join(", "));
		}
		if (config.pip && config.pip.length > 0) {
			this.logger.keyValue("pip packages", config.pip.join(", "));
		}
	}
}
