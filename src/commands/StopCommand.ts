import { BaseCommand } from "./ICommand.js";

/**
 * Stop Docker container and ngrok tunnel
 */
export class StopCommand extends BaseCommand {
	async execute(): Promise<void> {
		this.logger.header("Stopping Cyrus");

		// Check if state says running
		const ngrokPid = this.app.state.getNgrokPid();
		const wasRunning = this.app.state.isRunning();

		// Step 1: Stop Docker container
		this.logger.blank();
		this.logger.info("Step 1: Stopping Docker container...");

		try {
			await this.app.docker.down();
		} catch (error) {
			this.logger.warn(`Failed to stop container: ${error}`);
		}

		// Step 2: Stop ngrok tunnel
		this.logger.blank();
		this.logger.info("Step 2: Stopping ngrok tunnel...");

		if (ngrokPid) {
			try {
				await this.app.tunnel.stop(ngrokPid);
			} catch (error) {
				this.logger.warn(`Failed to stop ngrok: ${error}`);
			}
		} else {
			this.logger.info("No ngrok PID found in state");
		}

		// Clear state
		this.app.state.setStopped();

		this.logger.blank();
		if (wasRunning) {
			this.logger.success("Cyrus stopped successfully");
		} else {
			this.logger.info("Cyrus was not running, cleaned up state");
		}
	}
}
