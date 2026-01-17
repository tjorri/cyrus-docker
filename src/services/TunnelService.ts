import { type ChildProcess, spawn } from "node:child_process";
import { execa } from "execa";
import {
	DEFAULT_PORT,
	NGROK_MAX_RETRIES,
	NGROK_RETRY_DELAY,
	NGROK_TUNNELS_API,
} from "../config/constants.js";
import type { TunnelStatus } from "../config/types.js";
import type { Logger } from "./Logger.js";

/**
 * Response from ngrok's local API
 */
interface NgrokTunnelsResponse {
	tunnels: Array<{
		name: string;
		uri: string;
		public_url: string;
		proto: string;
		config: {
			addr: string;
			inspect: boolean;
		};
	}>;
}

/**
 * Manages ngrok tunnel for exposing Cyrus to the internet
 */
export class TunnelService {
	constructor(private logger: Logger) {}

	/**
	 * Start ngrok tunnel on the specified port
	 */
	async start(port: number = DEFAULT_PORT): Promise<ChildProcess> {
		this.logger.info(`Starting ngrok tunnel on port ${port}...`);

		// Check if ngrok is installed
		try {
			await execa("which", ["ngrok"]);
		} catch {
			throw new Error(
				"ngrok is not installed. Install it from https://ngrok.com/download",
			);
		}

		// Use native spawn for detached process (execa's Promise behavior can cause issues)
		const subprocess = spawn("ngrok", ["http", String(port)], {
			detached: true,
			stdio: "ignore",
		});

		// Unref to allow parent process to exit independently
		subprocess.unref();

		this.logger.success(`ngrok process started with PID ${subprocess.pid}`);

		return subprocess;
	}

	/**
	 * Wait for ngrok to be ready and return the public URL
	 */
	async waitForUrl(
		maxRetries: number = NGROK_MAX_RETRIES,
		delay: number = NGROK_RETRY_DELAY,
	): Promise<string> {
		this.logger.info("Waiting for ngrok tunnel to be ready...");

		for (let i = 0; i < maxRetries; i++) {
			const url = await this.getUrl();
			if (url) {
				this.logger.success(`Tunnel ready: ${url}`);
				return url;
			}

			await this.sleep(delay);
		}

		throw new Error(
			`Timeout waiting for ngrok tunnel after ${maxRetries * delay}ms`,
		);
	}

	/**
	 * Get the current tunnel URL from ngrok's local API
	 */
	async getUrl(): Promise<string | null> {
		try {
			const response = await fetch(NGROK_TUNNELS_API);
			if (!response.ok) {
				return null;
			}

			const data = (await response.json()) as NgrokTunnelsResponse;

			// Find HTTPS tunnel
			const httpsTunnel = data.tunnels.find((t) => t.proto === "https");
			if (httpsTunnel) {
				return httpsTunnel.public_url;
			}

			// Fall back to any tunnel
			if (data.tunnels.length > 0) {
				return data.tunnels[0]?.public_url ?? null;
			}

			return null;
		} catch {
			return null;
		}
	}

	/**
	 * Stop ngrok tunnel by PID
	 */
	async stop(pid: number): Promise<void> {
		this.logger.info(`Stopping ngrok process (PID: ${pid})...`);

		try {
			process.kill(pid, "SIGTERM");
			this.logger.success("ngrok process stopped");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ESRCH") {
				this.logger.warn("ngrok process was already stopped");
			} else {
				throw error;
			}
		}
	}

	/**
	 * Get the current tunnel status
	 */
	async getStatus(): Promise<TunnelStatus> {
		const url = await this.getUrl();
		return {
			isRunning: url !== null,
			url: url ?? undefined,
		};
	}

	/**
	 * Check if ngrok is running by checking its API
	 */
	async isRunning(): Promise<boolean> {
		const status = await this.getStatus();
		return status.isRunning;
	}

	/**
	 * Check if a process with the given PID is running
	 */
	isProcessRunning(pid: number): boolean {
		try {
			// Sending signal 0 checks if process exists without killing it
			process.kill(pid, 0);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Sleep for the specified number of milliseconds
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
