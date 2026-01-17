import { homedir } from "node:os";
import { join } from "node:path";
import type { PresetDefinition, ToolPreset } from "./types.js";

/** Default port for Cyrus server */
export const DEFAULT_PORT = 3456;

/** ngrok API port for checking tunnel status */
export const NGROK_API_PORT = 4040;

/** Default timeout for ngrok tunnel startup (ms) */
export const NGROK_STARTUP_TIMEOUT = 30_000;

/** Retry delay for ngrok tunnel startup (ms) */
export const NGROK_RETRY_DELAY = 1_000;

/** Max retries for ngrok tunnel startup */
export const NGROK_MAX_RETRIES = 30;

/** Default timeout for container health check (ms) */
export const CONTAINER_HEALTH_TIMEOUT = 120_000;

/** Retry delay for container health check (ms) */
export const CONTAINER_HEALTH_RETRY_DELAY = 2_000;

/** Docker container name */
export const CONTAINER_NAME = "cyrus";

/** Docker compose service name */
export const SERVICE_NAME = "cyrus";

/** Docker image name (as defined in docker-compose.yml) */
export const IMAGE_NAME = "cyrus-ai/cyrus";

/** Docker label for storing tools configuration hash */
export const TOOLS_HASH_LABEL = "cyrus-docker.tools-hash";

/** State file version */
export const STATE_VERSION = "1.0";

/** Path to cyrus-docker config directory */
export const CONFIG_DIR = join(homedir(), ".cyrus-docker");

/** Path to state file */
export const STATE_FILE = join(CONFIG_DIR, "state.json");

/** Default number of log lines to show */
export const DEFAULT_LOG_LINES = 100;

/** ngrok tunnels API endpoint */
export const NGROK_TUNNELS_API = `http://localhost:${NGROK_API_PORT}/api/tunnels`;

/** Path to tools configuration file */
export const TOOLS_CONFIG_FILE = join(CONFIG_DIR, "tools.yml");

/** Tool preset definitions */
export const TOOL_PRESETS: Record<ToolPreset, PresetDefinition> = {
	python: {
		name: "Python",
		description: "Python 3, pip, venv, pytest, black, ruff",
		apt: ["python3", "python3-pip", "python3-venv"],
		pip: ["pytest", "black", "ruff"],
	},
	rust: {
		name: "Rust",
		description: "Rust toolchain + cargo",
		commands: [
			"curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y",
		],
	},
	go: {
		name: "Go",
		description: "Go programming language",
		apt: ["golang-go"],
	},
	ruby: {
		name: "Ruby",
		description: "Ruby + Bundler",
		apt: ["ruby-full"],
		commands: ["gem install bundler"],
	},
	java: {
		name: "Java",
		description: "OpenJDK 17 + Maven",
		apt: ["openjdk-17-jdk", "maven"],
	},
	aws: {
		name: "AWS CLI",
		description: "AWS CLI v2",
		commands: [
			'curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "/tmp/awscliv2.zip"',
			"unzip -q /tmp/awscliv2.zip -d /tmp",
			"/tmp/aws/install",
			"rm -rf /tmp/awscliv2.zip /tmp/aws",
		],
		apt: ["unzip"],
	},
	k8s: {
		name: "Kubernetes",
		description: "kubectl + helm",
		commands: [
			"curl -LO https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl",
			"install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl",
			"rm kubectl",
			"curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash",
		],
	},
	terraform: {
		name: "Terraform",
		description: "HashiCorp Terraform",
		commands: [
			"curl -fsSL https://apt.releases.hashicorp.com/gpg | gpg --dearmor -o /etc/apt/keyrings/hashicorp-archive-keyring.gpg",
			'echo "deb [signed-by=/etc/apt/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com bookworm main" > /etc/apt/sources.list.d/hashicorp.list',
			"apt-get update",
			"apt-get install -y terraform",
		],
	},
};
