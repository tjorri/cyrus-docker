import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockLogger, withTempDir } from "../test-utils.js";
import { DockerService } from "./DockerService.js";

// Mock execa
vi.mock("execa", () => ({
	execa: vi.fn(),
}));

describe("DockerService", () => {
	let service: DockerService;
	let dockerDir: string;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("checkDocker", () => {
		it("returns true when docker is available", async () => {
			await withTempDir(async (dir) => {
				dockerDir = dir;
				service = new DockerService(dir, createMockLogger());

				const { execa } = await import("execa");
				vi.mocked(execa).mockResolvedValueOnce({} as never);

				const result = await service.checkDocker();
				expect(result).toBe(true);
				expect(execa).toHaveBeenCalledWith("docker", ["info"], {
					stdio: "pipe",
				});
			});
		});

		it("returns false when docker is not available", async () => {
			await withTempDir(async (dir) => {
				dockerDir = dir;
				service = new DockerService(dir, createMockLogger());

				const { execa } = await import("execa");
				vi.mocked(execa).mockRejectedValueOnce(new Error("not found"));

				const result = await service.checkDocker();
				expect(result).toBe(false);
			});
		});
	});

	describe("checkDockerCompose", () => {
		it("returns true when docker compose is available", async () => {
			await withTempDir(async (dir) => {
				dockerDir = dir;
				service = new DockerService(dir, createMockLogger());

				const { execa } = await import("execa");
				vi.mocked(execa).mockResolvedValueOnce({} as never);

				const result = await service.checkDockerCompose();
				expect(result).toBe(true);
				expect(execa).toHaveBeenCalledWith("docker", ["compose", "version"], {
					stdio: "pipe",
				});
			});
		});

		it("returns false when docker compose is not available", async () => {
			await withTempDir(async (dir) => {
				dockerDir = dir;
				service = new DockerService(dir, createMockLogger());

				const { execa } = await import("execa");
				vi.mocked(execa).mockRejectedValueOnce(new Error("not found"));

				const result = await service.checkDockerCompose();
				expect(result).toBe(false);
			});
		});
	});

	describe("build", () => {
		it("executes docker compose build with correct args", async () => {
			await withTempDir(async (dir) => {
				dockerDir = dir;
				service = new DockerService(dir, createMockLogger());

				const { execa } = await import("execa");
				vi.mocked(execa).mockResolvedValueOnce({} as never);

				await service.build();

				expect(execa).toHaveBeenCalledWith(
					"docker",
					["compose", "build"],
					expect.objectContaining({ cwd: dir }),
				);
			});
		});

		it("passes --no-cache flag when option set", async () => {
			await withTempDir(async (dir) => {
				dockerDir = dir;
				service = new DockerService(dir, createMockLogger());

				const { execa } = await import("execa");
				vi.mocked(execa).mockResolvedValueOnce({} as never);

				await service.build({ noCache: true });

				expect(execa).toHaveBeenCalledWith(
					"docker",
					["compose", "build", "--no-cache"],
					expect.objectContaining({ cwd: dir }),
				);
			});
		});
	});

	describe("up", () => {
		it("executes docker compose up -d", async () => {
			await withTempDir(async (dir) => {
				dockerDir = dir;
				service = new DockerService(dir, createMockLogger());

				const { execa } = await import("execa");
				vi.mocked(execa).mockResolvedValueOnce({} as never);

				await service.up();

				expect(execa).toHaveBeenCalledWith(
					"docker",
					["compose", "up", "-d"],
					expect.objectContaining({ cwd: dir }),
				);
			});
		});
	});

	describe("down", () => {
		it("executes docker compose down", async () => {
			await withTempDir(async (dir) => {
				dockerDir = dir;
				service = new DockerService(dir, createMockLogger());

				const { execa } = await import("execa");
				vi.mocked(execa).mockResolvedValueOnce({} as never);

				await service.down();

				expect(execa).toHaveBeenCalledWith(
					"docker",
					["compose", "down"],
					expect.objectContaining({ cwd: dir }),
				);
			});
		});
	});

	describe("getStatus", () => {
		it("parses docker inspect JSON correctly", async () => {
			await withTempDir(async (dir) => {
				dockerDir = dir;
				service = new DockerService(dir, createMockLogger());

				const { execa } = await import("execa");
				const inspectResult = [
					{
						Id: "abc123def456",
						State: {
							Status: "running",
							Running: true,
							StartedAt: "2024-01-01T00:00:00.000Z",
							Health: {
								Status: "healthy",
							},
						},
					},
				];

				vi.mocked(execa).mockResolvedValueOnce({
					stdout: JSON.stringify(inspectResult),
				} as never);

				const status = await service.getStatus();

				expect(status.running).toBe(true);
				expect(status.health).toBe("healthy");
				expect(status.containerId).toBe("abc123def456");
				expect(status.uptimeSeconds).toBeGreaterThan(0);
			});
		});

		it("returns not running when container does not exist", async () => {
			await withTempDir(async (dir) => {
				dockerDir = dir;
				service = new DockerService(dir, createMockLogger());

				const { execa } = await import("execa");
				vi.mocked(execa).mockRejectedValueOnce(new Error("No such container"));

				const status = await service.getStatus();

				expect(status.running).toBe(false);
				expect(status.health).toBe("none");
			});
		});

		it("handles container without health check", async () => {
			await withTempDir(async (dir) => {
				dockerDir = dir;
				service = new DockerService(dir, createMockLogger());

				const { execa } = await import("execa");
				const inspectResult = [
					{
						Id: "abc123def456",
						State: {
							Status: "running",
							Running: true,
							StartedAt: "2024-01-01T00:00:00.000Z",
							// No Health property
						},
					},
				];

				vi.mocked(execa).mockResolvedValueOnce({
					stdout: JSON.stringify(inspectResult),
				} as never);

				const status = await service.getStatus();

				expect(status.running).toBe(true);
				expect(status.health).toBe("none");
			});
		});
	});

	describe("readEnvFile", () => {
		it("parses key=value pairs correctly", async () => {
			await withTempDir(async (dir) => {
				dockerDir = dir;
				service = new DockerService(dir, createMockLogger());

				const envContent = `
# Comment line
ANTHROPIC_API_KEY=sk-ant-123
LINEAR_CLIENT_ID=abc123

# Another comment
CYRUS_BASE_URL=https://example.ngrok.io
`;
				writeFileSync(join(dir, ".env.docker"), envContent);

				const config = service.readEnvFile();

				expect(config.ANTHROPIC_API_KEY).toBe("sk-ant-123");
				expect(config.LINEAR_CLIENT_ID).toBe("abc123");
				expect(config.CYRUS_BASE_URL).toBe("https://example.ngrok.io");
			});
		});

		it("skips comments and blank lines", async () => {
			await withTempDir(async (dir) => {
				dockerDir = dir;
				service = new DockerService(dir, createMockLogger());

				const envContent = `
# This is a comment
   # Indented comment

KEY=value
`;
				writeFileSync(join(dir, ".env.docker"), envContent);

				const config = service.readEnvFile();

				expect(Object.keys(config)).toHaveLength(1);
				expect(config).not.toHaveProperty("#");
			});
		});

		it("returns empty object when file does not exist", async () => {
			await withTempDir(async (dir) => {
				dockerDir = dir;
				service = new DockerService(dir, createMockLogger());

				const config = service.readEnvFile();

				expect(config).toEqual({});
			});
		});

		it("handles values with equals signs", async () => {
			await withTempDir(async (dir) => {
				dockerDir = dir;
				service = new DockerService(dir, createMockLogger());

				const envContent = "URL=https://example.com?foo=bar&baz=qux";
				writeFileSync(join(dir, ".env.docker"), envContent);

				const config = service.readEnvFile();

				expect(config).toHaveProperty("URL");
				// The value after the first = should be preserved
				expect((config as Record<string, string>).URL).toBe(
					"https://example.com?foo=bar&baz=qux",
				);
			});
		});
	});

	describe("writeEnvFile", () => {
		it("writes config correctly", async () => {
			await withTempDir(async (dir) => {
				dockerDir = dir;
				service = new DockerService(dir, createMockLogger());

				// Create example file first (writeEnvFile uses it as template)
				writeFileSync(join(dir, ".env.docker.example"), "# Example\n");

				service.writeEnvFile({
					ANTHROPIC_API_KEY: "sk-ant-123",
					LINEAR_CLIENT_ID: "abc123",
				});

				expect(existsSync(join(dir, ".env.docker"))).toBe(true);

				const content = readFileSync(join(dir, ".env.docker"), "utf-8");
				expect(content).toContain("ANTHROPIC_API_KEY=sk-ant-123");
				expect(content).toContain("LINEAR_CLIENT_ID=abc123");
			});
		});
	});

	describe("updateEnvValue", () => {
		it("updates single value in existing file", async () => {
			await withTempDir(async (dir) => {
				dockerDir = dir;
				service = new DockerService(dir, createMockLogger());

				// Create initial env file
				writeFileSync(join(dir, ".env.docker.example"), "# Example\n");
				writeFileSync(
					join(dir, ".env.docker"),
					"KEY1=value1\nKEY2=value2\n",
				);

				service.updateEnvValue("KEY1", "newvalue1");

				const content = readFileSync(join(dir, ".env.docker"), "utf-8");
				expect(content).toContain("KEY1=newvalue1");
				expect(content).toContain("KEY2=value2");
			});
		});

		it("adds new value if not present", async () => {
			await withTempDir(async (dir) => {
				dockerDir = dir;
				service = new DockerService(dir, createMockLogger());

				writeFileSync(join(dir, ".env.docker.example"), "# Example\n");
				writeFileSync(join(dir, ".env.docker"), "KEY1=value1\n");

				service.updateEnvValue("NEW_KEY", "newvalue");

				const content = readFileSync(join(dir, ".env.docker"), "utf-8");
				expect(content).toContain("KEY1=value1");
				expect(content).toContain("NEW_KEY=newvalue");
			});
		});
	});

	describe("hasEnvFile", () => {
		it("returns true when .env.docker exists", async () => {
			await withTempDir(async (dir) => {
				dockerDir = dir;
				service = new DockerService(dir, createMockLogger());

				writeFileSync(join(dir, ".env.docker"), "KEY=value");

				expect(service.hasEnvFile()).toBe(true);
			});
		});

		it("returns false when .env.docker does not exist", async () => {
			await withTempDir(async (dir) => {
				dockerDir = dir;
				service = new DockerService(dir, createMockLogger());

				expect(service.hasEnvFile()).toBe(false);
			});
		});
	});

	describe("imageExists", () => {
		it("returns true when image exists", async () => {
			await withTempDir(async (dir) => {
				dockerDir = dir;
				service = new DockerService(dir, createMockLogger());

				const { execa } = await import("execa");
				vi.mocked(execa).mockResolvedValueOnce({} as never);

				const result = await service.imageExists();

				expect(result).toBe(true);
				expect(execa).toHaveBeenCalledWith(
					"docker",
					["image", "inspect", "cyrus-ai/cyrus:latest"],
					{ stdio: "pipe" },
				);
			});
		});

		it("returns false when image does not exist", async () => {
			await withTempDir(async (dir) => {
				dockerDir = dir;
				service = new DockerService(dir, createMockLogger());

				const { execa } = await import("execa");
				vi.mocked(execa).mockRejectedValueOnce(new Error("No such image"));

				const result = await service.imageExists();

				expect(result).toBe(false);
			});
		});
	});

	describe("checkImageStatus", () => {
		it("returns needsRebuild true when image does not exist", async () => {
			await withTempDir(async (dir) => {
				dockerDir = dir;
				service = new DockerService(dir, createMockLogger());

				const { execa } = await import("execa");
				vi.mocked(execa).mockRejectedValueOnce(new Error("No such image"));

				const result = await service.checkImageStatus(null);

				expect(result.needsRebuild).toBe(true);
				expect(result.reason).toContain("does not exist");
			});
		});

		it("returns needsRebuild false when image is up to date", async () => {
			await withTempDir(async (dir) => {
				dockerDir = dir;
				service = new DockerService(dir, createMockLogger());

				const { execa } = await import("execa");
				// imageExists check
				vi.mocked(execa).mockResolvedValueOnce({} as never);
				// getImageToolsHash check
				vi.mocked(execa).mockResolvedValueOnce({ stdout: "" } as never);

				const result = await service.checkImageStatus(null);

				expect(result.needsRebuild).toBe(false);
				expect(result.reason).toContain("up to date");
			});
		});

		it("returns needsRebuild true when tools config changed", async () => {
			await withTempDir(async (dir) => {
				dockerDir = dir;
				service = new DockerService(dir, createMockLogger());

				const { execa } = await import("execa");
				// imageExists check
				vi.mocked(execa).mockResolvedValueOnce({} as never);
				// getImageToolsHash check - returns different hash
				vi.mocked(execa).mockResolvedValueOnce({
					stdout: "oldhash123",
				} as never);

				const result = await service.checkImageStatus("newhash456");

				expect(result.needsRebuild).toBe(true);
				expect(result.reason).toContain("changed");
			});
		});
	});

	describe("formatUptime", () => {
		it("formats hours and minutes correctly", async () => {
			await withTempDir(async (dir) => {
				dockerDir = dir;
				service = new DockerService(dir, createMockLogger());

				expect(service.formatUptime(3661)).toBe("1h 1m");
				expect(service.formatUptime(7200)).toBe("2h 0m");
			});
		});

		it("formats minutes only when less than an hour", async () => {
			await withTempDir(async (dir) => {
				dockerDir = dir;
				service = new DockerService(dir, createMockLogger());

				expect(service.formatUptime(300)).toBe("5m");
				expect(service.formatUptime(59)).toBe("0m");
			});
		});
	});
});
