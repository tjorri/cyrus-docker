import type { Application } from "../Application.js";
import type { Logger } from "../services/Logger.js";

/**
 * Interface for all CLI commands
 */
export interface ICommand {
	/**
	 * Execute the command
	 */
	execute(): Promise<void>;
}

/**
 * Base class for commands with common functionality
 */
export abstract class BaseCommand implements ICommand {
	protected logger: Logger;

	constructor(protected app: Application) {
		this.logger = app.logger;
	}

	abstract execute(): Promise<void>;

	/**
	 * Exit with error message and code
	 */
	protected exitWithError(message: string, code = 1): never {
		this.logger.error(message);
		process.exit(code);
	}

	/**
	 * Check prerequisites and exit if not met
	 */
	protected async requirePrerequisites(): Promise<void> {
		const prereqs = await this.app.checkPrerequisites();

		if (!this.app.allPrerequisitesMet(prereqs)) {
			this.app.printPrerequisiteStatus(prereqs);
			this.app.printMissingPrerequisites(prereqs);
			process.exit(1);
		}
	}

	/**
	 * Check if Cyrus is running and exit if not
	 */
	protected requireRunning(): void {
		if (!this.app.state.isRunning()) {
			this.exitWithError(
				"Cyrus is not running. Start it with: cyrus-docker start",
			);
		}
	}

	/**
	 * Check if Cyrus is not running and exit if it is
	 */
	protected requireNotRunning(): void {
		if (this.app.state.isRunning()) {
			this.exitWithError(
				"Cyrus is already running. Stop it first with: cyrus-docker stop",
			);
		}
	}
}
