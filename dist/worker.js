import { c as createAppId, f as isSystemMessage, h as resolveDebugHooks, l as createNodeId, n as SyncChannel, t as QueryType, u as isEventMessage } from "./sync-channel.js";
import { t as WorkerSelfTransport } from "./worker-transport.js";
//#region src/worker-thread/selector-engine.ts
function parseSimpleSelector(input) {
	const sel = {};
	let i = 0;
	const len = input.length;
	while (i < len) {
		const ch = input[i];
		if (ch === "#") {
			i++;
			let id = "";
			while (i < len && input[i] !== "." && input[i] !== "#" && input[i] !== "[" && input[i] !== ":") id += input[i++];
			sel.id = id;
		} else if (ch === ".") {
			i++;
			let cls = "";
			while (i < len && input[i] !== "." && input[i] !== "#" && input[i] !== "[" && input[i] !== ":") cls += input[i++];
			if (!sel.classes) sel.classes = [];
			sel.classes.push(cls);
		} else if (ch === "[") {
			i++;
			let name = "";
			while (i < len && input[i] !== "]" && input[i] !== "=") name += input[i++];
			name = name.trim();
			let value;
			if (i < len && input[i] === "=") {
				i++;
				let v = "";
				const quote = input[i] === "\"" || input[i] === "'" ? input[i++] : "";
				while (i < len && input[i] !== "]" && (quote ? input[i] !== quote : true)) v += input[i++];
				if (quote && i < len) i++;
				v = v.trim();
				value = v;
			}
			if (i < len && input[i] === "]") i++;
			if (!sel.attrs) sel.attrs = [];
			sel.attrs.push({
				name,
				value
			});
		} else if (ch === ":") {
			i++;
			let pseudo = "";
			while (i < len && input[i] !== "." && input[i] !== "#" && input[i] !== "[" && input[i] !== ":") pseudo += input[i++];
			if (!sel.pseudos) sel.pseudos = [];
			sel.pseudos.push(pseudo);
		} else {
			let tag = "";
			while (i < len && input[i] !== "." && input[i] !== "#" && input[i] !== "[" && input[i] !== ":" && input[i] !== " " && input[i] !== ">") tag += input[i++];
			if (tag) sel.tag = tag.toUpperCase();
		}
	}
	return sel;
}
function parseSelectorGroup(input) {
	const groups = [];
	let current = "";
	let inBracket = false;
	let inQuote = "";
	for (let i = 0; i < input.length; i++) {
		const ch = input[i];
		if (inQuote) {
			current += ch;
			if (ch === inQuote) inQuote = "";
		} else if (ch === "\"" || ch === "'") {
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
		} else current += ch;
	}
	if (current.trim()) groups.push(current.trim());
	return groups.map((group) => parseSelectorChain(group));
}
function parseSelectorChain(input) {
	const parts = [];
	const tokens = tokenize(input);
	let combinator = "";
	for (const token of tokens) if (token === ">") combinator = ">";
	else if (token === " ") {
		if (combinator !== ">") combinator = " ";
	} else {
		parts.push({
			selector: parseSimpleSelector(token),
			combinator
		});
		combinator = "";
	}
	return parts;
}
function tokenize(input) {
	const tokens = [];
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
			if (ch === ">") tokens.push(">");
			else if (tokens.length > 0 && tokens[tokens.length - 1] !== ">" && tokens[tokens.length - 1] !== " ") tokens.push(" ");
		} else current += ch;
	}
	if (current) tokens.push(current);
	return tokens;
}
function matchesSimple(el, sel) {
	if (sel.tag && sel.tag !== "*" && el.tagName !== sel.tag) return false;
	if (sel.id && el.getAttribute("id") !== sel.id) return false;
	if (sel.classes) {
		const elClasses = el.className.split(" ").filter(Boolean);
		for (const cls of sel.classes) if (!elClasses.includes(cls)) return false;
	}
	if (sel.attrs) {
		for (const attr of sel.attrs) if (attr.value !== void 0) {
			if (el.getAttribute(attr.name) !== attr.value) return false;
		} else if (!el.hasAttribute(attr.name)) return false;
	}
	if (sel.pseudos) {
		for (const pseudo of sel.pseudos) if (pseudo === "first-child") {
			if (!el.parentNode) return false;
			if (el.parentNode.childNodes.filter((c) => c.nodeType === 1)[0] !== el) return false;
		} else if (pseudo === "last-child") {
			if (!el.parentNode) return false;
			const siblings = el.parentNode.childNodes.filter((c) => c.nodeType === 1);
			if (siblings[siblings.length - 1] !== el) return false;
		}
	}
	return true;
}
function matchesChain(el, chain) {
	if (chain.length === 0) return false;
	let current = el;
	for (let i = chain.length - 1; i >= 0; i--) {
		const part = chain[i];
		if (!current) return false;
		if (i === chain.length - 1) {
			if (!matchesSimple(current, part.selector)) return false;
		} else if (chain[i + 1].combinator === ">") {
			current = current.parentNode;
			if (!current || !matchesSimple(current, part.selector)) return false;
		} else {
			current = current.parentNode;
			while (current) {
				if (matchesSimple(current, part.selector)) break;
				current = current.parentNode;
			}
			if (!current) return false;
		}
	}
	return true;
}
function matches(el, selector) {
	return parseSelectorGroup(selector).some((chain) => matchesChain(el, chain));
}
function querySelectorAll(root, selector) {
	const groups = parseSelectorGroup(selector);
	const results = [];
	walkElements(root, (el) => {
		if (groups.some((chain) => matchesChain(el, chain))) results.push(el);
	});
	return results;
}
function querySelector(root, selector) {
	const groups = parseSelectorGroup(selector);
	let found = null;
	walkElements(root, (el) => {
		if (groups.some((chain) => matchesChain(el, chain))) {
			found = el;
			return true;
		}
	});
	return found;
}
function walkElements(root, callback) {
	for (const child of root.childNodes) if (child.nodeType === 1) {
		const el = child;
		if (callback(el) === true) return true;
		if (walkElements(el, callback)) return true;
	}
	return false;
}
//#endregion
//#region src/worker-thread/style-proxy.ts
const KEBAB_REGEX = /[A-Z\u00C0-\u00D6\u00D8-\u00DE]/g;
const kebabCache = /* @__PURE__ */ new Map();
function toKebabCase(str) {
	let cached = kebabCache.get(str);
	if (cached === void 0) {
		cached = str.replace(KEBAB_REGEX, (match) => `-${match.toLowerCase()}`);
		kebabCache.set(str, cached);
	}
	return cached;
}
/**
* Creates a Proxy-based style object that intercepts property sets
* and emits setStyle mutations.
*/
function createStyleProxy(owner, collector, initialStyles = {}) {
	const backing = { ...initialStyles };
	return new Proxy(backing, {
		get(target, prop) {
			if (typeof prop !== "string") return "";
			if (prop === "getPropertyValue") return (name) => target[toKebabCase(name)] ?? "";
			if (prop === "removeProperty") return (name) => {
				const key = toKebabCase(name);
				const old = target[key] ?? "";
				delete target[key];
				const mutation = {
					action: "setStyle",
					id: owner._nodeId,
					property: key,
					value: ""
				};
				collector.add(mutation);
				return old;
			};
			if (prop === "setProperty") return (name, value, _priority) => {
				const key = toKebabCase(name);
				target[key] = value;
				const mutation = {
					action: "setStyle",
					id: owner._nodeId,
					property: key,
					value: String(value)
				};
				collector.add(mutation);
			};
			if (prop === "cssText") return Object.entries(target).map(([k, v]) => `${k}: ${v}`).join("; ");
			return target[toKebabCase(prop)] ?? "";
		},
		set(target, prop, value) {
			if (typeof prop !== "string") return true;
			const key = toKebabCase(prop);
			if (key === "css-text") {
				parseStyleString(value).forEach(([k, v]) => {
					target[k] = v;
					const mutation = {
						action: "setStyle",
						id: owner._nodeId,
						property: k,
						value: v
					};
					collector.add(mutation);
				});
				return true;
			}
			target[key] = value;
			const mutation = {
				action: "setStyle",
				id: owner._nodeId,
				property: key,
				value: String(value)
			};
			collector.add(mutation);
			return true;
		}
	});
}
function parseStyleString(value) {
	const result = [];
	for (const part of value.split(";")) {
		const colonIdx = part.indexOf(":");
		if (colonIdx === -1) continue;
		const key = part.slice(0, colonIdx).trim();
		const val = part.slice(colonIdx + 1).trim();
		if (key && val !== void 0) result.push([key, val]);
	}
	return result;
}
//#endregion
//#region src/worker-thread/element.ts
function kebabToCamel(str) {
	return str.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}
