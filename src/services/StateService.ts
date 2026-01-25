import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
	CONFIG_DIR,
	STATE_FILE,
	STATE_VERSION,
} from "../config/constants.js";
import type { DockerCLIState } from "../config/types.js";
import type { Logger } from "./Logger.js";

/**
 * Options for StateService
 */
export interface StateServiceOptions {
	/** Directory for config files (defaults to ~/.cyrus-docker) */
	configDir?: string;
	/** Path to state file (defaults to ~/.cyrus-docker/state.json) */
	stateFile?: string;
}

/**
 * Manages persistent state for cyrus-docker CLI
 * State is stored in ~/.cyrus-docker/state.json
 */
export class StateService {
	private state: DockerCLIState;
	private readonly configDir: string;
	private readonly stateFile: string;

	constructor(
		private logger: Logger,
		options: StateServiceOptions = {},
	) {
		this.configDir = options.configDir ?? CONFIG_DIR;
		this.stateFile = options.stateFile ?? STATE_FILE;
		this.state = this.load();
	}

	/**
	 * Load state from disk, returning default state if not found
	 */
	private load(): DockerCLIState {
		try {
			if (existsSync(this.stateFile)) {
				const content = readFileSync(this.stateFile, "utf-8");
				const parsed = JSON.parse(content) as DockerCLIState;
				this.logger.debug(`Loaded state from ${this.stateFile}`);
				return parsed;
			}
		} catch (error) {
			this.logger.debug(`Failed to load state: ${error}`);
		}

		return this.getDefaultState();
	}

	/**
	 * Get default/empty state
	 */
	private getDefaultState(): DockerCLIState {
		return {
			version: STATE_VERSION,
			isRunning: false,
		};
	}

	/**
	 * Save current state to disk
	 */
	save(): void {
		try {
			// Ensure config directory exists
			if (!existsSync(this.configDir)) {
				mkdirSync(this.configDir, { recursive: true });
			}

			writeFileSync(
				this.stateFile,
				JSON.stringify(this.state, null, 2),
				"utf-8",
			);
			this.logger.debug(`Saved state to ${this.stateFile}`);
		} catch (error) {
			this.logger.error(`Failed to save state: ${error}`);
		}
	}

	/**
	 * Get the current state
	 */
	get(): DockerCLIState {
		return { ...this.state };
	}

	/**
	 * Update state with partial values
	 */
	update(updates: Partial<DockerCLIState>): void {
		this.state = { ...this.state, ...updates };
		this.save();
	}

	/**
	 * Mark Cyrus as running
	 */
	setRunning(ngrokPid: number, tunnelUrl: string, dockerDir: string): void {
		this.update({
			isRunning: true,
			ngrokPid,
			tunnelUrl,
			startedAt: new Date().toISOString(),
			dockerDir,
		});
	}

	/**
	 * Mark Cyrus as stopped
	 */
	setStopped(): void {
		this.update({
			isRunning: false,
			ngrokPid: undefined,
			tunnelUrl: undefined,
			startedAt: undefined,
			dockerDir: undefined,
		});
	}

	/**
	 * Check if Cyrus is marked as running
	 */
	isRunning(): boolean {
		return this.state.isRunning;
	}

	/**
	 * Get the ngrok PID if running
	 */
	getNgrokPid(): number | undefined {
		return this.state.ngrokPid;
	}

	/**
	 * Get the tunnel URL if running
	 */
	getTunnelUrl(): string | undefined {
		return this.state.tunnelUrl;
	}

	/**
	 * Get the docker directory being used
	 */
	getDockerDir(): string | undefined {
		return this.state.dockerDir;
	}

	/**
	 * Get the started timestamp
	 */
	getStartedAt(): Date | undefined {
		return this.state.startedAt ? new Date(this.state.startedAt) : undefined;
	}

	/**
	 * Reset state to default
	 */
	reset(): void {
		this.state = this.getDefaultState();
		this.save();
	}

	/**
	 * Get the config directory path
	 */
	getConfigDir(): string {
		return this.configDir;
	}
}
