import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockLogger } from "../test-utils.js";
import { TunnelService } from "./TunnelService.js";

// Mock execa
vi.mock("execa", () => ({
	execa: vi.fn(),
}));

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("TunnelService", () => {
	let service: TunnelService;

	beforeEach(() => {
		vi.clearAllMocks();
		service = new TunnelService(createMockLogger());
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	describe("start", () => {
		it("throws if ngrok is not installed", async () => {
			const { execa } = await import("execa");
			vi.mocked(execa).mockRejectedValueOnce(new Error("not found"));

			await expect(service.start(3456)).rejects.toThrow(
				"ngrok is not installed",
			);
		});
	});

	describe("waitForUrl", () => {
		it("returns URL when tunnel becomes ready on first try", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					tunnels: [
						{
							public_url: "https://ready.ngrok.io",
							proto: "https",
							config: { addr: "http://localhost:3456", inspect: true },
						},
					],
				}),
			});

			const url = await service.waitForUrl(3, 10);
			expect(url).toBe("https://ready.ngrok.io");
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});

		it("retries until tunnel becomes ready", async () => {
			// First two attempts fail, third succeeds
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ tunnels: [] }),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ tunnels: [] }),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						tunnels: [
							{
								public_url: "https://finally.ngrok.io",
								proto: "https",
								config: { addr: "http://localhost:3456", inspect: true },
							},
						],
					}),
				});

			// Use small delay for fast tests
			const url = await service.waitForUrl(5, 1);
			expect(url).toBe("https://finally.ngrok.io");
			expect(mockFetch).toHaveBeenCalledTimes(3);
		});

		it("throws timeout error after max retries", async () => {
			// All attempts return empty tunnels (simulating ngrok not ready)
			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => ({ tunnels: [] }),
			});

			// Use small delay for fast tests
			await expect(service.waitForUrl(3, 1)).rejects.toThrow(
				"Timeout waiting for ngrok tunnel",
			);
			expect(mockFetch).toHaveBeenCalledTimes(3);
		});

		it("respects custom retry count", async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => ({ tunnels: [] }),
			});

			await expect(service.waitForUrl(2, 1)).rejects.toThrow("Timeout");
			expect(mockFetch).toHaveBeenCalledTimes(2);
		});
	});

	describe("getUrl", () => {
		it("parses ngrok API response correctly", async () => {
			const mockResponse = {
				tunnels: [
					{
						name: "command_line",
						uri: "/api/tunnels/command_line",
						public_url: "https://abc123.ngrok.io",
						proto: "https",
						config: { addr: "http://localhost:3456", inspect: true },
					},
					{
						name: "command_line (http)",
						uri: "/api/tunnels/command_line%20%28http%29",
						public_url: "http://abc123.ngrok.io",
						proto: "http",
						config: { addr: "http://localhost:3456", inspect: true },
					},
				],
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			});

			const url = await service.getUrl();
			expect(url).toBe("https://abc123.ngrok.io");
		});

		it("prefers https tunnel over http", async () => {
			const mockResponse = {
				tunnels: [
					{
						name: "http",
						public_url: "http://abc123.ngrok.io",
						proto: "http",
						config: { addr: "http://localhost:3456", inspect: true },
					},
					{
						name: "https",
						public_url: "https://abc123.ngrok.io",
						proto: "https",
						config: { addr: "http://localhost:3456", inspect: true },
					},
				],
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			});

			const url = await service.getUrl();
			expect(url).toBe("https://abc123.ngrok.io");
		});

		it("falls back to first tunnel if no https", async () => {
			const mockResponse = {
				tunnels: [
					{
						name: "http",
						public_url: "http://abc123.ngrok.io",
						proto: "http",
						config: { addr: "http://localhost:3456", inspect: true },
					},
				],
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			});

			const url = await service.getUrl();
			expect(url).toBe("http://abc123.ngrok.io");
		});

		it("returns null when no tunnels exist", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ tunnels: [] }),
			});

			const url = await service.getUrl();
			expect(url).toBeNull();
		});

		it("returns null on API failure", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
			});

			const url = await service.getUrl();
			expect(url).toBeNull();
		});

		it("returns null on network error", async () => {
			mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

			const url = await service.getUrl();
			expect(url).toBeNull();
		});
	});

	describe("stop", () => {
		it("sends SIGTERM to PID", async () => {
			const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

			await service.stop(12345);

			expect(killSpy).toHaveBeenCalledWith(12345, "SIGTERM");
		});

		it("handles already-stopped process gracefully (ESRCH)", async () => {
			const error = new Error("No such process") as NodeJS.ErrnoException;
			error.code = "ESRCH";

			vi.spyOn(process, "kill").mockImplementation(() => {
				throw error;
			});

			// Should not throw
			await expect(service.stop(12345)).resolves.toBeUndefined();
		});

		it("throws on unexpected errors", async () => {
			const error = new Error("Permission denied") as NodeJS.ErrnoException;
			error.code = "EPERM";

			vi.spyOn(process, "kill").mockImplementation(() => {
				throw error;
			});

			await expect(service.stop(12345)).rejects.toThrow("Permission denied");
		});
	});

	describe("isProcessRunning", () => {
		it("returns true when process exists", () => {
			vi.spyOn(process, "kill").mockImplementation(() => true);

			expect(service.isProcessRunning(12345)).toBe(true);
		});

		it("returns false when process does not exist", () => {
			vi.spyOn(process, "kill").mockImplementation(() => {
				throw new Error("No such process");
			});

			expect(service.isProcessRunning(12345)).toBe(false);
		});
	});

	describe("getStatus", () => {
		it("returns running status with URL when tunnel exists", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					tunnels: [
						{
							public_url: "https://test.ngrok.io",
							proto: "https",
							config: { addr: "http://localhost:3456", inspect: true },
						},
					],
				}),
			});

			const status = await service.getStatus();

			expect(status.isRunning).toBe(true);
			expect(status.url).toBe("https://test.ngrok.io");
		});

		it("returns not running when no tunnel exists", async () => {
			mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

			const status = await service.getStatus();

			expect(status.isRunning).toBe(false);
			expect(status.url).toBeUndefined();
		});
	});

	describe("isRunning", () => {
		it("returns true when tunnel URL exists", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					tunnels: [
						{
							public_url: "https://test.ngrok.io",
							proto: "https",
							config: { addr: "http://localhost:3456", inspect: true },
						},
					],
				}),
			});

			expect(await service.isRunning()).toBe(true);
		});

		it("returns false when no tunnel URL", async () => {
			mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

			expect(await service.isRunning()).toBe(false);
		});
	});
});
