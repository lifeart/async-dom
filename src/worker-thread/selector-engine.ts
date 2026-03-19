import type { VirtualElement } from "./element.ts";

interface SimpleSelector {
	tag?: string;
	id?: string;
	classes?: string[];
	attrs?: Array<{ name: string; value?: string }>;
	pseudos?: string[];
}

interface SelectorPart {
	selector: SimpleSelector;
	combinator: "" | ">" | " ";
}

function parseSimpleSelector(input: string): SimpleSelector {
	const sel: SimpleSelector = {};
	let i = 0;
	const len = input.length;

	while (i < len) {
		const ch = input[i];
		if (ch === "#") {
			i++;
			let id = "";
			while (
				i < len &&
				input[i] !== "." &&
				input[i] !== "#" &&
				input[i] !== "[" &&
				input[i] !== ":"
			) {
				id += input[i++];
			}
			sel.id = id;
		} else if (ch === ".") {
			i++;
			let cls = "";
			while (
				i < len &&
				input[i] !== "." &&
				input[i] !== "#" &&
				input[i] !== "[" &&
				input[i] !== ":"
			) {
				cls += input[i++];
			}
			(sel.classes ??= []).push(cls);
		} else if (ch === "[") {
			i++;
			let name = "";
			while (i < len && input[i] !== "]" && input[i] !== "=") {
				name += input[i++];
			}
			name = name.trim();
			let value: string | undefined;
			if (i < len && input[i] === "=") {
				i++;
				let v = "";
				const quote = input[i] === '"' || input[i] === "'" ? input[i++] : "";
				while (i < len && input[i] !== "]" && (quote ? input[i] !== quote : true)) {
					v += input[i++];
				}
				if (quote && i < len) i++; // skip closing quote
				v = v.trim();
				value = v;
			}
			if (i < len && input[i] === "]") i++;
			(sel.attrs ??= []).push({ name, value });
		} else if (ch === ":") {
			i++;
			let pseudo = "";
			while (
				i < len &&
				input[i] !== "." &&
				input[i] !== "#" &&
				input[i] !== "[" &&
				input[i] !== ":"
			) {
				pseudo += input[i++];
			}
			(sel.pseudos ??= []).push(pseudo);
		} else {
			// Tag name
			let tag = "";
			while (
				i < len &&
				input[i] !== "." &&
				input[i] !== "#" &&
				input[i] !== "[" &&
				input[i] !== ":" &&
				input[i] !== " " &&
				input[i] !== ">"
			) {
				tag += input[i++];
			}
			if (tag) sel.tag = tag.toUpperCase();
		}
	}
	return sel;
}

function parseSelectorGroup(input: string): SelectorPart[][] {
	const groups: string[] = [];
	let current = "";
	let inBracket = false;
	let inQuote = "";
	for (let i = 0; i < input.length; i++) {
		const ch = input[i];
		if (inQuote) {
			current += ch;
			if (ch === inQuote) inQuote = "";
		} else if (ch === '"' || ch === "'") {
			current += ch;
			inQuote = ch;
		} else if (ch === "[") {
			inBracket = true;
			current += ch;
		} else if (ch === "]") {
			inBracket = false;
			current += ch;
		} else if (ch === "," && !inBracket) {
			groups.push(current.trim());
			current = "";
		} else {
			current += ch;
		}
	}
	if (current.trim()) groups.push(current.trim());
	return groups.map((group) => parseSelectorChain(group));
}

function parseSelectorChain(input: string): SelectorPart[] {
	const parts: SelectorPart[] = [];
	const tokens = tokenize(input);

	let combinator: "" | ">" | " " = "";
	for (const token of tokens) {
		if (token === ">") {
			combinator = ">";
		} else if (token === " ") {
			if (combinator !== ">") combinator = " ";
		} else {
			parts.push({ selector: parseSimpleSelector(token), combinator });
			combinator = "";
		}
	}
	return parts;
}

