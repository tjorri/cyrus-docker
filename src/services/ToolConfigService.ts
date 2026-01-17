import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parse, stringify } from "yaml";
import { CONFIG_DIR, TOOLS_CONFIG_FILE, TOOL_PRESETS } from "../config/constants.js";
import type { ToolConfig, ToolPreset } from "../config/types.js";
import type { Logger } from "./Logger.js";

/**
 * Resolved tool configuration with all presets expanded
 */
export interface ResolvedToolConfig {
	apt: string[];
	npm: string[];
	pip: string[];
	cargo: string[];
	commands: string[];
	customDockerfile?: string;
}

/**
 * Manages tool configuration for container customization
 */
export class ToolConfigService {
	constructor(private logger: Logger) {}

	/**
	 * Check if tools.yml configuration exists
	 */
	hasConfig(): boolean {
		return existsSync(TOOLS_CONFIG_FILE);
	}

	/**
	 * Read the tools configuration from ~/.cyrus-docker/tools.yml
	 */
	readConfig(): ToolConfig | null {
		if (!this.hasConfig()) {
			return null;
		}

		try {
			const content = readFileSync(TOOLS_CONFIG_FILE, "utf-8");
			const config = parse(content) as ToolConfig;
			this.logger.debug(`Loaded tool config from ${TOOLS_CONFIG_FILE}`);
			return config;
		} catch (error) {
			this.logger.warn(`Failed to parse tools.yml: ${error}`);
			return null;
		}
	}

	/**
	 * Write the tools configuration to ~/.cyrus-docker/tools.yml
	 */
	writeConfig(config: ToolConfig): void {
		// Ensure config directory exists
		const configDir = dirname(TOOLS_CONFIG_FILE);
		if (!existsSync(configDir)) {
			mkdirSync(configDir, { recursive: true });
		}

		const content = stringify(config, { lineWidth: 0 });
		writeFileSync(TOOLS_CONFIG_FILE, content, "utf-8");
		this.logger.success(`Configuration saved to ${TOOLS_CONFIG_FILE}`);
	}

	/**
	 * Resolve presets and merge all tool configurations into a single resolved config
	 */
	resolveConfig(config: ToolConfig): ResolvedToolConfig {
		const resolved: ResolvedToolConfig = {
			apt: [],
			npm: [],
			pip: [],
			cargo: [],
			commands: [],
			customDockerfile: config.customDockerfile,
		};

		// Expand presets first
		if (config.presets) {
			for (const preset of config.presets) {
				const definition = TOOL_PRESETS[preset];
				if (definition) {
					if (definition.apt) resolved.apt.push(...definition.apt);
					if (definition.npm) resolved.npm.push(...definition.npm);
					if (definition.pip) resolved.pip.push(...definition.pip);
					if (definition.cargo) resolved.cargo.push(...definition.cargo);
					if (definition.commands) resolved.commands.push(...definition.commands);
				} else {
					this.logger.warn(`Unknown preset: ${preset}`);
				}
			}
		}

		// Add user-specified packages
		if (config.apt) resolved.apt.push(...config.apt);
		if (config.npm) resolved.npm.push(...config.npm);
		if (config.pip) resolved.pip.push(...config.pip);
		if (config.cargo) resolved.cargo.push(...config.cargo);
		if (config.commands) resolved.commands.push(...config.commands);

		// Deduplicate arrays
		resolved.apt = [...new Set(resolved.apt)];
		resolved.npm = [...new Set(resolved.npm)];
		resolved.pip = [...new Set(resolved.pip)];
		resolved.cargo = [...new Set(resolved.cargo)];

		return resolved;
	}

	/**
	 * Generate Dockerfile content for the resolved configuration
	 */
	generateDockerfile(config: ResolvedToolConfig, baseImage: string): string {
		const lines: string[] = [
			"# Auto-generated from ~/.cyrus-docker/tools.yml",
			"# Do not edit - regenerated on each build",
			`FROM ${baseImage}`,
			"",
		];

		// APT packages
		if (config.apt.length > 0) {
			lines.push("# Install APT packages");
			lines.push(`RUN apt-get update && apt-get install -y --no-install-recommends \\`);
			for (let i = 0; i < config.apt.length; i++) {
				const isLast = i === config.apt.length - 1;
				lines.push(`    ${config.apt[i]}${isLast ? " \\" : " \\"}`);
			}
			lines.push("    && rm -rf /var/lib/apt/lists/*");
			lines.push("");
		}

		// pip packages
		if (config.pip.length > 0) {
			lines.push("# Install Python packages");
			lines.push(`RUN pip3 install --no-cache-dir ${config.pip.join(" ")}`);
			lines.push("");
		}

		// npm packages
		if (config.npm.length > 0) {
			lines.push("# Install global npm packages");
			lines.push(`RUN npm install -g ${config.npm.join(" ")}`);
			lines.push("");
		}

		// cargo packages
		if (config.cargo.length > 0) {
			lines.push("# Install Rust crates");
			lines.push(`RUN cargo install ${config.cargo.join(" ")}`);
			lines.push("");
		}

		// Custom commands
		if (config.commands.length > 0) {
			lines.push("# Custom commands");
			for (const cmd of config.commands) {
				lines.push(`RUN ${cmd}`);
			}
			lines.push("");
		}

		return lines.join("\n");
	}

	/**
	 * Check if the resolved config has any tools to install
	 */
	hasTools(config: ResolvedToolConfig): boolean {
		return (
			config.apt.length > 0 ||
			config.npm.length > 0 ||
			config.pip.length > 0 ||
			config.cargo.length > 0 ||
			config.commands.length > 0 ||
			config.customDockerfile !== undefined
		);
	}

	/**
	 * Get all available presets with their descriptions
	 */
	getAvailablePresets(): Array<{ value: ToolPreset; name: string; description: string }> {
		return (Object.entries(TOOL_PRESETS) as Array<[ToolPreset, typeof TOOL_PRESETS[ToolPreset]]>).map(
			([key, def]) => ({
				value: key,
				name: def.name,
				description: def.description,
			})
		);
	}

	/**
	 * Get the config directory path
	 */
	getConfigDir(): string {
		return CONFIG_DIR;
	}

	/**
	 * Get the config file path
	 */
	getConfigFilePath(): string {
		return TOOLS_CONFIG_FILE;
	}

	/**
	 * Get a hash of the current tools configuration
	 * Returns null if no config exists, or a SHA256 hash of the config content
	 */
	getConfigHash(): string | null {
		if (!this.hasConfig()) {
			return null;
		}

		try {
			const content = readFileSync(TOOLS_CONFIG_FILE, "utf-8");
			return createHash("sha256").update(content).digest("hex").slice(0, 16);
		} catch {
			return null;
		}
	}
}
