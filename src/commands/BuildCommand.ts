import { ToolConfigService } from "../services/ToolConfigService.js";
import { BaseCommand } from "./ICommand.js";

/**
 * Options for the build command
 */
export interface BuildOptions {
	/** Force rebuild even if image is up-to-date */
	force?: boolean;
}

/**
 * Build the Docker image (standalone command for debugging/CI)
 */
export class BuildCommand extends BaseCommand {
	constructor(
		app: import("../Application.js").Application,
		private options: BuildOptions = {},
	) {
		super(app);
	}

	async execute(): Promise<void> {
		this.logger.header("Building Cyrus Docker Image");

		// Check prerequisites
		await this.requirePrerequisites();

		const toolConfigService = new ToolConfigService(this.logger);
		const toolConfig = toolConfigService.readConfig();
		const toolsHash = toolConfigService.getConfigHash();

		// Check if rebuild is needed (unless --force flag)
		if (!this.options.force) {
			this.logger.info("Checking if image rebuild is needed...");
			const { needsRebuild, reason } = await this.app.docker.checkImageStatus(toolsHash);

			if (!needsRebuild) {
				this.logger.success(`${reason} - no rebuild needed`);
				this.logger.blank();
				this.logger.info("Use --force to rebuild anyway");
				return;
			}

			this.logger.info(`${reason} - rebuilding image...`);
		} else {
			this.logger.info("Force rebuild requested...");
		}

		this.logger.blank();

		// When --force flag is used, do a full rebuild with no cache
		const buildOptions = { noCache: this.options.force };

		// Build with tools if configured
		if (toolConfig) {
			const resolvedConfig = toolConfigService.resolveConfig(toolConfig);
			if (toolConfigService.hasTools(resolvedConfig)) {
				await this.app.docker.buildWithTools(
					resolvedConfig,
					toolConfigService.generateDockerfile.bind(toolConfigService),
					toolsHash,
					buildOptions,
				);
				this.printSuccess(toolsHash);
				return;
			}
		}

		// No tools config or empty config - build normally
		await this.app.docker.build(buildOptions);
		this.printSuccess(null);
	}

	/**
	 * Print success message with image info
	 */
	private printSuccess(toolsHash: string | null): void {
		this.logger.blank();
		this.logger.header("Build Complete");
		this.logger.blank();

		if (toolsHash) {
			this.logger.keyValue("Tools hash", toolsHash);
		} else {
			this.logger.info("Built base image (no tools configured)");
		}

		this.logger.blank();
		this.logger.info("Run 'cyrus-docker start' to start the container");
	}
}
