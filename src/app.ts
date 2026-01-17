#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { Application } from "./Application.js";
import { AddRepoCommand } from "./commands/AddRepoCommand.js";
import { AuthCommand } from "./commands/AuthCommand.js";
import { BuildCommand } from "./commands/BuildCommand.js";
import { InitCommand } from "./commands/InitCommand.js";
import { LogsCommand } from "./commands/LogsCommand.js";
import { ShellCommand } from "./commands/ShellCommand.js";
import { StartCommand } from "./commands/StartCommand.js";
import { StatusCommand } from "./commands/StatusCommand.js";
import { StopCommand } from "./commands/StopCommand.js";
import { ToolsCommand } from "./commands/ToolsCommand.js";
import { DEFAULT_LOG_LINES } from "./config/constants.js";

// Get the directory of the current module for reading package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json to get the actual version
// When compiled, this is in dist/, so we need to go up one level
const packageJsonPath = resolve(__dirname, "..", "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

// Create Commander program
const program = new Command();

program
	.name("cyrus-docker")
	.description("CLI tool for managing Docker-based Cyrus deployments")
	.version(packageJson.version);

// init - Interactive setup wizard
program
	.command("init")
	.description("Interactive setup wizard for credentials and configuration")
	.action(async () => {
		const app = new Application(packageJson.version);
		await new InitCommand(app).execute();
	});

// start - Start ngrok tunnel and Docker container
program
	.command("start")
	.description("Start ngrok tunnel and Docker container")
	.option("-d, --detach", "Run in detached mode (don't follow logs)")
	.option("-b, --build", "Force rebuild of the Docker image")
	.action(async (options: { detach?: boolean; build?: boolean }) => {
		const app = new Application(packageJson.version);
		await new StartCommand(app, { detach: options.detach, build: options.build }).execute();
	});

// stop - Stop Docker container and ngrok tunnel
program
	.command("stop")
	.description("Stop Docker container and ngrok tunnel")
	.action(async () => {
		const app = new Application(packageJson.version);
		await new StopCommand(app).execute();
	});

// status - Show container and tunnel status
program
	.command("status")
	.description("Show container and tunnel status")
	.action(async () => {
		const app = new Application(packageJson.version);
		await new StatusCommand(app).execute();
	});

// logs - Show container logs
program
	.command("logs")
	.description("Show container logs")
	.option("-f, --follow", "Follow log output")
	.option(
		"-n, --lines <number>",
		`Number of lines to show (default: ${DEFAULT_LOG_LINES})`,
		String(DEFAULT_LOG_LINES),
	)
	.action(async (options: { follow?: boolean; lines?: string }) => {
		const app = new Application(packageJson.version);
		await new LogsCommand(app, {
			follow: options.follow,
			lines: options.lines ? parseInt(options.lines, 10) : undefined,
		}).execute();
	});

// shell - Open interactive shell in container
program
	.command("shell")
	.description("Open interactive bash shell in the container")
	.action(async () => {
		const app = new Application(packageJson.version);
		await new ShellCommand(app).execute();
	});

// auth - Run Linear OAuth flow
program
	.command("auth")
	.description("Run Linear OAuth authentication flow")
	.action(async () => {
		const app = new Application(packageJson.version);
		await new AuthCommand(app).execute();
	});

// add-repo - Add repository
program
	.command("add-repo [url] [workspace]")
	.description(
		"Add a repository to Cyrus. URL is the git clone address, workspace is the Linear workspace name.",
	)
	.action(async (url?: string, workspace?: string) => {
		const app = new Application(packageJson.version);
		await new AddRepoCommand(app, url, workspace).execute();
	});

// tools - Configure container development tools
program
	.command("tools")
	.description("Configure development tools in the container")
	.action(async () => {
		const app = new Application(packageJson.version);
		await new ToolsCommand(app).execute();
	});

// build - Build Docker image
program
	.command("build")
	.description("Build the Docker image (for debugging or CI)")
	.option("-f, --force", "Force rebuild even if image is up-to-date")
	.action(async (options: { force?: boolean }) => {
		const app = new Application(packageJson.version);
		await new BuildCommand(app, { force: options.force }).execute();
	});

/**
 * Check if error is a user cancellation (Ctrl+C during prompts)
 */
function isUserCancellation(error: unknown): boolean {
	if (error instanceof Error) {
		// Inquirer's ExitPromptError when user presses Ctrl+C
		if (error.name === "ExitPromptError") {
			return true;
		}
		// Check message as fallback
		if (error.message.includes("User force closed the prompt")) {
			return true;
		}
	}
	return false;
}

// Parse and execute
(async () => {
	try {
		await program.parseAsync(process.argv);
	} catch (error) {
		// Handle user cancellation gracefully
		if (isUserCancellation(error)) {
			console.log("\nCancelled.");
			process.exit(0);
		}

		console.error("Error:", error);
		process.exit(1);
	}
})();
