import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createMockLogger, withTempDir } from "../test-utils.js";
import { StateService } from "./StateService.js";

describe("StateService", () => {
	describe("load", () => {
		it("creates default state when file does not exist", async () => {
			await withTempDir(async (dir) => {
				const service = new StateService(createMockLogger(), {
					configDir: dir,
					stateFile: join(dir, "state.json"),
				});

				expect(service.isRunning()).toBe(false);
				expect(service.getNgrokPid()).toBeUndefined();
				expect(service.getTunnelUrl()).toBeUndefined();
			});
		});

		it("reads existing state file correctly", async () => {
			await withTempDir(async (dir) => {
				const stateFile = join(dir, "state.json");

				// Create existing state file
				const existingState = {
					version: "1.0",
					isRunning: true,
					ngrokPid: 12345,
					tunnelUrl: "https://example.ngrok.io",
					startedAt: "2024-01-01T00:00:00.000Z",
					dockerDir: "/path/to/docker",
				};
				writeFileSync(stateFile, JSON.stringify(existingState), "utf-8");

				const service = new StateService(createMockLogger(), {
					configDir: dir,
					stateFile,
				});

				expect(service.isRunning()).toBe(true);
				expect(service.getNgrokPid()).toBe(12345);
				expect(service.getTunnelUrl()).toBe("https://example.ngrok.io");
				expect(service.getDockerDir()).toBe("/path/to/docker");
			});
		});

		it("returns default state when file is invalid JSON", async () => {
			await withTempDir(async (dir) => {
				const stateFile = join(dir, "state.json");

				// Create invalid JSON file
				writeFileSync(stateFile, "not valid json {{{", "utf-8");

				const service = new StateService(createMockLogger(), {
					configDir: dir,
					stateFile,
				});

				expect(service.isRunning()).toBe(false);
			});
		});
	});

	describe("save", () => {
		it("writes state to disk", async () => {
			await withTempDir(async (dir) => {
				const stateFile = join(dir, "state.json");
				const service = new StateService(createMockLogger(), {
					configDir: dir,
					stateFile,
				});

				service.save();

				expect(existsSync(stateFile)).toBe(true);

				const content = readFileSync(stateFile, "utf-8");
				const parsed = JSON.parse(content);
				expect(parsed.version).toBe("1.0");
				expect(parsed.isRunning).toBe(false);
			});
		});

		it("creates config directory if it does not exist", async () => {
			await withTempDir(async (dir) => {
				const nestedDir = join(dir, "nested", "config");
				const stateFile = join(nestedDir, "state.json");

				const service = new StateService(createMockLogger(), {
					configDir: nestedDir,
					stateFile,
				});

				service.save();

				expect(existsSync(nestedDir)).toBe(true);
				expect(existsSync(stateFile)).toBe(true);
			});
		});
	});

	describe("setRunning", () => {
		it("updates state with ngrok PID, tunnel URL, and dockerDir", async () => {
			await withTempDir(async (dir) => {
				const stateFile = join(dir, "state.json");
				const service = new StateService(createMockLogger(), {
					configDir: dir,
					stateFile,
				});

				service.setRunning(9999, "https://test.ngrok.io", "/docker/dir");

				expect(service.isRunning()).toBe(true);
				expect(service.getNgrokPid()).toBe(9999);
				expect(service.getTunnelUrl()).toBe("https://test.ngrok.io");
				expect(service.getDockerDir()).toBe("/docker/dir");
				expect(service.getStartedAt()).toBeInstanceOf(Date);

				// Verify persisted to disk
				const content = readFileSync(stateFile, "utf-8");
				const parsed = JSON.parse(content);
				expect(parsed.isRunning).toBe(true);
				expect(parsed.ngrokPid).toBe(9999);
			});
		});
	});

	describe("setStopped", () => {
		it("clears running state", async () => {
			await withTempDir(async (dir) => {
				const stateFile = join(dir, "state.json");
				const service = new StateService(createMockLogger(), {
					configDir: dir,
					stateFile,
				});

				// First set running
				service.setRunning(9999, "https://test.ngrok.io", "/docker/dir");
				expect(service.isRunning()).toBe(true);

				// Then stop
				service.setStopped();

				expect(service.isRunning()).toBe(false);
				expect(service.getNgrokPid()).toBeUndefined();
				expect(service.getTunnelUrl()).toBeUndefined();
				expect(service.getDockerDir()).toBeUndefined();
				expect(service.getStartedAt()).toBeUndefined();
			});
		});
	});

	describe("get", () => {
		it("returns a copy of the state", async () => {
			await withTempDir(async (dir) => {
				const service = new StateService(createMockLogger(), {
					configDir: dir,
					stateFile: join(dir, "state.json"),
				});

				const state = service.get();
				expect(state.version).toBe("1.0");
				expect(state.isRunning).toBe(false);

				// Modifying returned object should not affect internal state
				state.isRunning = true;
				expect(service.isRunning()).toBe(false);
			});
		});
	});

	describe("reset", () => {
		it("resets state to default", async () => {
			await withTempDir(async (dir) => {
				const service = new StateService(createMockLogger(), {
					configDir: dir,
					stateFile: join(dir, "state.json"),
				});

				service.setRunning(9999, "https://test.ngrok.io", "/docker/dir");
				expect(service.isRunning()).toBe(true);

				service.reset();

				expect(service.isRunning()).toBe(false);
				expect(service.getNgrokPid()).toBeUndefined();
			});
		});
	});

	describe("getConfigDir", () => {
		it("returns the configured config directory", async () => {
			await withTempDir(async (dir) => {
				const service = new StateService(createMockLogger(), {
					configDir: dir,
					stateFile: join(dir, "state.json"),
				});

				expect(service.getConfigDir()).toBe(dir);
			});
		});
	});
});
