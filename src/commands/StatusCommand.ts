import { ToolConfigService } from "../services/ToolConfigService.js";
import { BaseCommand } from "./ICommand.js";

/**
 * Show Cyrus container and tunnel status
 */
export class StatusCommand extends BaseCommand {
	async execute(): Promise<void> {
		this.logger.header("Cyrus Docker Status");

		// Get container status
		const containerStatus = await this.app.docker.getStatus();

		// Get tunnel status
		const tunnelStatus = await this.app.tunnel.getStatus();

		// Get image status
		const toolConfigService = new ToolConfigService(this.logger);
		const currentToolsHash = toolConfigService.getConfigHash();
		const imageStatus = await this.app.docker.checkImageStatus(currentToolsHash);

		// Get state info
		const stateInfo = this.app.state.get();
		const startedAt = this.app.state.getStartedAt();

		this.logger.blank();

		// Container status
		if (containerStatus.running) {
			const healthIcon =
				containerStatus.health === "healthy"
					? "healthy"
					: containerStatus.health === "starting"
						? "starting"
						: "unhealthy";

			this.logger.status(
				"Container",
				containerStatus.health === "healthy",
				`Running (${healthIcon})`,
			);

			if (containerStatus.uptimeSeconds !== undefined) {
				const uptime = this.app.docker.formatUptime(
					containerStatus.uptimeSeconds,
				);
				this.logger.keyValue("  Uptime", uptime);
			}

			if (containerStatus.containerId) {
				this.logger.keyValue("  ID", containerStatus.containerId);
			}
		} else {
			this.logger.status("Container", false, "Not running");
		}

		this.logger.blank();

		// Tunnel status
		if (tunnelStatus.isRunning && tunnelStatus.url) {
			this.logger.status("Tunnel", true, "Active");
			this.logger.keyValue("  URL", tunnelStatus.url);
			this.logger.keyValue("  Local", `localhost:3456`);
		} else {
			this.logger.status("Tunnel", false, "Not running");
		}

		this.logger.blank();

		// Image status
		const imageExists = await this.app.docker.imageExists();
		if (imageExists) {
			this.logger.status("Image", !imageStatus.needsRebuild, imageStatus.reason);
			if (currentToolsHash) {
				this.logger.keyValue("  Tools hash", currentToolsHash);
			}
		} else {
			this.logger.status("Image", false, "Not built");
			if (currentToolsHash) {
				this.logger.keyValue("  Tools hash", currentToolsHash);
			}
		}

		// If both are running, show Linear configuration
		if (containerStatus.running && tunnelStatus.isRunning && tunnelStatus.url) {
			this.logger.blank();
			this.logger.divider();
			this.logger.blank();
			this.logger.info("Linear Configuration:");
			this.logger.keyValue(
				"  Callback URL",
				`${tunnelStatus.url}/callback`,
				14,
			);
			this.logger.keyValue("  Webhook URL", `${tunnelStatus.url}/webhook`, 14);
		}

		// Show started time
		if (startedAt && containerStatus.running) {
			this.logger.blank();
			this.logger.divider();
			this.logger.blank();
			this.logger.keyValue("Started", startedAt.toLocaleString(), 10);
		}

		// Show state consistency warning
		if (stateInfo.isRunning && !containerStatus.running) {
			this.logger.blank();
			this.logger.warn(
				"State file says running but container is not. Run 'cyrus-docker stop' to clean up.",
			);
		}

		this.logger.blank();
	}
}
