import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Options as ExecaOptions, execa } from "execa";
import {
	CONFIG_DIR,
	CONTAINER_HEALTH_RETRY_DELAY,
	CONTAINER_HEALTH_TIMEOUT,
	CONTAINER_NAME,
	IMAGE_NAME,
	TOOLS_HASH_LABEL,
} from "../config/constants.js";
import type {
	ContainerHealth,
	ContainerStatus,
	EnvConfig,
	LogsOptions,
} from "../config/types.js";
import type { Logger } from "./Logger.js";
import type { ResolvedToolConfig } from "./ToolConfigService.js";

/**
 * Docker inspect result for container
 */
interface DockerInspectResult {
	State: {
		Status: string;
		Running: boolean;
		StartedAt: string;
		Health?: {
			Status: string;
		};
	};
	Id: string;
}

/**
 * Manages Docker containers and docker-compose operations
 */
export class DockerService {
	constructor(
		private dockerDir: string,
		private logger: Logger,
	) {}

	/**
	 * Get the path to a file in the docker directory
	 */
	private getPath(file: string): string {
		return join(this.dockerDir, file);
	}

	/**
	 * Get common execa options for docker commands
	 */
	private getExecaOptions(): ExecaOptions {
		return {
			cwd: this.dockerDir,
			stdio: "inherit",
		};
	}