function tokenize(input: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let inBracket = false;

	for (let i = 0; i < input.length; i++) {
		const ch = input[i];
		if (ch === "[") inBracket = true;
		if (ch === "]") inBracket = false;

		if (!inBracket && (ch === " " || ch === ">")) {
			if (current) {
				tokens.push(current);
				current = "";
			}
			if (ch === ">") {
				tokens.push(">");
			} else if (
				tokens.length > 0 &&
				tokens[tokens.length - 1] !== ">" &&
				tokens[tokens.length - 1] !== " "
			) {
				tokens.push(" ");
			}
		} else {
			current += ch;
		}
	}
	if (current) tokens.push(current);
	return tokens;
}

function matchesSimple(el: VirtualElement, sel: SimpleSelector): boolean {
	if (sel.tag && sel.tag !== "*" && el.tagName !== sel.tag) return false;
	if (sel.id && el.getAttribute("id") !== sel.id) return false;
	if (sel.classes) {
		const elClasses = el.className.split(" ").filter(Boolean);
		for (const cls of sel.classes) {
			if (!elClasses.includes(cls)) return false;
		}
	}
	if (sel.attrs) {
		for (const attr of sel.attrs) {
			if (attr.value !== undefined) {
				if (el.getAttribute(attr.name) !== attr.value) return false;
			} else {
				if (!el.hasAttribute(attr.name)) return false;
			}
		}
	}
	if (sel.pseudos) {
		for (const pseudo of sel.pseudos) {
			if (pseudo === "first-child") {
				if (!el.parentNode) return false;
				const siblings = el.parentNode.children.filter((c) => c.nodeType === 1);
				if (siblings[0] !== el) return false;
			} else if (pseudo === "last-child") {
				if (!el.parentNode) return false;
				const siblings = el.parentNode.children.filter((c) => c.nodeType === 1);
				if (siblings[siblings.length - 1] !== el) return false;
			}
		}
	}
	return true;
}

function matchesChain(el: VirtualElement, chain: SelectorPart[]): boolean {
	if (chain.length === 0) return false;
	let current: VirtualElement | null = el;

	// Match from right to left
	for (let i = chain.length - 1; i >= 0; i--) {
		const part = chain[i];
		if (!current) return false;

		if (i === chain.length - 1) {
			// Rightmost: must match current element
			if (!matchesSimple(current, part.selector)) return false;
		} else {
			const nextPart = chain[i + 1];
			if (nextPart.combinator === ">") {
				// Direct parent
				current = current.parentNode;
				if (!current || !matchesSimple(current, part.selector)) return false;
			} else {
				// Ancestor (descendant combinator)
				current = current.parentNode;
				while (current) {
					if (matchesSimple(current, part.selector)) break;
					current = current.parentNode;
				}
				if (!current) return false;
			}
		}
	}
	return true;
}

export function matches(el: VirtualElement, selector: string): boolean {
	const groups = parseSelectorGroup(selector);
	return groups.some((chain) => matchesChain(el, chain));
}

export function querySelectorAll(root: VirtualElement, selector: string): VirtualElement[] {
	const groups = parseSelectorGroup(selector);
	const results: VirtualElement[] = [];
	walkElements(root, (el) => {
		if (groups.some((chain) => matchesChain(el, chain))) {
			results.push(el);
		}
	});
	return results;
}

export function querySelector(root: VirtualElement, selector: string): VirtualElement | null {
	const groups = parseSelectorGroup(selector);
	let found: VirtualElement | null = null;
	walkElements(root, (el) => {
		if (groups.some((chain) => matchesChain(el, chain))) {
			found = el;
			return true; // stop walking
		}
	});
	return found;
}

function walkElements(
	root: VirtualElement,
	callback: (el: VirtualElement) => boolean | void,
): boolean {
	for (const child of root.children) {
		if (child.nodeType === 1) {
			const el = child as VirtualElement;
			if (callback(el) === true) return true;
			if (walkElements(el, callback)) return true;
		}
	}
	return false;
}
