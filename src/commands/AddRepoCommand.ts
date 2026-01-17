import { BaseCommand } from "./ICommand.js";

/**
 * Add a repository inside the container
 */
export class AddRepoCommand extends BaseCommand {
	constructor(
		app: import("../Application.js").Application,
		private url?: string,
		private workspace?: string,
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

		this.logger.header("Add Repository");
		this.logger.blank();

		// Build command args
		const args = ["cyrus", "self-add-repo"];
		if (this.url) {
			args.push(this.url);
		}
		if (this.workspace) {
			args.push(this.workspace);
		}

		this.logger.info(`Running '${args.join(" ")}' inside container...`);
		this.logger.divider();

		try {
			await this.app.docker.exec(args, { interactive: true });
		} catch (error) {
			const exitError = error as { exitCode?: number };
			if (exitError.exitCode !== undefined && exitError.exitCode !== 0) {
				this.logger.error("Failed to add repository.");
				process.exit(exitError.exitCode);
			}
		}

		this.logger.divider();
		this.logger.success("Repository added!");
	}
}
