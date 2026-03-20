import { describe, expect, it } from "vitest";
import { formatBytes } from "../../src/debug/format-helpers.ts";

describe("formatBytes", () => {
	it("formats 0 bytes", () => {
		expect(formatBytes(0)).toBe("0 B");
	});

	it("formats bytes below 1 KB", () => {
		expect(formatBytes(500)).toBe("500 B");
		expect(formatBytes(1)).toBe("1 B");
		expect(formatBytes(1023)).toBe("1023 B");
	});

	it("formats 1024 as 1.0 KB", () => {
		expect(formatBytes(1024)).toBe("1.0 KB");
	});

	it("formats kilobytes", () => {
		expect(formatBytes(2048)).toBe("2.0 KB");
		expect(formatBytes(1536)).toBe("1.5 KB");
	});

	it("formats 1048576 as 1.0 MB", () => {
		expect(formatBytes(1048576)).toBe("1.0 MB");
	});

	it("formats megabytes", () => {
		expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MB");
		expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
	});
});
