import { DEFAULT_PORT } from "../config/constants.js";
import type { StartOptions } from "../config/types.js";
import { ToolConfigService } from "../services/ToolConfigService.js";
import { BaseCommand } from "./ICommand.js";

/**
 * Start ngrok tunnel and Docker container
 */
export class StartCommand extends BaseCommand {
	constructor(
		app: import("../Application.js").Application,
		private options: StartOptions = {},
	) {
		super(app);
	}

	async execute(): Promise<void> {
		this.logger.header("Starting Cyrus");

		// Check prerequisites
		await this.requirePrerequisites();

		// Check if already running
		if (this.app.state.isRunning()) {
			const status = await this.app.docker.getStatus();
			if (status.running) {
				this.logger.warn("Cyrus is already running.");
				this.logger.info(`Tunnel URL: ${this.app.state.getTunnelUrl()}`);
				return;
			}
			// State says running but container is not - clean up state
			this.app.state.setStopped();
		}

		// Check for .env.docker
		if (!this.app.docker.hasEnvFile()) {
			this.exitWithError(
				"Configuration not found. Run 'cyrus-docker init' first.",
			);
		}

		// Step 1: Start ngrok tunnel
		this.logger.blank();
		this.logger.info("Step 1: Starting ngrok tunnel...");

		const ngrokProcess = await this.app.tunnel.start(DEFAULT_PORT);
		const ngrokPid = ngrokProcess.pid;

		if (!ngrokPid) {
			this.exitWithError("Failed to get ngrok process PID");
		}

		// Wait for tunnel URL
		let tunnelUrl: string;
		try {
			tunnelUrl = await this.app.tunnel.waitForUrl();
		} catch (error) {
			// Clean up ngrok if we fail to get URL
			await this.app.tunnel.stop(ngrokPid);
			this.exitWithError(`Failed to get tunnel URL: ${error}`);
		}

		// Step 2: Update .env.docker with tunnel URL
		this.logger.blank();
		this.logger.info("Step 2: Updating CYRUS_BASE_URL...");
		this.app.docker.updateEnvValue("CYRUS_BASE_URL", tunnelUrl);
		this.logger.success(`Set CYRUS_BASE_URL=${tunnelUrl}`);

		// Step 3: Build and start Docker container
		this.logger.blank();
		this.logger.info("Step 3: Starting Docker container...");

		try {
			await this.buildDockerImage();
			await this.app.docker.up();
		} catch (error) {
			// Clean up ngrok if Docker fails
			await this.app.tunnel.stop(ngrokPid);
			this.exitWithError(`Failed to start container: ${error}`);
		}

		// Step 4: Wait for container to be healthy
		this.logger.blank();
		this.logger.info("Step 4: Waiting for container health check...");

		try {
			await this.app.docker.waitForHealthy();
		} catch (error) {
			this.logger.warn(`Health check issue: ${error}`);
			this.logger.info("Container may still be starting up...");
		}

		// Save state
		this.app.state.setRunning(ngrokPid, tunnelUrl, this.app.dockerDir);

		// Print success and Linear configuration URLs
		this.printSuccess(tunnelUrl);

		// Follow logs unless detached
		if (!this.options.detach) {
			this.logger.blank();
			this.logger.info("Following container logs (Ctrl+C to detach)...");
			this.logger.divider();
			try {
				await this.app.docker.logs({ follow: true });
			} catch {
				// User pressed Ctrl+C
				this.logger.blank();
				this.logger.info("Detached from logs. Cyrus continues running.");
				this.logger.info("Run 'cyrus-docker logs -f' to follow again.");
			}
		}
	}

	/**
	 * Print success message with Linear configuration URLs
	 */
	private printSuccess(tunnelUrl: string): void {
		this.logger.blank();
		this.logger.header("Cyrus Started Successfully");
		this.logger.blank();

		this.logger.keyValue("Tunnel URL", tunnelUrl);
		this.logger.keyValue("Local Port", String(DEFAULT_PORT));
		this.logger.blank();

		this.logger.info("Configure these URLs in Linear OAuth App:");
		this.logger.raw(`  linear.app/settings/api/applications`);
		this.logger.blank();
		this.logger.keyValue("Callback URL", `${tunnelUrl}/callback`, 14);
		this.logger.keyValue("Webhook URL", `${tunnelUrl}/webhook`, 14);
		this.logger.blank();

		this.logger.info("Then run: cyrus-docker auth");
	}

	/**
	 * Build Docker image if needed, using custom tools if configured
	 */
	private async buildDockerImage(): Promise<void> {
		const toolConfigService = new ToolConfigService(this.logger);
		const toolConfig = toolConfigService.readConfig();
		const toolsHash = toolConfigService.getConfigHash();

		// Check if rebuild is needed (unless --build flag forces it)
		if (!this.options.build) {
			this.logger.info("Checking if image rebuild is needed...");
			const { needsRebuild, reason } = await this.app.docker.checkImageStatus(toolsHash);

			if (!needsRebuild) {
				this.logger.success(`${reason} - skipping build`);
				return;
			}

			this.logger.info(`${reason} - rebuilding image...`);
		} else {
			this.logger.info("Force rebuild requested...");
		}

		// Build with tools if configured
		if (toolConfig) {
			const resolvedConfig = toolConfigService.resolveConfig(toolConfig);
			if (toolConfigService.hasTools(resolvedConfig)) {
				await this.app.docker.buildWithTools(
					resolvedConfig,
					toolConfigService.generateDockerfile.bind(toolConfigService),
					toolsHash,
				);
				return;
			}
		}

		// No tools config or empty config - build normally
		await this.app.docker.build();
	}
}