let listenerCounter = 0;
/**
* Virtual DOM element that records mutations via the MutationCollector
* instead of touching real DOM.
*/
var VirtualElement = class VirtualElement {
	static ELEMENT_NODE = 1;
	static TEXT_NODE = 3;
	static COMMENT_NODE = 8;
	static DOCUMENT_NODE = 9;
	static DOCUMENT_FRAGMENT_NODE = 11;
	_nodeId;
	nodeName;
	tagName;
	nodeType = 1;
	namespaceURI;
	parentNode = null;
	_ownerDocument = null;
	childNodes = [];
	_attributes = /* @__PURE__ */ new Map();
	_classes = [];
	_innerHTML = "";
	_textContent = "";
	_value = "";
	_checked = false;
	_disabled = false;
	_selectedIndex = -1;
	_datasetProxy = null;
	style;
	classList;
	get id() {
		return this.getAttribute("id") ?? "";
	}
	set id(value) {
		this.setAttribute("id", value);
	}
	get children() {
		return this.childNodes.filter((c) => c.nodeType === 1);
	}
	get childElementCount() {
		return this.childNodes.filter((c) => c.nodeType === 1).length;
	}
	get firstElementChild() {
		return this.childNodes.find((c) => c.nodeType === 1) ?? null;
	}
	get lastElementChild() {
		for (let i = this.childNodes.length - 1; i >= 0; i--) if (this.childNodes[i].nodeType === 1) return this.childNodes[i];
		return null;
	}
	get clientWidth() {
		return this._readNodeProperty("clientWidth") ?? 0;
	}
	get clientHeight() {
		return this._readNodeProperty("clientHeight") ?? 0;
	}
	get scrollWidth() {
		return this._readNodeProperty("scrollWidth") ?? 0;
	}
	get scrollHeight() {
		return this._readNodeProperty("scrollHeight") ?? 0;
	}
	get offsetWidth() {
		return this._readNodeProperty("offsetWidth") ?? 0;
	}
	get offsetHeight() {
		return this._readNodeProperty("offsetHeight") ?? 0;
	}
	get offsetTop() {
		return this._readNodeProperty("offsetTop") ?? 0;
	}
	get offsetLeft() {
		return this._readNodeProperty("offsetLeft") ?? 0;
	}
	get scrollTop() {
		return this._readNodeProperty("scrollTop") ?? 0;
	}
	set scrollTop(v) {
		const mutation = {
			action: "setProperty",
			id: this._nodeId,
			property: "scrollTop",
			value: v
		};
		this.collector.add(mutation);
	}
	get scrollLeft() {
		return this._readNodeProperty("scrollLeft") ?? 0;
	}
	set scrollLeft(v) {
		const mutation = {
			action: "setProperty",
			id: this._nodeId,
			property: "scrollLeft",
			value: v
		};
		this.collector.add(mutation);
	}
	_readNodeProperty(prop) {
		const channel = this._ownerDocument?._syncChannel;
		if (channel) {
			const result = channel.request(QueryType.NodeProperty, JSON.stringify({
				nodeId: this._nodeId,
				property: prop
			}));
			if (typeof result === "number") return result;
		}
		return null;
	}
	constructor(tag, collector, id) {
		this.collector = collector;
		this.nodeName = tag.toUpperCase();
		this.tagName = this.nodeName;
		this._nodeId = id ?? createNodeId();
		this.namespaceURI = "http://www.w3.org/1999/xhtml";
		this.style = createStyleProxy(this, collector);
		this.classList = new VirtualClassList(this);
	}
	_setNamespaceURI(ns) {
		this.namespaceURI = ns;
	}
	setAttribute(name, value) {
		if (name === "id") {
			const oldId = this._attributes.get("id");
			this._attributes.set(name, value);
			if (this._ownerDocument) {
				if (oldId) this._ownerDocument.unregisterElementById(oldId);
				this._ownerDocument.registerElementById(value, this);
			}
			const mutation = {
				action: "setAttribute",
				id: this._nodeId,
				name: "id",
				value
			};
			this.collector.add(mutation);
			return;
		}
		if (name === "style") {
			this._parseAndSetStyles(value);
			const mutation = {
				action: "setAttribute",
				id: this._nodeId,
				name: "style",
				value,
				optional: true
			};
			this.collector.add(mutation);
			return;
		}
		this._attributes.set(name, value);
		const mutation = {
			action: "setAttribute",
			id: this._nodeId,
			name,
			value
		};
		this.collector.add(mutation);
	}
	getAttribute(name) {
		return this._attributes.get(name) ?? null;
	}
	hasAttribute(name) {
		return this._attributes.has(name);
	}
	removeAttribute(name) {
		this._attributes.delete(name);
		const mutation = {
			action: "removeAttribute",
			id: this._nodeId,
			name
		};
		this.collector.add(mutation);
	}
	getAttributeNS(_ns, name) {
		return this.getAttribute(name);
	}
	setAttributeNS(_ns, name, value) {
		this.setAttribute(name, value);
	}
	removeAttributeNS(_ns, name) {
		this.removeAttribute(name);
	}
	get attributes() {
		const entries = [...this._attributes.entries()];
		return {
			length: entries.length,
			item(index) {
				const entry = entries[index];
				return entry ? {
					name: entry[0],
					value: entry[1]
				} : null;
			}
		};
	}
	appendChild(child) {
		if (child instanceof VirtualElement && child.nodeName === "#DOCUMENT-FRAGMENT") {
			const fragmentChildren = [...child.childNodes];
			for (const fc of fragmentChildren) this._appendSingleChild(fc);
			child.childNodes.length = 0;
			return child;
		}
		this._appendSingleChild(child);
		return child;
	}
	_appendSingleChild(child) {
		if (child.parentNode) child.parentNode.childNodes = child.parentNode.childNodes.filter((c) => c !== child);
		child.parentNode = this;
		this.childNodes.push(child);
		const mutation = {
			action: "appendChild",
			id: this._nodeId,
			childId: child._nodeId
		};
		this.collector.add(mutation);
	}
	removeChild(child) {
		if (child instanceof VirtualElement) child._cleanupFromDocument();
		this.childNodes = this.childNodes.filter((c) => c !== child);
		child.parentNode = null;
		const mutation = {
			action: "removeChild",
			id: this._nodeId,
			childId: child._nodeId
		};
		this.collector.add(mutation);
		return child;
	}
	insertBefore(newChild, refChild) {
		if (newChild instanceof VirtualElement && newChild.nodeName === "#DOCUMENT-FRAGMENT") {
			const fragmentChildren = [...newChild.childNodes];
			for (const fc of fragmentChildren) this.insertBefore(fc, refChild);
			newChild.childNodes.length = 0;
			return newChild;
		}
		if (newChild.parentNode) newChild.parentNode.childNodes = newChild.parentNode.childNodes.filter((c) => c !== newChild);
		newChild.parentNode = this;
		if (refChild === null) this.childNodes.push(newChild);
		else {
			const index = this.childNodes.indexOf(refChild);
			if (index === -1) this.childNodes.push(newChild);
			else this.childNodes.splice(index, 0, newChild);
		}
		const mutation = {
			action: "insertBefore",
			id: this._nodeId,
			newId: newChild._nodeId,
			refId: refChild?._nodeId ?? null
		};
		this.collector.add(mutation);
		return newChild;
	}
	remove() {
		this._cleanupFromDocument();
		if (this.parentNode) this.parentNode.childNodes = this.parentNode.childNodes.filter((c) => c !== this);
		this.parentNode = null;
		const mutation = {
			action: "removeNode",
			id: this._nodeId
		};
		this.collector.add(mutation);
	}
	append(...nodes) {
		for (const node of nodes) this.appendChild(node);
	}
	prepend(...nodes) {
		const first = this.firstChild;
		for (const node of nodes) this.insertBefore(node, first);
	}
	replaceWith(...nodes) {
		const parent = this.parentNode;
		if (!parent) return;
		const nextSib = this.nextSibling;
		this.remove();
		for (const node of nodes) parent.insertBefore(node, nextSib);
	}
	before(...nodes) {
		const parent = this.parentNode;
		if (!parent) return;
		for (const node of nodes) parent.insertBefore(node, this);
	}
	after(...nodes) {
		const parent = this.parentNode;
		if (!parent) return;
		const nextSib = this.nextSibling;
		for (const node of nodes) parent.insertBefore(node, nextSib);
	}
	replaceChildren(...nodes) {
		while (this.childNodes.length > 0) this.removeChild(this.childNodes[0]);
		for (const node of nodes) this.appendChild(node);
	}
	get textContent() {
		return this._textContent;
	}
	set textContent(value) {
		this._textContent = value;
		const mutation = {
			action: "setTextContent",
			id: this._nodeId,
			textContent: value
		};
		this.collector.add(mutation);
	}
	get innerHTML() {
		return this._innerHTML;
	}
	set innerHTML(value) {
		this._innerHTML = value;
		this.childNodes.length = 0;
		const mutation = {
			action: "setHTML",
			id: this._nodeId,
			html: value
		};
		this.collector.add(mutation);
	}
	get value() {
		return this._value;
	}
	set value(v) {
		this._value = v;
		const mutation = {
			action: "setProperty",
			id: this._nodeId,
			property: "value",
			value: v
		};
		this.collector.add(mutation);
	}
	get checked() {
		return this._checked;
	}
	set checked(v) {
		this._checked = v;
		const mutation = {
			action: "setProperty",
			id: this._nodeId,
			property: "checked",
			value: v
		};
		this.collector.add(mutation);
	}
	get disabled() {
		return this._disabled;
	}
	set disabled(v) {
		this._disabled = v;
		const mutation = {
			action: "setProperty",
			id: this._nodeId,
			property: "disabled",
			value: v
		};
		this.collector.add(mutation);
	}
	get selectedIndex() {
		return this._selectedIndex;
	}
	set selectedIndex(v) {
		this._selectedIndex = v;
		const mutation = {
			action: "setProperty",
			id: this._nodeId,
			property: "selectedIndex",
			value: v
		};
		this.collector.add(mutation);
	}
	_updateInputState(state) {
		if (state.value !== void 0) this._value = state.value;
		if (state.checked !== void 0) this._checked = state.checked;
		if (state.selectedIndex !== void 0) this._selectedIndex = state.selectedIndex;
	}
	get className() {
		return this._classes.join(" ");
	}
	set className(value) {
		this._classes = value ? value.split(" ").filter(Boolean) : [];
		const mutation = {
			action: "setClassName",
			id: this._nodeId,
			name: value
		};
		this.collector.add(mutation);
	}
	_eventListeners = /* @__PURE__ */ new Map();
	_listenerEventNames = /* @__PURE__ */ new Map();
	_onHandlers = /* @__PURE__ */ new Map();
	addEventListener(name, callback, options) {
		if (!name) return;
		const listenerId = `${this._nodeId}_${name}_${++listenerCounter}`;
		const once = typeof options === "object" ? options?.once ?? false : false;
		let effectiveCallback = callback;
		if (once) {
			const originalCb = callback;
			effectiveCallback = (e) => {
				originalCb(e);
				this.removeEventListener(name, effectiveCallback);
			};
		}
		this._eventListeners.set(listenerId, effectiveCallback);
		this._listenerEventNames.set(listenerId, name);
		this._ownerDocument?.registerListener(listenerId, this);
		const mutation = {
			action: "addEventListener",
			id: this._nodeId,
			name,
			listenerId
		};
		this.collector.add(mutation);
	}
	getEventListener(listenerId) {
		return this._eventListeners.get(listenerId);
	}
	removeEventListener(_name, callback) {
		for (const [listenerId, cb] of this._eventListeners.entries()) if (cb === callback) {
			this._eventListeners.delete(listenerId);
			this._listenerEventNames.delete(listenerId);
			this._ownerDocument?.unregisterListener(listenerId);
			const mutation = {
				action: "removeEventListener",
				id: this._nodeId,
				listenerId
			};
			this.collector.add(mutation);
			break;
		}
	}
	_dispatchBubbledEvent(event) {
		for (const [listenerId, cb] of this._eventListeners.entries()) if (this._listenerEventNames.get(listenerId) === event.type) {
			cb(event);
			if (event.immediatePropagationStopped) break;
		}
	}
	/**
	* Recursively clean up this element and all children from the document's registries.
	* Called before emitting removal mutations to prevent memory leaks.
	*/
	_cleanupFromDocument() {
		for (const listenerId of this._eventListeners.keys()) this._ownerDocument?.unregisterListener(listenerId);
		this._eventListeners.clear();
		this._listenerEventNames.clear();
		this._onHandlers.clear();
		if (this._ownerDocument) this._ownerDocument.unregisterElement(this._nodeId);
		for (const child of this.childNodes) if (child instanceof VirtualElement) child._cleanupFromDocument();
		else if (this._ownerDocument) this._ownerDocument.unregisterElement(child._nodeId);
	}
	preventDefaultFor(eventName) {
		const mutation = {
			action: "configureEvent",
			id: this._nodeId,
			name: eventName,
			preventDefault: true
		};
		this.collector.add(mutation);
	}
	_setOnHandler(eventName, cb) {
		const prev = this._onHandlers.get(eventName);
		if (prev) this.removeEventListener(eventName, prev);
		if (cb) {
			this.addEventListener(eventName, cb);
			this._onHandlers.set(eventName, cb);
		} else this._onHandlers.delete(eventName);
	}
	set onclick(cb) {
		this._setOnHandler("click", cb);
	}
	set ondblclick(cb) {
		this._setOnHandler("dblclick", cb);
	}
	set onmouseenter(cb) {
		this._setOnHandler("mouseenter", cb);
	}
	set onmouseleave(cb) {
		this._setOnHandler("mouseleave", cb);
	}
	set onmousedown(cb) {
		this._setOnHandler("mousedown", cb);
	}
	set onmouseup(cb) {
		this._setOnHandler("mouseup", cb);
	}
	set onmouseover(cb) {
		this._setOnHandler("mouseover", cb);
	}
	set onmousemove(cb) {
		this._setOnHandler("mousemove", cb);
	}
	set onkeydown(cb) {
		this._setOnHandler("keydown", cb);
	}
	set onkeyup(cb) {
		this._setOnHandler("keyup", cb);
	}
	set onkeypress(cb) {
		this._setOnHandler("keypress", cb);
	}
	set onchange(cb) {
		this._setOnHandler("change", cb);
	}
	set oncontextmenu(cb) {
		this._setOnHandler("contextmenu", cb);
	}
	set oninput(cb) {
		this._setOnHandler("input", cb);
	}
	set onfocus(cb) {
		this._setOnHandler("focus", cb);
	}
	set onblur(cb) {
		this._setOnHandler("blur", cb);
	}
	set onsubmit(cb) {
		this._setOnHandler("submit", cb);
	}
	get firstChild() {
		return this.childNodes[0] ?? null;
	}
	get lastChild() {
		return this.childNodes[this.childNodes.length - 1] ?? null;
	}
	get nextSibling() {
		if (!this.parentNode) return null;
		const idx = this.parentNode.childNodes.indexOf(this);
		return this.parentNode.childNodes[idx + 1] ?? null;
	}
	get previousSibling() {
		if (!this.parentNode) return null;
		const idx = this.parentNode.childNodes.indexOf(this);
		return this.parentNode.childNodes[idx - 1] ?? null;
	}
	get parentElement() {
		return this.parentNode;
	}
	get ownerDocument() {
		return this._ownerDocument;
	}
	get isConnected() {
		let current = this;
		while (current) {
			if (current._ownerDocument && current === current._ownerDocument.documentElement) return true;
			current = current.parentNode;
		}
		return false;
	}
	getRootNode() {
		let current = this;
		while (current.parentNode) current = current.parentNode;
		return current;
	}
	get nextElementSibling() {
		if (!this.parentNode) return null;
		const siblings = this.parentNode.childNodes;
		const idx = siblings.indexOf(this);
		for (let i = idx + 1; i < siblings.length; i++) if (siblings[i].nodeType === 1) return siblings[i];
		return null;
	}
	get previousElementSibling() {
		if (!this.parentNode) return null;
		const siblings = this.parentNode.childNodes;
		const idx = siblings.indexOf(this);
		for (let i = idx - 1; i >= 0; i--) if (siblings[i].nodeType === 1) return siblings[i];
		return null;
	}
	hasChildNodes() {
		return this.childNodes.length > 0;
	}
	replaceChild(newChild, oldChild) {
		if (this.childNodes.indexOf(oldChild) === -1) return oldChild;
		this.insertBefore(newChild, oldChild);
		this.removeChild(oldChild);
		return oldChild;
	}
	normalize() {}
	dispatchEvent(event) {
		const evt = event;
		if (evt.type) this._dispatchBubbledEvent(evt);
		return true;
	}
	cloneNode(deep) {
		const clone = new VirtualElement(this.nodeName, this.collector);
		const createMutation = {
			action: "createNode",
			id: clone._nodeId,
			tag: this.tagName,
			textContent: this._textContent || ""
		};
		this.collector.add(createMutation);
		for (const [k, v] of this._attributes) clone.setAttribute(k, v);
		clone._classes = [...this._classes];
		clone._ownerDocument = this._ownerDocument;
		if (deep) for (const child of this.childNodes) clone.appendChild(child.cloneNode(true));
		return clone;
	}
	get dataset() {
		if (this._datasetProxy) return this._datasetProxy;
		const el = this;
		this._datasetProxy = new Proxy({}, {
			get(_target, prop) {
				if (typeof prop !== "string") return void 0;
				const attrName = `data-${toKebabCase(prop)}`;
				return el.getAttribute(attrName) ?? void 0;
			},
			set(_target, prop, value) {
				if (typeof prop !== "string") return true;
				const attrName = `data-${toKebabCase(prop)}`;
				el.setAttribute(attrName, String(value));
				return true;
			},
			deleteProperty(_target, prop) {
				if (typeof prop !== "string") return true;
				const attrName = `data-${toKebabCase(prop)}`;
				el.removeAttribute(attrName);
				return true;
			},
			has(_target, prop) {
				if (typeof prop !== "string") return false;
				const attrName = `data-${toKebabCase(prop)}`;
				return el.hasAttribute(attrName);
			},
			ownKeys() {
				const keys = [];
				const attrs = el.attributes;
				for (let i = 0; i < attrs.length; i++) {
					const attr = attrs.item(i);
					if (attr?.name.startsWith("data-")) keys.push(kebabToCamel(attr.name.slice(5)));
				}
				return keys;
			},
			getOwnPropertyDescriptor(_target, prop) {
				if (typeof prop !== "string") return void 0;
				const attrName = `data-${toKebabCase(prop)}`;
				if (!el.hasAttribute(attrName)) return void 0;
				return {
					configurable: true,
					enumerable: true,
					writable: true,
					value: el.getAttribute(attrName)
				};
			}
		});
		return this._datasetProxy;
	}
	insertAdjacentHTML(position, html) {
		const mutation = {
			action: "insertAdjacentHTML",
			id: this._nodeId,
			position,
			html
		};
		this.collector.add(mutation);
	}
	contains(other) {
		if (!other) return false;
		if (other === this) return true;
		return this.childNodes.some((child) => child === other || child instanceof VirtualElement && child.contains(other));
	}
	querySelector(selector) {
		return querySelector(this, selector);
	}
	querySelectorAll(selector) {
		return querySelectorAll(this, selector);
	}
	matches(selector) {
		return matches(this, selector);
	}
	getElementsByTagName(tagName) {
		const upper = tagName.toUpperCase();
		return querySelectorAll(this, upper === "*" ? "*" : tagName);
	}
	getElementsByClassName(className) {
		const selector = className.split(/\s+/).filter(Boolean).map((c) => `.${c}`).join("");
		return querySelectorAll(this, selector);
	}
	closest(selector) {
		let current = this;
		while (current) {
			if (matches(current, selector)) return current;
			current = current.parentNode;
		}
		return null;
	}
	focus() {}
	blur() {}
	getBoundingClientRect() {
		const channel = this._ownerDocument?._syncChannel;
		if (channel) {
			const result = channel.request(QueryType.BoundingRect, JSON.stringify({ nodeId: this._nodeId }));
			if (result && typeof result === "object") {
				const r = result;
				return {
					top: r.top ?? 0,
					left: r.left ?? 0,
					right: r.right ?? 0,
					bottom: r.bottom ?? 0,
					width: r.width ?? 0,
					height: r.height ?? 0,
					x: r.x ?? r.left ?? 0,
					y: r.y ?? r.top ?? 0
				};
			}
		}
		return {
			top: 0,
			left: 0,
			right: 0,
			bottom: 0,
			width: 0,
			height: 0,
			x: 0,
			y: 0
		};
	}
	_parseAndSetStyles(value) {
		for (const part of value.split(";")) {
			const colonIdx = part.indexOf(":");
			if (colonIdx === -1) continue;
			const key = part.slice(0, colonIdx).trim();
			const val = part.slice(colonIdx + 1).trim();
			if (key) this.style[key] = val;
		}
	}
};
/**
* Virtual text node.
*/
var VirtualTextNode = class VirtualTextNode {
	static ELEMENT_NODE = 1;
	static TEXT_NODE = 3;
	static COMMENT_NODE = 8;
	static DOCUMENT_NODE = 9;
	static DOCUMENT_FRAGMENT_NODE = 11;
	nodeType = 3;
	nodeName = "#text";
	parentNode = null;
	_ownerDocument = null;
	_nodeValue;
	constructor(text, _nodeId, collector) {
		this._nodeId = _nodeId;
		this.collector = collector;
		this._nodeValue = text;
	}
	get parentElement() {
		return this.parentNode;
	}
	get nodeValue() {
		return this._nodeValue;
	}
	set nodeValue(value) {
		this._nodeValue = value;
		const mutation = {
			action: "setProperty",
			id: this._nodeId,
			property: "nodeValue",
			value
		};
		this.collector.add(mutation);
	}
	get textContent() {
		return this._nodeValue;
	}
	set textContent(value) {
		this.nodeValue = value;
	}
	remove() {
		if (this.parentNode) this.parentNode.childNodes = this.parentNode.childNodes.filter((c) => c !== this);
		this.parentNode = null;
		const mutation = {
			action: "removeNode",
			id: this._nodeId
		};
		this.collector.add(mutation);
	}
	cloneNode(_deep) {
		return new VirtualTextNode(this._nodeValue, createNodeId(), this.collector);
	}
};
/**
* Virtual comment node.
*/
var VirtualCommentNode = class VirtualCommentNode {
	static ELEMENT_NODE = 1;
	static TEXT_NODE = 3;
	static COMMENT_NODE = 8;
	static DOCUMENT_NODE = 9;
	static DOCUMENT_FRAGMENT_NODE = 11;
	nodeType = 8;
	nodeName = "#comment";
	parentNode = null;
	_ownerDocument = null;
	_nodeValue;
	constructor(text, _nodeId, collector) {
		this._nodeId = _nodeId;
		this.collector = collector;
		this._nodeValue = text;
	}
	get parentElement() {
		return this.parentNode;
	}
	get nodeValue() {
		return this._nodeValue;
	}
	set nodeValue(value) {
		this._nodeValue = value;
	}
	get textContent() {
		return this._nodeValue;
	}
	remove() {
		if (this.parentNode) this.parentNode.childNodes = this.parentNode.childNodes.filter((c) => c !== this);
		this.parentNode = null;
		const mutation = {
			action: "removeNode",
			id: this._nodeId
		};
		this.collector.add(mutation);
	}
	cloneNode(_deep) {
		return new VirtualCommentNode(this._nodeValue, createNodeId(), this.collector);
	}
};
var VirtualClassList = class {
	constructor(element) {
		this.element = element;
	}
	add(name) {
		const classes = this.element.className.split(" ").filter(Boolean);
		if (!classes.includes(name)) {
			classes.push(name);
			this.element.className = classes.join(" ");
		}
	}
	remove(name) {
		const classes = this.element.className.split(" ").filter((c) => c !== name && c !== "");
		this.element.className = classes.join(" ");
	}
	contains(name) {
		return this.element.className.split(" ").includes(name);
	}
	toggle(name, force) {
		const has = this.contains(name);
		if (force !== void 0) {
			if (force && !has) this.add(name);
			else if (!force && has) this.remove(name);
			return force;
		}
		if (has) {
			this.remove(name);
			return false;
		}
		this.add(name);
		return true;
	}
};
//#endregion
//#region src/worker-thread/events.ts
/**
* Virtual event classes that simulate DOM event behavior
* including bubbling, propagation control, and default prevention.
*/
var VirtualEvent = class {
	type;
	target;
	currentTarget;
	bubbles;
	cancelable;
	defaultPrevented = false;
	timeStamp;
	isTrusted;
	eventPhase = 0;
	_stopPropagation = false;
	_stopImmediatePropagation = false;
	constructor(type, init) {
		this.type = type;
		this.target = init?.target ?? null;
		this.currentTarget = init?.currentTarget ?? null;
		this.bubbles = init?.bubbles ?? false;
		this.cancelable = init?.cancelable ?? true;
		this.timeStamp = init?.timeStamp ?? Date.now();
		this.isTrusted = init?.isTrusted ?? false;
		if (init) {
			for (const key of Object.keys(init)) if (!(key in this)) this[key] = init[key];
		}
	}
	preventDefault() {
		if (this.cancelable) this.defaultPrevented = true;
	}
	stopPropagation() {
		this._stopPropagation = true;
	}
	stopImmediatePropagation() {
		this._stopImmediatePropagation = true;
		this._stopPropagation = true;
	}
	get propagationStopped() {
		return this._stopPropagation;
	}
	get immediatePropagationStopped() {
		return this._stopImmediatePropagation;
	}
};
//#endregion
//#region src/worker-thread/mutation-collector.ts
const MAX_COALESCED_LOG = 50;
/**
* Collects DOM mutations during synchronous execution and flushes them
* as a batched message at the end of the current microtask.
*/
var MutationCollector = class {
	queue = [];
	scheduled = false;
	uidCounter = 0;
	transport = null;
	_coalesceEnabled = true;
	_stats = {
		added: 0,
		coalesced: 0,
		flushed: 0
	};
	_coalescedLog = [];
	_perTypeCoalesced = /* @__PURE__ */ new Map();
	getStats() {
		return { ...this._stats };
	}
	getCoalescedLog() {
		return this._coalescedLog.slice();
	}
	getPerTypeCoalesced() {
		const result = {};
		for (const [action, counts] of this._perTypeCoalesced) result[action] = { ...counts };
		return result;
	}
	constructor(appId) {
		this.appId = appId;
	}
	enableCoalescing(enabled) {
		this._coalesceEnabled = enabled;
	}
	setTransport(transport) {
		this.transport = transport;
	}
	add(mutation) {
		this._stats.added++;
		const counts = this._perTypeCoalesced.get(mutation.action);
		if (counts) counts.added++;
		else this._perTypeCoalesced.set(mutation.action, {
			added: 1,
			coalesced: 0
		});
		this.queue.push(mutation);
		if (!this.scheduled) {
			this.scheduled = true;
			queueMicrotask(() => this.flush());
		}
	}
	coalesce(mutations) {
		if (mutations.length <= 1) return mutations;
		const lastIndex = /* @__PURE__ */ new Map();
		const toRemove = /* @__PURE__ */ new Set();
		const createdAt = /* @__PURE__ */ new Map();
		const attachedIds = /* @__PURE__ */ new Set();
		const eliminatedIds = /* @__PURE__ */ new Set();
		for (let i = 0; i < mutations.length; i++) {
			const m = mutations[i];
			let key = null;
			switch (m.action) {
				case "setStyle":
					key = `setStyle:${m.id}:${m.property}`;
					break;
				case "setAttribute":
					key = `setAttribute:${m.id}:${m.name}`;
					break;
				case "setClassName":
					key = `setClassName:${m.id}`;
					break;
				case "setTextContent":
					key = `setTextContent:${m.id}`;
					break;
				case "setProperty":
					key = `setProperty:${m.id}:${m.property}`;
					break;
				case "setHTML":
					key = `setHTML:${m.id}`;
					break;
				case "createNode":
					createdAt.set(m.id, i);
					break;
				case "appendChild":
					attachedIds.add(m.childId);
					break;
				case "insertBefore":
					attachedIds.add(m.newId);
					break;
				case "removeNode":
					if (createdAt.has(m.id) && !attachedIds.has(m.id)) {
						const createdIdx = createdAt.get(m.id);
						if (createdIdx !== void 0) toRemove.add(createdIdx);
						toRemove.add(i);
						createdAt.delete(m.id);
						eliminatedIds.add(m.id);
					}
					break;
			}
			if (key !== null) {
				const prev = lastIndex.get(key);
				if (prev !== void 0) toRemove.add(prev);
				lastIndex.set(key, i);
			}
		}
		if (eliminatedIds.size > 0) for (let j = 0; j < mutations.length; j++) {
			if (toRemove.has(j)) continue;
			const mut = mutations[j];
			if ("id" in mut && eliminatedIds.has(mut.id)) toRemove.add(j);
		}
		if (toRemove.size > 0) {
			const now = Date.now();
			for (const idx of toRemove) {
				const removed = mutations[idx];
				const action = removed.action;
				const entry = {
					action,
					key: this._buildKey(removed),
					timestamp: now
				};
				this._coalescedLog.push(entry);
				if (this._coalescedLog.length > MAX_COALESCED_LOG) this._coalescedLog.shift();
				const counts = this._perTypeCoalesced.get(action);
				if (counts) counts.coalesced++;
			}
		}
		if (toRemove.size === 0) return mutations;
		return mutations.filter((_, i) => !toRemove.has(i));
	}
	_buildKey(m) {
		switch (m.action) {
			case "setStyle": return `setStyle:${m.id}:${m.property}`;
			case "setAttribute": return `setAttribute:${m.id}:${m.name}`;
			case "setClassName": return `setClassName:${m.id}`;
			case "setTextContent": return `setTextContent:${m.id}`;
			case "setProperty": return `setProperty:${m.id}:${m.property}`;
			case "setHTML": return `setHTML:${m.id}`;
			default: return `${m.action}:${"id" in m ? m.id : "?"}`;
		}
	}
	flush() {
		if (this.queue.length === 0) {
			this.scheduled = false;
			return;
		}
		const rawLength = this.queue.length;
		const batch = this._coalesceEnabled ? this.coalesce(this.queue.splice(0)) : this.queue.splice(0);
		this.scheduled = false;
		this._stats.coalesced += rawLength - batch.length;
		this._stats.flushed += batch.length;
		if (batch.length === 0) return;
		this.uidCounter++;
		if (this.transport?.readyState !== "open") return;
		const message = {
			type: "mutation",
			appId: this.appId,
			uid: this.uidCounter,
			mutations: batch
		};
		this.transport.send(message);
	}
	/** Force-flush all pending mutations immediately */
	flushSync() {
		this.flush();
	}
	/** Get number of pending mutations (useful for testing) */
	get pendingCount() {
		return this.queue.length;
	}
};
//#endregion
//#region src/worker-thread/document.ts
/**
* Virtual Document that exists in a worker thread.
* All DOM mutations are recorded and batched via MutationCollector.
*/
var VirtualDocument = class {
	body;
	head;
	documentElement;
	nodeType = 9;
	nodeName = "#document";
	collector;
	_defaultView = null;
	_syncChannel = null;
	_ids = /* @__PURE__ */ new Map();
	_nodeIdToElement = /* @__PURE__ */ new Map();
	_listenerMap = /* @__PURE__ */ new Map();
	_listenerToElement = /* @__PURE__ */ new Map();
	_listenerCounter = 0;
	constructor(appId) {
		this.collector = new MutationCollector(appId);
		this.documentElement = new VirtualElement("HTML", this.collector, 3);
		this.head = new VirtualElement("HEAD", this.collector, 2);
		this.body = new VirtualElement("BODY", this.collector, 1);
		this.documentElement._ownerDocument = this;
		this.head._ownerDocument = this;
		this.body._ownerDocument = this;
		this.documentElement.appendChild(this.head);
		this.documentElement.appendChild(this.body);
		this.collector.flush();
	}
	createElement(tag) {
		const id = createNodeId();
		const element = new VirtualElement(tag, this.collector, id);
		element._ownerDocument = this;
		this._nodeIdToElement.set(id, element);
		const mutation = {
			action: "createNode",
			id,
			tag: element.tagName,
			textContent: ""
		};
		this.collector.add(mutation);
		return element;
	}
	createElementNS(ns, tag) {
		const el = this.createElement(tag);
		el._setNamespaceURI(ns);
		return el;
	}
	createTextNode(text) {
		const id = createNodeId();
		const node = new VirtualTextNode(text, id, this.collector);
		node._ownerDocument = this;
		const mutation = {
			action: "createNode",
			id,
			tag: "#text",
			textContent: text
		};
		this.collector.add(mutation);
		return node;
	}
	createComment(text) {
		const id = createNodeId();
		const node = new VirtualCommentNode(text, id, this.collector);
		node._ownerDocument = this;
		const mutation = {
			action: "createComment",
			id,
			textContent: text
		};
		this.collector.add(mutation);
		return node;
	}
	createDocumentFragment() {
		const frag = new VirtualElement("#document-fragment", this.collector, createNodeId());
		frag._ownerDocument = this;
		return frag;
	}
	getElementById(id) {
		return this._ids.get(id) ?? null;
	}
	addEventListener(name, callback) {
		if (!name) return;
		const listenerId = `document_${name}_${++this._listenerCounter}`;
		this._listenerMap.set(listenerId, callback);
		const mutation = {
			action: "addEventListener",
			id: 4,
			name,
			listenerId
		};
		this.collector.add(mutation);
	}
	removeEventListener(_name, callback) {
		for (const [listenerId, cb] of this._listenerMap.entries()) if (cb === callback) {
			this._listenerMap.delete(listenerId);
			const mutation = {
				action: "removeEventListener",
				id: 4,
				listenerId
			};
			this.collector.add(mutation);
			break;
		}
	}
	/**
	* Route an event from the main thread to the appropriate listener.
	* Resolves serialized target IDs to actual VirtualElement references.
	*/
	_resolveTarget(value) {
		if (typeof value === "number") return this._nodeIdToElement.get(value) ?? null;
		if (typeof value === "string") {
			const num = Number(value);
			if (!Number.isNaN(num)) return this._nodeIdToElement.get(num) ?? null;
			return this._ids.get(value) ?? null;
		}
		return null;
	}
	dispatchEvent(listenerId, event) {
		const evt = event;
		if (evt.target != null && typeof evt.target !== "object") evt.target = this._resolveTarget(evt.target);
		if (evt.currentTarget != null && typeof evt.currentTarget !== "object") evt.currentTarget = this._resolveTarget(evt.currentTarget);
		if (evt.relatedTarget != null && typeof evt.relatedTarget !== "object") evt.relatedTarget = this._resolveTarget(evt.relatedTarget);
		const virtualEvent = new VirtualEvent(evt.type, evt);
		const targetEl = virtualEvent.target;
		if (targetEl && typeof targetEl === "object" && "_updateInputState" in targetEl) {
			const inputState = {};
			if (evt.value !== void 0) inputState.value = evt.value;
			if (evt.checked !== void 0) inputState.checked = evt.checked;
			if (evt.selectedIndex !== void 0) inputState.selectedIndex = evt.selectedIndex;
			if (Object.keys(inputState).length > 0) targetEl._updateInputState(inputState);
		}
		const docListener = this._listenerMap.get(listenerId);
		if (docListener) {
			docListener(virtualEvent);
			return;
		}
		const targetElement = this._listenerToElement.get(listenerId) ?? null;
		if (targetElement) {
			virtualEvent.currentTarget = targetElement;
			targetElement._dispatchBubbledEvent(virtualEvent);
			if (virtualEvent.bubbles && !virtualEvent.propagationStopped) {
				let current = targetElement.parentNode;
				while (current && !virtualEvent.propagationStopped) {
					virtualEvent.currentTarget = current;
					current._dispatchBubbledEvent(virtualEvent);
					if (virtualEvent.propagationStopped) break;
					current = current.parentNode;
				}
			}
		}
	}
	/**
	* Register an element by its internal NodeId.
	*/
	registerElement(id, element) {
		this._nodeIdToElement.set(id, element);
	}
	/**
	* Unregister an element by its internal NodeId (called during cleanup on removal).
	*/
	unregisterElement(id) {
		this._nodeIdToElement.delete(id);
	}
	/**
	* Register an element by its user-visible id attribute (distinct from internal NodeId).
	*/
	registerElementById(id, element) {
		this._ids.set(id, element);
	}
	/**
	* Unregister an element by its user-visible id attribute.
	*/
	unregisterElementById(id) {
		this._ids.delete(id);
	}
	/**
	* Register a listener ID to its owning element for O(1) event dispatch.
	*/
	registerListener(listenerId, element) {
		this._listenerToElement.set(listenerId, element);
	}
	/**
	* Unregister a listener ID (called on removeEventListener or element cleanup).
	*/
	unregisterListener(listenerId) {
		this._listenerToElement.delete(listenerId);
	}
	createEvent(_type) {
		return {
			type: "",
			initEvent(type, bubbles, cancelable) {
				this.type = type;
				this.bubbles = bubbles ?? false;
				this.cancelable = cancelable ?? false;
			},
			bubbles: false,
			cancelable: false,
			preventDefault() {},
			stopPropagation() {},
			stopImmediatePropagation() {}
		};
	}
	get activeElement() {
		return this.body;
	}
	createRange() {
		const doc = this;
		return {
			createContextualFragment(_html) {
				return doc.createDocumentFragment();
			},
			setStart() {},
			setEnd() {},
			collapse() {},
			selectNodeContents() {},
			cloneRange() {
				return doc.createRange();
			}
		};
	}
	createTreeWalker(root, _whatToShow) {
		const nodes = [];
		function collect(node) {
			nodes.push(node);
			if (node instanceof VirtualElement) for (const child of node.childNodes) collect(child);
		}
		collect(root);
		let idx = 0;
		return {
			currentNode: root,
			nextNode() {
				idx++;
				if (idx < nodes.length) {
					this.currentNode = nodes[idx];
					return nodes[idx];
				}
				return null;
			}
		};
	}
	querySelector(selector) {
		if (selector.startsWith("#")) {
			const found = this.getElementById(selector.slice(1));
			if (found) return found;
		}
		return querySelector(this.body, selector) ?? querySelector(this.head, selector);
	}
	querySelectorAll(selector) {
		return [...querySelectorAll(this.head, selector), ...querySelectorAll(this.body, selector)];
	}
	getElementsByTagName(tagName) {
		const upper = tagName.toUpperCase();
		return this.querySelectorAll(upper === "*" ? "*" : tagName);
	}
	getElementsByClassName(className) {
		const selector = className.split(/\s+/).filter(Boolean).map((c) => `.${c}`).join("");
		return this.querySelectorAll(selector);
	}
	get defaultView() {
		return this._defaultView;
	}
	get ownerDocument() {
		return this;
	}
	toJSON() {
		return this._serializeNode(this.documentElement);
	}
	_serializeNode(node) {
		if (node.nodeType === 3) return {
			type: "text",
			id: node._nodeId,
			text: node.nodeValue
		};
		if (node.nodeType === 8) return {
			type: "comment",
			id: node._nodeId,
			text: node.nodeValue
		};
		const el = node;
		const attrs = {};
		const a = el.attributes;
		for (let i = 0; i < a.length; i++) {
			const attr = a.item(i);
			if (attr) attrs[attr.name] = attr.value;
		}
		return {
			type: "element",
			id: el._nodeId,
			tag: el.tagName,
			...Object.keys(attrs).length > 0 ? { attributes: attrs } : {},
			...el.className ? { className: el.className } : {},
			children: el.childNodes.map((c) => this._serializeNode(c))
		};
	}
};
//#endregion
//#region src/worker-thread/observers.ts
/**
* Stub observer classes that prevent crashes when frameworks
* attempt to use browser observers in a worker context.
*/
var VirtualMutationObserver = class {
	constructor(_callback) {}
	observe(_target, _options) {}
	disconnect() {}
	takeRecords() {
		return [];
	}
};
var VirtualResizeObserver = class {
	constructor(_callback) {}
	observe(_target, _options) {}
	unobserve(_target) {}
	disconnect() {}
};
var VirtualIntersectionObserver = class {
	root = null;
	rootMargin = "0px";
	thresholds = [0];
	constructor(_callback, _options) {}
	observe(_target) {}
	unobserve(_target) {}
	disconnect() {}
	takeRecords() {
		return [];
	}
};
//#endregion
//#region src/worker-thread/index.ts
/**
* Creates a virtual DOM environment inside a Web Worker.
*
* Returns a `document` and `window` that can be used by frameworks
* or vanilla JS. All DOM mutations are automatically collected and
* sent to the main thread for rendering.
*/
function createWorkerDom(config) {
	const appId = config?.appId ?? createAppId("worker");
	const transport = config?.transport ?? new WorkerSelfTransport();
	const doc = new VirtualDocument(appId);
	doc.collector.setTransport(transport);
	transport.onMessage((message) => {
		if (isSystemMessage(message) && message.type === "debugQuery") {
			const debugMsg = message;
			let result = null;
			if (debugMsg.query === "tree") result = doc.toJSON();
			else if (debugMsg.query === "stats") result = doc.collector.getStats();
			else if (debugMsg.query === "pendingCount") result = doc.collector.pendingCount;
			else if (debugMsg.query === "coalescedLog") result = doc.collector.getCoalescedLog();
			else if (debugMsg.query === "perTypeCoalesced") result = doc.collector.getPerTypeCoalesced();
			transport.send({
				type: "debugResult",
				query: debugMsg.query,
				result
			});
			return;
		}
		if (isSystemMessage(message) && message.type === "init" && "location" in message) {
			const initMsg = message;
			const initLoc = initMsg.location;
			if (initLoc) {
				location.href = initLoc.href;
				location.protocol = initLoc.protocol;
				location.hostname = initLoc.hostname;
				location.port = initLoc.port;
				location.pathname = initLoc.pathname;
				location.search = initLoc.search;
				location.hash = initLoc.hash;
			}
			if (initMsg.sharedBuffer) doc._syncChannel = SyncChannel.fromBuffer(initMsg.sharedBuffer);
			return;
		}
		if (isEventMessage(message)) {
			const eventMsg = message;
			doc.dispatchEvent(eventMsg.listenerId, eventMsg.event);
		}
	});
	const workerScope = self;
	workerScope.onerror = (event, source, lineno, colno, error) => {
		const serializedError = {
			message: typeof event === "string" ? event : event.message ?? "Unknown worker error",
			stack: error?.stack,
			name: error?.name,
			filename: source ?? (typeof event !== "string" ? event.filename : void 0),
			lineno: lineno ?? (typeof event !== "string" ? event.lineno : void 0),
			colno: colno ?? (typeof event !== "string" ? event.colno : void 0)
		};
		transport.send({
			type: "error",
			appId,
			error: serializedError
		});
	};
	workerScope.onunhandledrejection = (event) => {
		const reason = event.reason;
		const serializedError = {
			message: reason instanceof Error ? reason.message : String(reason),
			stack: reason instanceof Error ? reason.stack : void 0,
			name: reason instanceof Error ? reason.name : "UnhandledRejection",
			isUnhandledRejection: true
		};
		transport.send({
			type: "error",
			appId,
			error: serializedError
		});
	};
	transport.send({
		type: "ready",
		appId
	});
	const storage = /* @__PURE__ */ new Map();
	const localStorage = {
		setItem(key, value) {
			storage.set(key, value);
		},
		getItem(key) {
			return storage.get(key) ?? null;
		},
		removeItem(key) {
			storage.delete(key);
		}
	};
	const location = {
		hash: "",
		href: "http://localhost/",
		port: "",
		host: "localhost",
		origin: "http://localhost",
		hostname: "localhost",
		pathname: "/",
		protocol: "http:",
		search: ""
	};
	const win = {
		document: doc,
		location,
		history: {
			state: null,
			pushState(state, title, url) {
				doc.collector.add({
					action: "pushState",
					state,
					title,
					url
				});
			},
			replaceState(state, title, url) {
				doc.collector.add({
					action: "replaceState",
					state,
					title,
					url
				});
			}
		},
		screen: {
			get width() {
				if (doc._syncChannel) {
					const result = doc._syncChannel.request(QueryType.WindowProperty, JSON.stringify({ property: "screen.width" }));
					if (typeof result === "number") return result;
				}
				return 1280;
			},
			get height() {
				if (doc._syncChannel) {
					const result = doc._syncChannel.request(QueryType.WindowProperty, JSON.stringify({ property: "screen.height" }));
					if (typeof result === "number") return result;
				}
				return 720;
			}
		},
		innerWidth: 1280,
		innerHeight: 720,
		localStorage,
		addEventListener(name, callback) {
			doc.addEventListener(name, callback);
		},
		removeEventListener(name, callback) {
			doc.removeEventListener(name, callback);
		},
		scrollTo(x, y) {
			doc.collector.add({
				action: "scrollTo",
				x,
				y
			});
		},
		getComputedStyle(el) {
			if (doc._syncChannel && el && typeof el === "object" && "_nodeId" in el) {
				const result = doc._syncChannel.request(QueryType.ComputedStyle, JSON.stringify({ nodeId: el._nodeId }));
				if (result && typeof result === "object") return result;
			}
			return {};
		},
		requestAnimationFrame(cb) {
			return setTimeout(() => cb(performance.now()), 16);
		},
		cancelAnimationFrame(id) {
			clearTimeout(id);
		},
		MutationObserver: VirtualMutationObserver,
		ResizeObserver: VirtualResizeObserver,
		IntersectionObserver: VirtualIntersectionObserver
	};
	Object.defineProperties(win, {
		innerWidth: {
			get() {
				if (doc._syncChannel) {
					const result = doc._syncChannel.request(QueryType.WindowProperty, JSON.stringify({ property: "innerWidth" }));
					if (typeof result === "number") return result;
				}
				return 1280;
			},
			configurable: true
		},
		innerHeight: {
			get() {
				if (doc._syncChannel) {
					const result = doc._syncChannel.request(QueryType.WindowProperty, JSON.stringify({ property: "innerHeight" }));
					if (typeof result === "number") return result;
				}
				return 720;
			},
			configurable: true
		}
	});
	doc._defaultView = win;
	if (config?.debug?.exposeDevtools) globalThis.__ASYNC_DOM_DEVTOOLS__ = {
		document: doc,
		tree: () => doc.toJSON(),
		findNode: (id) => doc.getElementById(id) ?? doc.querySelector(`[id="${id}"]`),
		stats: () => doc.collector.getStats(),
		mutations: () => ({ pending: doc.collector.pendingCount }),
		flush: () => doc.collector.flushSync()
	};
	if (config?.debug?.logMutations) resolveDebugHooks(config.debug);
	return {
		document: doc,
		window: win
	};
}
//#endregion
export { MutationCollector, VirtualCommentNode, VirtualDocument, VirtualElement, VirtualTextNode, createWorkerDom };

//# sourceMappingURL=worker.js.map