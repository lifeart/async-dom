/**
 * Lightweight HTML sanitizer for async-dom.
 *
 * Strips dangerous tags and attributes to prevent XSS when
 * worker-provided HTML is injected via innerHTML or insertAdjacentHTML.
 */

const DANGEROUS_TAGS = new Set([
	"script",
	"iframe",
	"object",
	"embed",
	"form",
	"base",
	"meta",
	"link",
	"style",
]);

const DANGEROUS_ATTR_PATTERN = /^on/i;

const DANGEROUS_URI_ATTRS = new Set(["href", "src", "data", "action", "formaction", "xlink:href"]);

const DANGEROUS_ATTRS = new Set(["srcdoc", "formaction"]);

/**
 * Returns true if the given URI string starts with `javascript:` (ignoring whitespace and case).
 */
function isDangerousURI(value: string): boolean {
	const trimmed = value.trim().toLowerCase();
	return (
		/^\s*javascript\s*:/i.test(trimmed) ||
		/^\s*vbscript\s*:/i.test(trimmed) ||
		/^\s*data\s*:\s*text\/html/i.test(trimmed)
	);
}

/**
 * Sanitize an HTML string by removing dangerous tags and attributes.
 *
 * Uses the browser's DOMParser to parse the HTML, walks the resulting tree,
 * and removes any elements/attributes that could execute scripts or load
 * external resources in a dangerous way.
 */
export function sanitizeHTML(html: string): string {
	const parser = new DOMParser();
	const doc = parser.parseFromString(`<body>${html}</body>`, "text/html");
	const body = doc.body;

	sanitizeNode(body);

	return body.innerHTML;
}

function sanitizeNode(node: Node): void {
	// Collect children first since we may remove nodes during iteration
	const children = Array.from(node.childNodes);

	for (const child of children) {
		if (child.nodeType === Node.ELEMENT_NODE) {
			const el = child as Element;
			const tagName = el.tagName.toLowerCase();

			if (DANGEROUS_TAGS.has(tagName)) {
				el.remove();
				continue;
			}

			// Remove dangerous attributes
			const attrsToRemove: string[] = [];
			for (let i = 0; i < el.attributes.length; i++) {
				const attr = el.attributes[i];
				const name = attr.name.toLowerCase();

				if (DANGEROUS_ATTR_PATTERN.test(name)) {
					attrsToRemove.push(attr.name);
				} else if (DANGEROUS_ATTRS.has(name)) {
					attrsToRemove.push(attr.name);
				} else if (DANGEROUS_URI_ATTRS.has(name) && isDangerousURI(attr.value)) {
					attrsToRemove.push(attr.name);
				}
			}

			for (const attrName of attrsToRemove) {
				el.removeAttribute(attrName);
			}

			// Recurse into children
			sanitizeNode(el);
		}
	}
}
