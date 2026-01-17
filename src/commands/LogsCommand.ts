import { DEFAULT_LOG_LINES } from "../config/constants.js";
import type { LogsOptions } from "../config/types.js";
import { BaseCommand } from "./ICommand.js";

/**
 * Show container logs
 */
export class LogsCommand extends BaseCommand {
	constructor(
		app: import("../Application.js").Application,
		private options: LogsOptions = {},
	) {
		super(app);
	}

	async execute(): Promise<void> {
		// Check if container is running
		const status = await this.app.docker.getStatus();
		if (!status.running) {
			this.exitWithError(
				"Container is not running. Start it with: cyrus-docker start",
			);
		}

		const { follow = false, lines = DEFAULT_LOG_LINES } = this.options;

		if (follow) {
			this.logger.info("Following container logs (Ctrl+C to stop)...");
			this.logger.divider();
		}

		try {
			await this.app.docker.logs({ follow, lines });
		} catch {
			// User pressed Ctrl+C during follow
			if (follow) {
				this.logger.blank();
				this.logger.info("Stopped following logs.");
			}
		}
	}
}
