import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DockerService } from "./services/DockerService.js";
import { Logger } from "./services/Logger.js";
import { StateService } from "./services/StateService.js";
import { TunnelService } from "./services/TunnelService.js";

/**
 * Main application context for cyrus-docker CLI
 * Provides access to services and shared configuration
 */
export class Application {
	public readonly logger: Logger;
	public readonly state: StateService;
	public readonly tunnel: TunnelService;
	public readonly docker: DockerService;
	public readonly version: string;
	public readonly dockerDir: string;

	constructor(version: string) {
		this.logger = new Logger();
		this.version = version;

		// Resolve the bundled docker directory
		this.dockerDir = this.resolveDockerDir();

		// Initialize services
		this.state = new StateService(this.logger);
		this.tunnel = new TunnelService(this.logger);
		this.docker = new DockerService(this.dockerDir, this.logger);
	}

	/**
	 * Resolve the path to the bundled docker directory
	 * When installed via npm, this will be in the package's docker/ folder
	 */
	private resolveDockerDir(): string {
		// Get the directory of the current module
		const __filename = fileURLToPath(import.meta.url);
		const __dirname = dirname(__filename);

		// When compiled: dist/Application.js -> go up to package root -> docker/
		const packageRoot = join(__dirname, "..");
		const dockerDir = join(packageRoot, "docker");

		if (existsSync(dockerDir)) {
			return dockerDir;
		}

		throw new Error(`Docker directory not found. Expected at: ${dockerDir}`);
	}

	/**
	 * Get a docker service with a custom docker directory
	 * Useful when user wants to use a different docker setup
	 */
	getDockerService(customDir?: string): DockerService {
		return customDir ? new DockerService(customDir, this.logger) : this.docker;
	}

	/**
	 * Check prerequisites for running cyrus-docker
	 */
	async checkPrerequisites(): Promise<{
		docker: boolean;
		dockerCompose: boolean;
		ngrok: boolean;
	}> {
		const docker = await this.docker.checkDocker();
		const dockerCompose = await this.docker.checkDockerCompose();
		const ngrok = await this.checkNgrok();

		return { docker, dockerCompose, ngrok };
	}

	/**
	 * Check if ngrok is installed
	 */
	private async checkNgrok(): Promise<boolean> {
		try {
			const { execa } = await import("execa");
			await execa("which", ["ngrok"], { stdio: "pipe" });
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Print prerequisite status
	 */
	printPrerequisiteStatus(prereqs: {
		docker: boolean;
		dockerCompose: boolean;
		ngrok: boolean;
	}): void {
		this.logger.header("Prerequisites");
		this.logger.status("Docker", prereqs.docker);
		this.logger.status("Docker Compose", prereqs.dockerCompose);
		this.logger.status("ngrok", prereqs.ngrok);
		this.logger.blank();
	}

	/**
	 * Check if all prerequisites are met
	 */
	allPrerequisitesMet(prereqs: {
		docker: boolean;
		dockerCompose: boolean;
		ngrok: boolean;
	}): boolean {
		return prereqs.docker && prereqs.dockerCompose && prereqs.ngrok;
	}

	/**
	 * Print missing prerequisites instructions
	 */
	printMissingPrerequisites(prereqs: {
		docker: boolean;
		dockerCompose: boolean;
		ngrok: boolean;
	}): void {
		if (!prereqs.docker || !prereqs.dockerCompose) {
			this.logger.error("Docker is not installed or not running");
			this.logger.raw("  Install from: https://docs.docker.com/get-docker/");
		}
		if (!prereqs.ngrok) {
			this.logger.error("ngrok is not installed");
			this.logger.raw("  Install from: https://ngrok.com/download");
		}
	}
}
