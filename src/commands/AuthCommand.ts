import { BaseCommand } from "./ICommand.js";

/**
 * Run Linear OAuth flow inside the container
 */
export class AuthCommand extends BaseCommand {
	async execute(): Promise<void> {
		// Check if container is running
		const status = await this.app.docker.getStatus();
		if (!status.running) {
			this.exitWithError(
				"Container is not running. Start it with: cyrus-docker start",
			);
		}

		this.logger.header("Linear OAuth Authentication");
		this.logger.blank();

		// Build and open OAuth URL on the host
		const authUrl = this.buildAuthUrl();
		if (authUrl) {
			this.logger.info("Opening browser for Linear authorization...");
			await this.openBrowser(authUrl);
			this.logger.blank();
		}

		this.logger.info("Running 'cyrus self-auth' inside container...");
		this.logger.info("Waiting for authorization callback...");
		this.logger.divider();

		try {
			await this.app.docker.exec(["cyrus", "self-auth"], {
				interactive: true,
			});
		} catch (error) {
			const exitError = error as { exitCode?: number };
			if (exitError.exitCode !== undefined && exitError.exitCode !== 0) {
				this.logger.error("Authentication failed.");
				process.exit(exitError.exitCode);
			}
		}

		this.logger.divider();
		this.logger.success("Authentication complete!");
	}

	/**
	 * Build the Linear OAuth authorization URL
	 */
	private buildAuthUrl(): string | null {
		const envConfig = this.app.docker.readEnvFile();
		const tunnelUrl = this.app.state.getTunnelUrl();

		if (!envConfig.LINEAR_CLIENT_ID || !tunnelUrl) {
			this.logger.warn(
				"Could not build auth URL - missing CLIENT_ID or tunnel URL",
			);
			return null;
		}

		const params = new URLSearchParams({
			client_id: envConfig.LINEAR_CLIENT_ID,
			redirect_uri: `${tunnelUrl}/callback`,
			response_type: "code",
			scope: "write,app:assignable,app:mentionable",
			actor: "app",
		});

		return `https://linear.app/oauth/authorize?${params.toString()}`;
	}

	/**
	 * Open URL in the default browser on the host
	 */
	private async openBrowser(url: string): Promise<void> {
		const { exec } = await import("node:child_process");
		const { promisify } = await import("node:util");
		const execAsync = promisify(exec);

		try {
			// macOS
			if (process.platform === "darwin") {
				await execAsync(`open "${url}"`);
			}
			// Linux
			else if (process.platform === "linux") {
				await execAsync(`xdg-open "${url}"`);
			}
			// Windows
			else if (process.platform === "win32") {
				await execAsync(`start "" "${url}"`);
			}
		} catch {
			this.logger.warn("Could not open browser automatically.");
			this.logger.info(`Please visit: ${url}`);
		}
	}
}
