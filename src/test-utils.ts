import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Logger } from "./services/Logger.js";

/**
 * Mock logger that no-ops (prevents console spam in tests)
 */
export function createMockLogger(): Logger {
	const noop = () => {};
	return {
		info: noop,
		success: noop,
		warn: noop,
		error: noop,
		debug: noop,
		header: noop,
		blank: noop,
		divider: noop,
		keyValue: noop,
		status: noop,
		raw: noop,
		waiting: noop,
		clearLine: noop,
	} as unknown as Logger;
}

/**
 * Run test with isolated temp directory, cleanup after
 */
export async function withTempDir(
	fn: (dir: string) => Promise<void>,
): Promise<void> {
	const dir = await mkdtemp(join(tmpdir(), "cyrus-docker-test-"));
	try {
		await fn(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}
