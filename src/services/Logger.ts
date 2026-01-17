/**
 * ANSI color codes for terminal output
 */
const colors = {
	reset: "\x1b[0m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
	gray: "\x1b[90m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
} as const;

/**
 * Simple colored console logger for cyrus-docker CLI
 */
export class Logger {
	private prefix: string;

	constructor(prefix = "cyrus-docker") {
		this.prefix = prefix;
	}

	/**
	 * Info message (blue)
	 */
	info(message: string): void {
		console.log(`${colors.blue}[${this.prefix}]${colors.reset} ${message}`);
	}

	/**
	 * Success message (green with checkmark)
	 */
	success(message: string): void {
		console.log(
			`${colors.green}[${this.prefix}]${colors.reset} ${colors.green}✓${colors.reset} ${message}`,
		);
	}

	/**
	 * Warning message (yellow)
	 */
	warn(message: string): void {
		console.warn(
			`${colors.yellow}[${this.prefix}]${colors.reset} ${colors.yellow}⚠${colors.reset} ${message}`,
		);
	}

	/**
	 * Error message (red)
	 */
	error(message: string): void {
		console.error(
			`${colors.red}[${this.prefix}]${colors.reset} ${colors.red}✗${colors.reset} ${message}`,
		);
	}

	/**
	 * Debug message (gray)
	 */
	debug(message: string): void {
		if (process.env.DEBUG) {
			console.log(
				`${colors.gray}[${this.prefix}] [debug]${colors.reset} ${message}`,
			);
		}
	}

	/**
	 * Raw output without prefix
	 */
	raw(message: string): void {
		console.log(message);
	}

	/**
	 * Print a blank line
	 */
	blank(): void {
		console.log();
	}

	/**
	 * Print a divider line
	 */
	divider(length = 50): void {
		console.log(`${colors.dim}${"─".repeat(length)}${colors.reset}`);
	}

	/**
	 * Print a header with dividers
	 */
	header(title: string): void {
		this.blank();
		this.raw(`${colors.bold}${title}${colors.reset}`);
		this.divider(title.length + 10);
	}

	/**
	 * Print a key-value pair
	 */
	keyValue(key: string, value: string, keyWidth = 12): void {
		const paddedKey = key.padEnd(keyWidth);
		this.raw(`  ${colors.cyan}${paddedKey}${colors.reset} ${value}`);
	}

	/**
	 * Print a status indicator
	 */
	status(label: string, isOk: boolean, details?: string): void {
		const indicator = isOk
			? `${colors.green}✓${colors.reset}`
			: `${colors.red}✗${colors.reset}`;
		const detailText = details
			? ` ${colors.dim}(${details})${colors.reset}`
			: "";
		this.raw(`  ${indicator} ${label}${detailText}`);
	}

	/**
	 * Print a spinner-style waiting message
	 */
	waiting(message: string): void {
		process.stdout.write(
			`${colors.blue}[${this.prefix}]${colors.reset} ${colors.cyan}◌${colors.reset} ${message}...`,
		);
	}

	/**
	 * Clear the current line (for use after waiting)
	 */
	clearLine(): void {
		process.stdout.write("\r\x1b[K");
	}
}

/**
 * Default logger instance
 */
export const logger = new Logger();
