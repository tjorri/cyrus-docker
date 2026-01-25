import { BaseCommand } from "./ICommand.js";

/**
 * Restart only the Docker container (keeps ngrok tunnel running)
 */
export class RestartCommand extends BaseCommand {
	async execute(): Promise<void> {
		this.logger.header("Restarting Cyrus Container");

		// Check if running
		if (!this.app.state.isRunning()) {
			this.exitWithError(
				"Cyrus is not running. Use 'cyrus-docker start' instead.",
			);
		}

		// Verify container exists
		const status = await this.app.docker.getStatus();
		if (!status.running) {
			this.logger.warn("Container not running, starting it...");
		}

		// Step 1: Stop Docker container
		this.logger.blank();
		this.logger.info("Step 1: Stopping Docker container...");

		try {
			await this.app.docker.down();
		} catch (error) {
			this.logger.warn(`Failed to stop container: ${error}`);
		}

		// Step 2: Start Docker container
		this.logger.blank();
		this.logger.info("Step 2: Starting Docker container...");

		try {
			await this.app.docker.up();
		} catch (error) {
			this.exitWithError(`Failed to start container: ${error}`);
		}

		// Step 3: Wait for container to be healthy
		this.logger.blank();
		this.logger.info("Step 3: Waiting for container health check...");

		try {
			await this.app.docker.waitForHealthy();
		} catch (error) {
			this.logger.warn(`Health check issue: ${error}`);
			this.logger.info("Container may still be starting up...");
		}

		this.logger.blank();
		this.logger.success("Container restarted successfully");
		this.logger.info(`Tunnel URL: ${this.app.state.getTunnelUrl()}`);
	}
}
