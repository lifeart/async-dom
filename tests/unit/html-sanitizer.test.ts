import { describe, expect, it } from "vitest";
import { sanitizeHTML } from "../../src/core/html-sanitizer.ts";

describe("sanitizeHTML", () => {
	describe("dangerous tags", () => {
		it("strips <script> tags", () => {
			expect(sanitizeHTML('<script>alert("xss")</script>')).toBe("");
		});

		it("strips <iframe> tags", () => {
			expect(sanitizeHTML('<iframe src="https://evil.com"></iframe>')).toBe("");
		});

		it("strips <object> tags", () => {
			expect(sanitizeHTML('<object data="evil.swf"></object>')).toBe("");
		});

		it("strips <embed> tags", () => {
			expect(sanitizeHTML('<embed src="evil.swf">')).toBe("");
		});

		it("strips <form> tags", () => {
			expect(sanitizeHTML('<form action="evil"><input></form>')).toBe("");
		});

		it("strips <base> tags", () => {
			expect(sanitizeHTML('<base href="https://evil.com">')).toBe("");
		});

		it("strips <meta> tags", () => {
			expect(sanitizeHTML('<meta http-equiv="refresh" content="0;url=evil">')).toBe("");
		});

		it("strips <link> tags", () => {
			expect(sanitizeHTML('<link rel="stylesheet" href="evil.css">')).toBe("");
		});

		it("strips nested dangerous tags", () => {
			const html = "<div><script>alert(1)</script><p>safe</p></div>";
			const result = sanitizeHTML(html);
			expect(result).not.toContain("script");
			expect(result).toContain("<p>safe</p>");
		});
	});

	describe("dangerous attributes", () => {
		it("strips onclick handler", () => {
			const result = sanitizeHTML('<div onclick="alert(1)">text</div>');
			expect(result).not.toContain("onclick");
			expect(result).toContain("text");
		});

		it("strips onload handler", () => {
			const result = sanitizeHTML('<img onload="alert(1)" src="x.png">');
			expect(result).not.toContain("onload");
		});

		it("strips onmouseover handler", () => {
			const result = sanitizeHTML('<div onmouseover="alert(1)">text</div>');
			expect(result).not.toContain("onmouseover");
		});

		it("strips srcdoc attribute", () => {
			// srcdoc is removed as a dangerous attr
			const result = sanitizeHTML('<div srcdoc="<script>alert(1)</script>">text</div>');
			expect(result).not.toContain("srcdoc");
		});

		it("strips formaction attribute", () => {
			const result = sanitizeHTML('<button formaction="evil">Click</button>');
			expect(result).not.toContain("formaction");
		});

		it("strips javascript: URIs from href", () => {
			const result = sanitizeHTML('<a href="javascript:alert(1)">link</a>');
			expect(result).not.toContain("javascript");
			expect(result).toContain("link");
		});

		it("strips javascript: URIs from src", () => {
			const result = sanitizeHTML('<img src="javascript:alert(1)">');
			expect(result).not.toContain("javascript");
		});

		it("strips javascript: URIs with whitespace", () => {
			const result = sanitizeHTML('<a href="  javascript:alert(1)">link</a>');
			expect(result).not.toContain("javascript");
		});
	});

	describe("safe content preserved", () => {
		it("preserves safe HTML tags", () => {
			const html = '<div class="foo"><p>Hello <b>world</b></p><span>text</span></div>';
			expect(sanitizeHTML(html)).toBe(html);
		});

		it("preserves safe attributes", () => {
			const html = '<div class="foo" id="bar" data-test="baz">text</div>';
			expect(sanitizeHTML(html)).toBe(html);
		});

		it("preserves images with safe src", () => {
			const html = '<img src="https://example.com/img.png" alt="photo">';
			expect(sanitizeHTML(html)).toBe(html);
		});

		it("preserves links with safe href", () => {
			const html = '<a href="https://example.com">link</a>';
			expect(sanitizeHTML(html)).toBe(html);
		});

		it("preserves style attributes", () => {
			const html = '<div style="color: red">text</div>';
			expect(sanitizeHTML(html)).toBe(html);
		});

		it("returns empty string for empty input", () => {
			expect(sanitizeHTML("")).toBe("");
		});

		it("preserves plain text", () => {
			expect(sanitizeHTML("hello world")).toBe("hello world");
		});
	});
});