	/**
	 * Check if Docker is installed and running
	 */
	async checkDocker(): Promise<boolean> {
		try {
			await execa("docker", ["info"], { stdio: "pipe" });
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Check if docker-compose is installed
	 */
	async checkDockerCompose(): Promise<boolean> {
		try {
			await execa("docker", ["compose", "version"], { stdio: "pipe" });
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Build the Docker image
	 */
	async build(options: { noCache?: boolean } = {}): Promise<void> {
		this.logger.info("Building Docker image...");
		const args = ["compose", "build"];
		if (options.noCache) {
			args.push("--no-cache");
		}
		await execa("docker", args, this.getExecaOptions());
		this.logger.success("Docker image built");
	}

	/**
	 * Build Docker image with custom tools configuration
	 */
	async buildWithTools(
		toolConfig: ResolvedToolConfig,
		generateDockerfile: (config: ResolvedToolConfig, baseImage: string) => string,
		toolsHash?: string | null,
		options: { noCache?: boolean } = {},
	): Promise<void> {
		this.logger.info("Building custom Docker image with tools...");

		// Build base image first
		this.logger.info("Building base image...");
		const baseArgs = ["compose", "build"];
		if (options.noCache) {
			baseArgs.push("--no-cache");
		}
		await execa(
			"docker",
			baseArgs,
			this.getExecaOptions(),
		);

		// Get the base image name from docker-compose
		const baseImageName = `${IMAGE_NAME}:base`;

		// Tag the built image as base
		await execa("docker", ["tag", `${IMAGE_NAME}:latest`, baseImageName], {
			cwd: this.dockerDir,
			stdio: "pipe",
		});

		// Generate custom Dockerfile in config directory (writable even when package is npm installed)
		const customDockerfile = generateDockerfile(toolConfig, baseImageName);
		const customDockerfilePath = join(CONFIG_DIR, "Dockerfile.custom");
		if (!existsSync(CONFIG_DIR)) {
			mkdirSync(CONFIG_DIR, { recursive: true });
		}
		writeFileSync(customDockerfilePath, customDockerfile, "utf-8");
		this.logger.debug(`Generated ${customDockerfilePath}`);

		// Build custom image using the generated Dockerfile
		// Add label with tools hash for staleness detection
		const buildArgs = [
			"build",
			"-f", customDockerfilePath,
			"-t", `${IMAGE_NAME}:latest`,
		];
		if (options.noCache) {
			buildArgs.push("--no-cache");
		}
		if (toolsHash) {
			buildArgs.push("--label", `${TOOLS_HASH_LABEL}=${toolsHash}`);
		}
		buildArgs.push(".");

		this.logger.info("Building custom image with tools...");
		await execa("docker", buildArgs, this.getExecaOptions());

		this.logger.success("Custom Docker image built with tools");
	}

	/**
	 * Clean up custom Dockerfile if it exists
	 */
	cleanupCustomDockerfile(): void {
		const customDockerfilePath = join(CONFIG_DIR, "Dockerfile.custom");
		if (existsSync(customDockerfilePath)) {
			unlinkSync(customDockerfilePath);
			this.logger.debug("Cleaned up Dockerfile.custom");
		}
	}

	/**
	 * Check if the Docker image exists locally
	 */
	async imageExists(): Promise<boolean> {
		try {
			await execa("docker", ["image", "inspect", `${IMAGE_NAME}:latest`], {
				stdio: "pipe",
			});
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Get the tools hash label from the current image
	 * Returns null if image doesn't exist or has no tools hash label
	 */
	async getImageToolsHash(): Promise<string | null> {
		try {
			const result = await execa(
				"docker",
				["image", "inspect", `${IMAGE_NAME}:latest`, "--format", `{{index .Config.Labels "${TOOLS_HASH_LABEL}"}}`],
				{ stdio: "pipe" },
			);
			const hash = result.stdout.trim();
			return hash || null;
		} catch {
			return null;
		}
	}

	/**
	 * Check if the image needs to be rebuilt based on tools configuration
	 * Returns: { needsRebuild: boolean, reason: string }
	 */
	async checkImageStatus(currentToolsHash: string | null): Promise<{
		needsRebuild: boolean;
		reason: string;
	}> {
		// Check if image exists
		const exists = await this.imageExists();
		if (!exists) {
			return { needsRebuild: true, reason: "Image does not exist" };
		}

		// Get current image's tools hash
		const imageHash = await this.getImageToolsHash();

		// If no tools config, we're using the base image
		if (!currentToolsHash) {
			// Image exists and no tools config - might have been built with tools before
			if (imageHash) {
				return { needsRebuild: true, reason: "Tools configuration removed" };
			}
			return { needsRebuild: false, reason: "Image up to date (no tools)" };
		}

		// Tools config exists - check if hash matches
		if (!imageHash) {
			return { needsRebuild: true, reason: "Image missing tools hash label" };
		}

		if (imageHash !== currentToolsHash) {
			return { needsRebuild: true, reason: "Tools configuration changed" };
		}

		return { needsRebuild: false, reason: "Image up to date" };
	}

	/**
	 * Start containers with docker-compose
	 */
	async up(): Promise<void> {
		this.logger.info("Starting Docker containers...");
		await execa("docker", ["compose", "up", "-d"], this.getExecaOptions());
		this.logger.success("Docker containers started");
	}

	/**
	 * Stop containers with docker-compose
	 */
	async down(): Promise<void> {
		this.logger.info("Stopping Docker containers...");
		await execa("docker", ["compose", "down"], this.getExecaOptions());
		this.logger.success("Docker containers stopped");
	}

	/**
	 * Stream container logs
	 */
	async logs(options: LogsOptions = {}): Promise<void> {
		const args = ["compose", "logs"];

		if (options.follow) {
			args.push("-f");
		}

		if (options.lines) {
			args.push("-n", String(options.lines));
		}

		await execa("docker", args, this.getExecaOptions());
	}

	/**
	 * Execute a command inside the container
	 */
	async exec(
		command: string[],
		options: { interactive?: boolean } = {},
	): Promise<void> {
		const args = ["exec"];

		if (options.interactive) {
			args.push("-it");
		}

		args.push(CONTAINER_NAME, ...command);

		await execa("docker", args, {
			cwd: this.dockerDir,
			stdio: "inherit",
		});
	}

	/**
	 * Open an interactive shell in the container
	 */
	async shell(): Promise<void> {
		await this.exec(["bash"], { interactive: true });
	}

	/**
	 * Get container status
	 */
	async getStatus(): Promise<ContainerStatus> {
		try {
			const result = await execa("docker", ["inspect", CONTAINER_NAME], {
				stdio: "pipe",
			});

			const inspectData = JSON.parse(result.stdout) as DockerInspectResult[];
			const container = inspectData[0];

			if (!container) {
				return { running: false, health: "none" };
			}

			const running = container.State.Running;
			const healthStatus = container.State.Health?.Status ?? "none";
			const health: ContainerHealth = this.normalizeHealth(healthStatus);

			let uptimeSeconds: number | undefined;
			if (running && container.State.StartedAt) {
				const startedAt = new Date(container.State.StartedAt);
				uptimeSeconds = Math.floor((Date.now() - startedAt.getTime()) / 1000);
			}

			return {
				running,
				health,
				containerId: container.Id.slice(0, 12),
				uptimeSeconds,
			};
		} catch {
			return { running: false, health: "none" };
		}
	}

	/**
	 * Normalize health status string to ContainerHealth type
	 */
	private normalizeHealth(status: string): ContainerHealth {
		switch (status) {
			case "healthy":
				return "healthy";
			case "unhealthy":
				return "unhealthy";
			case "starting":
				return "starting";
			default:
				return "none";
		}
	}

	/**
	 * Wait for container to be healthy
	 */
	async waitForHealthy(
		timeout: number = CONTAINER_HEALTH_TIMEOUT,
		delay: number = CONTAINER_HEALTH_RETRY_DELAY,
	): Promise<void> {
		this.logger.info("Waiting for container to be healthy...");

		const startTime = Date.now();
		while (Date.now() - startTime < timeout) {
			const status = await this.getStatus();

			if (status.health === "healthy") {
				this.logger.success("Container is healthy");
				return;
			}

			if (!status.running) {
				throw new Error("Container stopped unexpectedly");
			}

			if (status.health === "unhealthy") {
				throw new Error("Container health check failed");
			}

			await this.sleep(delay);
		}

		throw new Error(
			`Timeout waiting for container to be healthy after ${timeout}ms`,
		);
	}

	/**
	 * Check if .env.docker file exists
	 */
	hasEnvFile(): boolean {
		return existsSync(this.getPath(".env.docker"));
	}

	/**
	 * Read the current .env.docker file
	 */
	readEnvFile(): EnvConfig {
		const envPath = this.getPath(".env.docker");
		if (!existsSync(envPath)) {
			return {};
		}

		const content = readFileSync(envPath, "utf-8");
		const config: EnvConfig = {};

		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) {
				continue;
			}

			const [key, ...valueParts] = trimmed.split("=");
			if (key) {
				config[key as keyof EnvConfig] = valueParts.join("=");
			}
		}

		return config;
	}

	/**
	 * Write the .env.docker file
	 */
	writeEnvFile(config: EnvConfig): void {
		const envPath = this.getPath(".env.docker");

		// Read the example file to preserve comments and structure
		const examplePath = this.getPath(".env.docker.example");
		let content = existsSync(examplePath)
			? readFileSync(examplePath, "utf-8")
			: "";

		// Replace values in content
		for (const [key, value] of Object.entries(config)) {
			if (value) {
				// Replace existing line or add at the end
				const regex = new RegExp(`^${key}=.*$`, "m");
				if (regex.test(content)) {
					content = content.replace(regex, `${key}=${value}`);
				} else {
					content += `\n${key}=${value}`;
				}
			}
		}

		writeFileSync(envPath, content, "utf-8");
		this.logger.success(`Wrote ${envPath}`);
	}

	/**
	 * Update a single value in .env.docker
	 */
	updateEnvValue(key: keyof EnvConfig, value: string): void {
		const config = this.readEnvFile();
		config[key] = value;
		this.writeEnvFile(config);
	}

	/**
	 * Get the docker directory path
	 */
	getDockerDir(): string {
		return this.dockerDir;
	}

	/**
	 * Format uptime from seconds to human-readable string
	 */
	formatUptime(seconds: number): string {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);

		if (hours > 0) {
			return `${hours}h ${minutes}m`;
		}
		return `${minutes}m`;
	}

	/**
	 * Sleep for specified milliseconds
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
