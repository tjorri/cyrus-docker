/**
 * Persisted state for cyrus-docker CLI
 */
export interface DockerCLIState {
	/** Version of the state schema */
	version: string;
	/** Whether Cyrus is currently running */
	isRunning: boolean;
	/** PID of the ngrok process */
	ngrokPid?: number;
	/** Active ngrok tunnel URL */
	tunnelUrl?: string;
	/** Timestamp when Cyrus was started */
	startedAt?: string;
	/** Path to the docker directory being used */
	dockerDir?: string;
}

/**
 * Environment configuration collected during init
 */
export interface EnvConfig {
	/** Anthropic API key for Claude */
	ANTHROPIC_API_KEY?: string;
	/** Claude Code OAuth token (alternative to API key) */
	CLAUDE_CODE_OAUTH_TOKEN?: string;
	/** Linear OAuth Client ID */
	LINEAR_CLIENT_ID?: string;
	/** Linear OAuth Client Secret */
	LINEAR_CLIENT_SECRET?: string;
	/** Linear webhook signing secret */
	LINEAR_WEBHOOK_SECRET?: string;
	/** Enable direct webhooks mode */
	LINEAR_DIRECT_WEBHOOKS?: string;
	/** External URL for Linear callbacks (ngrok URL) */
	CYRUS_BASE_URL?: string;
	/** ngrok authtoken */
	NGROK_AUTHTOKEN?: string;
	/** Git user name */
	GIT_USER_NAME?: string;
	/** Git user email */
	GIT_USER_EMAIL?: string;
	/** GitHub personal access token */
	GITHUB_TOKEN?: string;
	/** Cyrus server port */
	CYRUS_SERVER_PORT?: string;
	/** Host path to cyrus home directory (for container symlink) */
	CYRUS_HOST_PATH?: string;
}

/**
 * Container health status
 */
export type ContainerHealth = "healthy" | "unhealthy" | "starting" | "none";

/**
 * Docker container status
 */
export interface ContainerStatus {
	/** Whether the container is running */
	running: boolean;
	/** Health check status */
	health: ContainerHealth;
	/** Container ID if running */
	containerId?: string;
	/** Container uptime in seconds */
	uptimeSeconds?: number;
}

/**
 * Tunnel status
 */
export interface TunnelStatus {
	/** Whether the tunnel is running */
	isRunning: boolean;
	/** Public tunnel URL */
	url?: string;
	/** ngrok process PID */
	pid?: number;
}

/**
 * Combined status for the status command
 */
export interface CyrusStatus {
	container: ContainerStatus;
	tunnel: TunnelStatus;
}

/**
 * Options for the logs command
 */
export interface LogsOptions {
	/** Follow log output */
	follow?: boolean;
	/** Number of lines to show */
	lines?: number;
}

/**
 * Options for the start command
 */
export interface StartOptions {
	/** Run in detached mode (don't follow logs) */
	detach?: boolean;
	/** Force rebuild of the Docker image */
	build?: boolean;
}

/**
 * Available tool presets for container customization
 */
export type ToolPreset =
	| "python"
	| "rust"
	| "go"
	| "ruby"
	| "java"
	| "aws"
	| "k8s"
	| "terraform";

/**
 * Tool configuration for customizing container development tools
 */
export interface ToolConfig {
	/** Named tool presets to install */
	presets?: ToolPreset[];
	/** Additional APT packages to install */
	apt?: string[];
	/** npm packages to install globally */
	npm?: string[];
	/** Python packages to install via pip */
	pip?: string[];
	/** Rust crates to install via cargo */
	cargo?: string[];
	/** Custom shell commands to run during build */
	commands?: string[];
	/** Path to custom Dockerfile (advanced) */
	customDockerfile?: string;
}

/**
 * Definition of what a preset installs
 */
export interface PresetDefinition {
	/** Human-readable name */
	name: string;
	/** Description shown in selection UI */
	description: string;
	/** APT packages to install */
	apt?: string[];
	/** npm packages to install globally */
	npm?: string[];
	/** pip packages to install */
	pip?: string[];
	/** cargo crates to install */
	cargo?: string[];
	/** Custom commands to run */
	commands?: string[];
}
