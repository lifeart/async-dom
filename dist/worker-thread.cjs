const require_sync_channel = require("./sync-channel.cjs");
const require_worker_transport = require("./worker-transport.cjs");
//#region src/platform.ts
/**
* Create a PlatformHost for Web Worker environments (uses `self`).
*/
function createWorkerPlatform() {
	return {
		navigator: {
			userAgent: self.navigator.userAgent,
			language: self.navigator.language,
			languages: self.navigator.languages,
			hardwareConcurrency: self.navigator.hardwareConcurrency
		},
		installErrorHandlers(onError, onUnhandledRejection) {
			const workerScope = self;
			const prevOnError = workerScope.onerror;
			const prevOnRejection = workerScope.onunhandledrejection;
			workerScope.onerror = (event, source, lineno, colno, error) => {
				onError(typeof event === "string" ? event : event.message ?? "Unknown worker error", error, source ?? (typeof event !== "string" ? event.filename : void 0), lineno ?? (typeof event !== "string" ? event.lineno : void 0), colno ?? (typeof event !== "string" ? event.colno : void 0));
			};
			workerScope.onunhandledrejection = (event) => {
				onUnhandledRejection(event.reason);
			};
			return () => {
				workerScope.onerror = prevOnError;
				workerScope.onunhandledrejection = prevOnRejection;
			};
		},
		onBeforeUnload(callback) {
			if (typeof self !== "undefined" && "addEventListener" in self) {
				self.addEventListener("beforeunload", callback);
				return () => {
					self.removeEventListener("beforeunload", callback);
				};
			}
			return () => {};
		}
	};
}
/**
* Create a PlatformHost for Node.js environments (uses `process`).
*/
function createNodePlatform() {
	const os = typeof globalThis !== "undefined" ? globalThis : {};
	return {
		navigator: {
			userAgent: `Node.js/${typeof process !== "undefined" ? process.version : "unknown"}`,
			language: "en-US",
			languages: ["en-US"],
			hardwareConcurrency: typeof os.navigator === "object" && os.navigator !== null && "hardwareConcurrency" in os.navigator ? os.navigator.hardwareConcurrency ?? 1 : 1
		},
		installErrorHandlers(onError, onUnhandledRejection) {
			if (typeof process === "undefined") return () => {};
			const onUncaught = (err) => {
				onError(err.message, err, void 0, void 0, void 0);
			};
			const onRejection = (reason) => {
				onUnhandledRejection(reason);
			};
			process.on("uncaughtException", onUncaught);
			process.on("unhandledRejection", onRejection);
			return () => {
				process.removeListener("uncaughtException", onUncaught);
				process.removeListener("unhandledRejection", onRejection);
			};
		},
		onBeforeUnload(callback) {
			if (typeof process === "undefined") return () => {};
			const handler = () => {
				callback();
			};
			process.on("beforeExit", handler);
			return () => {
				process.removeListener("beforeExit", handler);
			};
		}
	};
}
/**
* Auto-detect the current platform and create the appropriate PlatformHost.
*/
function detectPlatform() {
	if (typeof self !== "undefined" && typeof self.navigator !== "undefined") return createWorkerPlatform();
	return createNodePlatform();
}
//#endregion
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
			const result = channel.request(require_sync_channel.QueryType.NodeProperty, JSON.stringify({
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
		this._nodeId = id ?? require_sync_channel.createNodeId();
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
		if (this.childNodes.length === 0) return this._textContent;
		let result = "";
		for (const child of this.childNodes) if (child.nodeType === 3) result += child.nodeValue;
		else if (child.nodeType === 1) result += child.textContent;
		return result;
	}
	set textContent(value) {
		for (const child of this.childNodes) child.parentNode = null;
		this.childNodes.length = 0;
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
		this._textContent = "";
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
	_currentTime = 0;
	_duration = 0;
	_paused = true;
	_ended = false;
	_readyState = 0;
	get currentTime() {
		return this._currentTime;
	}
	set currentTime(v) {
		this._currentTime = v;
		this.collector.add({
			action: "setProperty",
			id: this._nodeId,
			property: "currentTime",
			value: v
		});
	}
	get duration() {
		return this._duration;
	}
	get paused() {
		return this._paused;
	}
	get ended() {
		return this._ended;
	}
	get readyState() {
		return this._readyState;
	}
	_updateMediaState(state) {
		if (state.currentTime !== void 0) this._currentTime = state.currentTime;
		if (state.duration !== void 0) this._duration = state.duration;
		if (state.paused !== void 0) this._paused = state.paused;
		if (state.ended !== void 0) this._ended = state.ended;
		if (state.readyState !== void 0) this._readyState = state.readyState;
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
		for (const [listenerId, cb] of this._eventListeners.entries()) if (cb === callback && this._listenerEventNames.get(listenerId) === _name) {
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
		if (this._ownerDocument) {
			const elId = this._attributes.get("id");
			if (elId) this._ownerDocument.unregisterElementById(elId);
			this._ownerDocument.unregisterElement(this._nodeId);
		}
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
	focus() {
		this.collector.add({
			action: "callMethod",
			id: this._nodeId,
			method: "focus",
			args: []
		});
	}
	blur() {
		this.collector.add({
			action: "callMethod",
			id: this._nodeId,
			method: "blur",
			args: []
		});
	}
	play() {
		this.collector.add({
			action: "callMethod",
			id: this._nodeId,
			method: "play",
			args: []
		});
	}
	pause() {
		this.collector.add({
			action: "callMethod",
			id: this._nodeId,
			method: "pause",
			args: []
		});
	}
	load() {
		this.collector.add({
			action: "callMethod",
			id: this._nodeId,
			method: "load",
			args: []
		});
	}
	click() {
		this.collector.add({
			action: "callMethod",
			id: this._nodeId,
			method: "click",
			args: []
		});
	}
	scrollIntoView(options) {
		this.collector.add({
			action: "callMethod",
			id: this._nodeId,
			method: "scrollIntoView",
			args: options ? [options] : []
		});
	}
	select() {
		this.collector.add({
			action: "callMethod",
			id: this._nodeId,
			method: "select",
			args: []
		});
	}
	showModal() {
		this.collector.add({
			action: "callMethod",
			id: this._nodeId,
			method: "showModal",
			args: []
		});
	}
	close() {
		this.collector.add({
			action: "callMethod",
			id: this._nodeId,
			method: "close",
			args: []
		});
	}
	getBoundingClientRect() {
		const channel = this._ownerDocument?._syncChannel;
		if (channel) {
			const result = channel.request(require_sync_channel.QueryType.BoundingRect, JSON.stringify({ nodeId: this._nodeId }));
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
	get nextSibling() {
		if (!this.parentNode) return null;
		const siblings = this.parentNode.childNodes;
		return siblings[siblings.indexOf(this) + 1] ?? null;
	}
	get previousSibling() {
		if (!this.parentNode) return null;
		const siblings = this.parentNode.childNodes;
		return siblings[siblings.indexOf(this) - 1] ?? null;
	}
	get childNodes() {
		return [];
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
		const id = require_sync_channel.createNodeId();
		const clone = new VirtualTextNode(this._nodeValue, id, this.collector);
		clone._ownerDocument = this._ownerDocument;
		const mutation = {
			action: "createNode",
			id,
			tag: "#text",
			textContent: this._nodeValue
		};
		this.collector.add(mutation);
		return clone;
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
	get nextSibling() {
		if (!this.parentNode) return null;
		const siblings = this.parentNode.childNodes;
		return siblings[siblings.indexOf(this) + 1] ?? null;
	}
	get previousSibling() {
		if (!this.parentNode) return null;
		const siblings = this.parentNode.childNodes;
		return siblings[siblings.indexOf(this) - 1] ?? null;
	}
	get childNodes() {
		return [];
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
		const id = require_sync_channel.createNodeId();
		const clone = new VirtualCommentNode(this._nodeValue, id, this.collector);
		clone._ownerDocument = this._ownerDocument;
		const mutation = {
			action: "createComment",
			id,
			textContent: this._nodeValue
		};
		this.collector.add(mutation);
		return clone;
	}
};
var VirtualClassList = class {
	constructor(element) {
		this.element = element;
	}
	add(...names) {
		const classes = this.element.className.split(" ").filter(Boolean);
		for (const name of names) if (!classes.includes(name)) classes.push(name);
		this.element.className = classes.join(" ");
	}
	remove(...names) {
		const nameSet = new Set(names);
		const classes = this.element.className.split(" ").filter((c) => c !== "" && !nameSet.has(c));
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
	get length() {
		return this.element.className.split(" ").filter(Boolean).length;
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
var VirtualCustomEvent = class extends VirtualEvent {
	detail;
	constructor(type, init) {
		super(type, init);
		this.detail = init?.detail ?? null;
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
	/** Total mutations added (monotonically increasing counter for diff-based tracking). */
	get totalAdded() {
		return this._stats.added;
	}
	/** Feature 15: Current causal event tag for this flush cycle */
	_causalEvent = null;
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
	/** Feature 15: Set the causal event for the current mutation cycle. */
	setCausalEvent(event) {
		this._causalEvent = event;
	}
	/** Feature 15: Get current causal event. */
	getCausalEvent() {
		return this._causalEvent;
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
		const perfMarkName = `async-dom:flush:${this.appId}`;
		if (typeof performance !== "undefined" && performance.mark) performance.mark(`${perfMarkName}:start`);
		const rawLength = this.queue.length;
		const batch = this._coalesceEnabled ? this.coalesce(this.queue.splice(0)) : this.queue.splice(0);
		this.scheduled = false;
		this._stats.coalesced += rawLength - batch.length;
		this._stats.flushed += batch.length;
		if (batch.length === 0) {
			this._causalEvent = null;
			return;
		}
		this.uidCounter++;
		if (this.transport?.readyState !== "open") {
			this._causalEvent = null;
			return;
		}
		const message = {
			type: "mutation",
			appId: this.appId,
			uid: this.uidCounter,
			mutations: batch,
			sentAt: Date.now()
		};
		if (this._causalEvent) {
			message.causalEvent = this._causalEvent;
			this._causalEvent = null;
		}
		this.transport.send(message);
		if (typeof performance !== "undefined" && performance.mark && performance.measure) {
			performance.mark(`${perfMarkName}:end`);
			try {
				performance.measure(perfMarkName, `${perfMarkName}:start`, `${perfMarkName}:end`);
			} catch {}
		}
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
	_title = "";
	_cookie = "";
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
		this._nodeIdToElement.set(3, this.documentElement);
		this._nodeIdToElement.set(2, this.head);
		this._nodeIdToElement.set(1, this.body);
		this.documentElement.appendChild(this.head);
		this.documentElement.appendChild(this.body);
		this.collector.flush();
	}
	createElement(tag) {
		const id = require_sync_channel.createNodeId();
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
		const id = require_sync_channel.createNodeId();
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
		const id = require_sync_channel.createNodeId();
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
		const frag = new VirtualElement("#document-fragment", this.collector, require_sync_channel.createNodeId());
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
		const eventType = evt.type ?? "unknown";
		this.collector.setCausalEvent({
			eventType,
			listenerId,
			timestamp: Date.now()
		});
		const perfMarkName = `async-dom:event:${eventType}:${listenerId}`;
		if (typeof performance !== "undefined" && performance.mark) performance.mark(`${perfMarkName}:start`);
		const targetEl = virtualEvent.target;
		if (targetEl && typeof targetEl === "object" && "_updateInputState" in targetEl) {
			const inputState = {};
			if (evt.value !== void 0) inputState.value = evt.value;
			if (evt.checked !== void 0) inputState.checked = evt.checked;
			if (evt.selectedIndex !== void 0) inputState.selectedIndex = evt.selectedIndex;
			if (Object.keys(inputState).length > 0) targetEl._updateInputState(inputState);
		}
		if (targetEl && typeof targetEl === "object") {
			const mediaState = {};
			if (evt.currentTime !== void 0) mediaState.currentTime = evt.currentTime;
			if (evt.duration !== void 0) mediaState.duration = evt.duration;
			if (evt.paused !== void 0) mediaState.paused = evt.paused;
			if (evt.ended !== void 0) mediaState.ended = evt.ended;
			if (evt.readyState !== void 0) mediaState.readyState = evt.readyState;
			if (Object.keys(mediaState).length > 0 && "_updateMediaState" in targetEl) targetEl._updateMediaState(mediaState);
		}
		const docListener = this._listenerMap.get(listenerId);
		if (docListener) {
			docListener(virtualEvent);
			this._finishEventPerf(perfMarkName);
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
		this._finishEventPerf(perfMarkName);
	}
	/** Feature 16: finish performance measurement for an event dispatch */
	_finishEventPerf(perfMarkName) {
		if (typeof performance !== "undefined" && performance.mark && performance.measure) {
			performance.mark(`${perfMarkName}:end`);
			try {
				performance.measure(perfMarkName, `${perfMarkName}:start`, `${perfMarkName}:end`);
			} catch {}
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
	get title() {
		return this._title;
	}
	set title(value) {
		this._title = value;
	}
	get URL() {
		return this._defaultView?.location?.href ?? "";
	}
	get location() {
		return this._defaultView?.location ?? null;
	}
	get cookie() {
		return this._cookie;
	}
	set cookie(value) {
		this._cookie = value;
	}
	get readyState() {
		return "complete";
	}
	get compatMode() {
		return "CSS1Compat";
	}
	get characterSet() {
		return "UTF-8";
	}
	get contentType() {
		return "text/html";
	}
	get visibilityState() {
		return "visible";
	}
	get hidden() {
		return false;
	}
	get childNodes() {
		return [this.documentElement];
	}
	get children() {
		return [this.documentElement];
	}
	get firstChild() {
		return this.documentElement;
	}
	contains(node) {
		if (node === this) return true;
		return this.documentElement.contains(node);
	}
	get implementation() {
		return { hasFeature() {
			return false;
		} };
	}
	get defaultView() {
		return this._defaultView;
	}
	get ownerDocument() {
		return this;
	}
	/**
	* Clean up all internal state. Called when the worker DOM instance is being destroyed.
	* Clears element registries, listener maps, and resets counters.
	*/
	destroy() {
		this.collector.flushSync();
		this._ids.clear();
		this._nodeIdToElement.clear();
		this._listenerMap.clear();
		this._listenerToElement.clear();
		this._listenerCounter = 0;
		this._syncChannel = null;
		this._defaultView = null;
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
//#region src/worker-thread/storage.ts
/**
* Scoped Storage implementation that can optionally sync with
* the main thread's real localStorage/sessionStorage via the sync channel.
*
* Each worker app gets its own isolated storage with a unique prefix.
* When a sync channel is available, reads/writes are persisted to the
* real browser storage on the main thread.
*/
var ScopedStorage = class {
	cache = /* @__PURE__ */ new Map();
	prefix;
	storageType;
	getSyncChannel;
	queryType;
	constructor(prefix, storageType, getSyncChannel, queryType) {
		this.prefix = prefix;
		this.storageType = storageType;
		this.getSyncChannel = getSyncChannel;
		this.queryType = queryType;
	}
	syncCall(method, args) {
		const channel = this.getSyncChannel();
		if (!channel) return null;
		return channel.request(this.queryType, JSON.stringify({
			property: `${this.storageType}.${method}`,
			args
		}));
	}
	get length() {
		return this.cache.size;
	}
	key(index) {
		return [...this.cache.keys()][index] ?? null;
	}
	getItem(key) {
		const cached = this.cache.get(key);
		if (cached !== void 0) return cached;
		const result = this.syncCall("getItem", [this.prefix + key]);
		if (typeof result === "string") {
			this.cache.set(key, result);
			return result;
		}
		return null;
	}
	setItem(key, value) {
		const strValue = String(value);
		this.cache.set(key, strValue);
		this.syncCall("setItem", [this.prefix + key, strValue]);
	}
	removeItem(key) {
		this.cache.delete(key);
		this.syncCall("removeItem", [this.prefix + key]);
	}
	clear() {
		for (const key of this.cache.keys()) this.syncCall("removeItem", [this.prefix + key]);
		this.cache.clear();
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
	const appId = config?.appId ?? require_sync_channel.createAppId("worker");
	const transport = config?.transport ?? new require_worker_transport.WorkerSelfTransport();
	const platform = config?.platform ?? detectPlatform();
	const doc = new VirtualDocument(appId);
	doc.collector.setTransport(transport);
	transport.onMessage((message) => {
		if (require_sync_channel.isSystemMessage(message) && message.type === "debugQuery") {
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
		if (require_sync_channel.isSystemMessage(message) && message.type === "init" && "location" in message) {
			const initMsg = message;
			const initLoc = initMsg.location;
			if (initLoc) {
				location.href = initLoc.href;
				location.protocol = initLoc.protocol;
				location.hostname = initLoc.hostname;
				location.port = initLoc.port;
				location.host = initLoc.host;
				location.origin = initLoc.origin;
				location.pathname = initLoc.pathname;
				location.search = initLoc.search;
				location.hash = initLoc.hash;
			}
			if (initMsg.sharedBuffer) doc._syncChannel = require_sync_channel.SyncChannel.fromBuffer(initMsg.sharedBuffer);
			return;
		}
		if (require_sync_channel.isEventMessage(message)) {
			const eventMsg = message;
			const mutsBefore = doc.collector.totalAdded;
			const dispatchStart = performance.now();
			doc.dispatchEvent(eventMsg.listenerId, eventMsg.event);
			const dispatchMs = performance.now() - dispatchStart;
			const mutationCount = doc.collector.totalAdded - mutsBefore;
			const evt = eventMsg.event;
			const transportMs = evt.timeStamp != null ? dispatchStart - evt.timeStamp : void 0;
			transport.send({
				type: "eventTimingResult",
				listenerId: eventMsg.listenerId,
				eventType: evt.type ?? "",
				dispatchMs,
				mutationCount,
				transportMs: transportMs ?? 0
			});
		}
	});
	const cleanupErrorHandlers = platform.installErrorHandlers((message, error, filename, lineno, colno) => {
		const serializedError = {
			message,
			stack: error?.stack,
			name: error?.name,
			filename,
			lineno,
			colno
		};
		transport.send({
			type: "error",
			appId,
			error: serializedError
		});
	}, (reason) => {
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
	});
	transport.send({
		type: "ready",
		appId
	});
	const perfEntriesInterval = setInterval(() => {
		if (typeof performance === "undefined" || !performance.getEntriesByType) return;
		const measures = performance.getEntriesByType("measure").filter((e) => e.name.startsWith("async-dom:"));
		if (measures.length === 0) return;
		const entries = measures.map((e) => ({
			name: e.name,
			startTime: e.startTime,
			duration: e.duration,
			entryType: e.entryType
		}));
		transport.send({
			type: "perfEntries",
			appId,
			entries
		});
		for (const e of measures) try {
			performance.clearMeasures(e.name);
		} catch {}
	}, 2e3);
	const cleanupBeforeUnload = platform.onBeforeUnload(() => clearInterval(perfEntriesInterval));
	const storagePrefix = `__async_dom_${appId}_`;
	const localStorage = new ScopedStorage(storagePrefix, "localStorage", () => doc._syncChannel, require_sync_channel.QueryType.WindowProperty);
	const sessionStorage = new ScopedStorage(`${storagePrefix}session_`, "sessionStorage", () => null, require_sync_channel.QueryType.WindowProperty);
	function updateLocationFromURL(loc, url) {
		try {
			const parsed = new URL(url, loc.href);
			loc.href = parsed.href;
			loc.protocol = parsed.protocol;
			loc.hostname = parsed.hostname;
			loc.port = parsed.port;
			loc.host = parsed.host;
			loc.origin = parsed.origin;
			loc.pathname = parsed.pathname;
			loc.search = parsed.search;
			loc.hash = parsed.hash;
		} catch {}
	}
	const location = {
		hash: "",
		href: "http://localhost/",
		port: "",
		host: "localhost",
		origin: "http://localhost",
		hostname: "localhost",
		pathname: "/",
		protocol: "http:",
		search: "",
		toString() {
			return this.href;
		},
		assign(url) {
			updateLocationFromURL(location, url);
			doc.collector.add({
				action: "pushState",
				state: null,
				title: "",
				url
			});
		},
		replace(url) {
			updateLocationFromURL(location, url);
			doc.collector.add({
				action: "replaceState",
				state: null,
				title: "",
				url
			});
		},
		reload() {}
	};
	const history = {
		state: null,
		length: 1,
		pushState(state, title, url) {
			history.state = state;
			updateLocationFromURL(location, url);
			doc.collector.add({
				action: "pushState",
				state,
				title,
				url
			});
		},
		replaceState(state, title, url) {
			history.state = state;
			updateLocationFromURL(location, url);
			doc.collector.add({
				action: "replaceState",
				state,
				title,
				url
			});
		},
		back() {},
		forward() {},
		go(_delta) {}
	};
	const win = {
		document: doc,
		location,
		history,
		screen: {
			get width() {
				if (doc._syncChannel) {
					const result = doc._syncChannel.request(require_sync_channel.QueryType.WindowProperty, JSON.stringify({ property: "screen.width" }));
					if (typeof result === "number") return result;
				}
				return 1280;
			},
			get height() {
				if (doc._syncChannel) {
					const result = doc._syncChannel.request(require_sync_channel.QueryType.WindowProperty, JSON.stringify({ property: "screen.height" }));
					if (typeof result === "number") return result;
				}
				return 720;
			}
		},
		innerWidth: 1280,
		innerHeight: 720,
		localStorage,
		sessionStorage,
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
				const result = doc._syncChannel.request(require_sync_channel.QueryType.ComputedStyle, JSON.stringify({ nodeId: el._nodeId }));
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
		IntersectionObserver: VirtualIntersectionObserver,
		setTimeout,
		setInterval,
		clearTimeout,
		clearInterval,
		queueMicrotask,
		performance,
		fetch: typeof fetch !== "undefined" ? fetch : void 0,
		URL,
		URLSearchParams,
		console,
		btoa,
		atob,
		navigator: platform.navigator,
		Event: VirtualEvent,
		CustomEvent: VirtualCustomEvent,
		Node: {
			ELEMENT_NODE: 1,
			TEXT_NODE: 3,
			COMMENT_NODE: 8,
			DOCUMENT_NODE: 9,
			DOCUMENT_FRAGMENT_NODE: 11
		},
		HTMLElement: VirtualElement,
		devicePixelRatio: 1,
		matchMedia: (query) => ({
			matches: false,
			media: query,
			addEventListener() {},
			removeEventListener() {}
		}),
		getSelection: () => ({
			rangeCount: 0,
			getRangeAt() {
				return null;
			},
			addRange() {},
			removeAllRanges() {}
		}),
		dispatchEvent: (event) => {
			doc.dispatchEvent("", event);
			return true;
		},
		eval: (_code) => {
			throw new Error("sandbox eval is not enabled — set sandbox: true or sandbox: 'eval'");
		}
	};
	Object.defineProperties(win, {
		innerWidth: {
			get() {
				if (doc._syncChannel) {
					const result = doc._syncChannel.request(require_sync_channel.QueryType.WindowProperty, JSON.stringify({ property: "innerWidth" }));
					if (typeof result === "number") return result;
				}
				return 1280;
			},
			configurable: true
		},
		innerHeight: {
			get() {
				if (doc._syncChannel) {
					const result = doc._syncChannel.request(require_sync_channel.QueryType.WindowProperty, JSON.stringify({ property: "innerHeight" }));
					if (typeof result === "number") return result;
				}
				return 720;
			},
			configurable: true
		}
	});
	const sandboxMode = config?.sandbox;
	if (sandboxMode === "eval" || sandboxMode === true) win.eval = (code) => {
		const sandbox = new Proxy(win, {
			has() {
				return true;
			},
			get(target, prop) {
				if (prop === Symbol.unscopables) return void 0;
				if (prop in target) return target[prop];
				if (prop in globalThis) return globalThis[prop];
			},
			set(target, prop, value) {
				target[prop] = value;
				return true;
			}
		});
		return new Function("window", "self", "globalThis", "document", `with(window) {\n\t\t\t\treturn (function() { ${code} }).call(window);\n\t\t\t}`)(sandbox, sandbox, sandbox, doc);
	};
	if (sandboxMode === "global" || sandboxMode === true) {
		const workerGlobal = globalThis;
		workerGlobal.document = doc;
		workerGlobal.window = win;
		workerGlobal.location = win.location;
		workerGlobal.history = win.history;
		workerGlobal.navigator = win.navigator;
		workerGlobal.screen = win.screen;
		workerGlobal.localStorage = win.localStorage;
		workerGlobal.sessionStorage = win.sessionStorage;
		workerGlobal.getComputedStyle = win.getComputedStyle.bind(win);
		workerGlobal.requestAnimationFrame = win.requestAnimationFrame.bind(win);
		workerGlobal.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
		workerGlobal.scrollTo = win.scrollTo.bind(win);
		workerGlobal.matchMedia = win.matchMedia;
		workerGlobal.getSelection = win.getSelection;
		workerGlobal.dispatchEvent = win.dispatchEvent;
		workerGlobal.MutationObserver = win.MutationObserver;
		workerGlobal.ResizeObserver = win.ResizeObserver;
		workerGlobal.IntersectionObserver = win.IntersectionObserver;
		workerGlobal.Event = win.Event;
		workerGlobal.CustomEvent = win.CustomEvent;
		workerGlobal.Node = win.Node;
		workerGlobal.HTMLElement = win.HTMLElement;
		workerGlobal.devicePixelRatio = win.devicePixelRatio;
		const innerWidthDesc = Object.getOwnPropertyDescriptor(win, "innerWidth");
		const innerHeightDesc = Object.getOwnPropertyDescriptor(win, "innerHeight");
		if (innerWidthDesc) Object.defineProperty(workerGlobal, "innerWidth", innerWidthDesc);
		if (innerHeightDesc) Object.defineProperty(workerGlobal, "innerHeight", innerHeightDesc);
	}
	doc._defaultView = win;
	if (config?.debug?.exposeDevtools) globalThis.__ASYNC_DOM_DEVTOOLS__ = {
		document: doc,
		tree: () => doc.toJSON(),
		findNode: (id) => doc.getElementById(id) ?? doc.querySelector(`[id="${id}"]`),
		stats: () => doc.collector.getStats(),
		mutations: () => ({ pending: doc.collector.pendingCount }),
		flush: () => doc.collector.flushSync()
	};
	if (config?.debug?.logMutations) require_sync_channel.resolveDebugHooks(config.debug);
	function destroy() {
		doc.destroy();
		clearInterval(perfEntriesInterval);
		cleanupErrorHandlers();
		cleanupBeforeUnload();
		transport.close();
	}
	return {
		document: doc,
		window: win,
		destroy
	};
}
//#endregion
Object.defineProperty(exports, "MutationCollector", {
	enumerable: true,
	get: function() {
		return MutationCollector;
	}
});
Object.defineProperty(exports, "ScopedStorage", {
	enumerable: true,
	get: function() {
		return ScopedStorage;
	}
});
Object.defineProperty(exports, "VirtualCommentNode", {
	enumerable: true,
	get: function() {
		return VirtualCommentNode;
	}
});
Object.defineProperty(exports, "VirtualDocument", {
	enumerable: true,
	get: function() {
		return VirtualDocument;
	}
});
Object.defineProperty(exports, "VirtualElement", {
	enumerable: true,
	get: function() {
		return VirtualElement;
	}
});
Object.defineProperty(exports, "VirtualTextNode", {
	enumerable: true,
	get: function() {
		return VirtualTextNode;
	}
});
Object.defineProperty(exports, "createNodePlatform", {
	enumerable: true,
	get: function() {
		return createNodePlatform;
	}
});
Object.defineProperty(exports, "createWorkerDom", {
	enumerable: true,
	get: function() {
		return createWorkerDom;
	}
});
Object.defineProperty(exports, "createWorkerPlatform", {
	enumerable: true,
	get: function() {
		return createWorkerPlatform;
	}
});
Object.defineProperty(exports, "detectPlatform", {
	enumerable: true,
	get: function() {
		return detectPlatform;
	}
});

//# sourceMappingURL=worker-thread.cjs.map