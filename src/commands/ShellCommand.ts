import { BaseCommand } from "./ICommand.js";

/**
 * Open interactive shell in the container
 */
export class ShellCommand extends BaseCommand {
	async execute(): Promise<void> {
		// Check if container is running
		const status = await this.app.docker.getStatus();
		if (!status.running) {
			this.exitWithError(
				"Container is not running. Start it with: cyrus-docker start",
			);
		}

		this.logger.info("Opening shell in container...");
		this.logger.info("Type 'exit' to leave the shell.");
		this.logger.divider();

		try {
			await this.app.docker.shell();
		} catch (error) {
			// Check if it was just an exit
			const exitError = error as { exitCode?: number };
			if (exitError.exitCode === undefined) {
				throw error;
			}
			// Normal exit from shell
		}

		this.logger.divider();
		this.logger.info("Exited container shell.");
	}
}
