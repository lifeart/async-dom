import type { DomMutation, InsertPosition, NodeId } from "../core/protocol.ts";
import { createNodeId } from "../core/protocol.ts";
import { QueryType } from "../core/sync-channel.ts";
import type { VirtualDocument } from "./document.ts";
import type { MutationCollector } from "./mutation-collector.ts";
import {
	matches as selectorMatches,
	querySelector as selectorQuery,
	querySelectorAll as selectorQueryAll,
} from "./selector-engine.ts";
import { createStyleProxy, toKebabCase } from "./style-proxy.ts";

export type VirtualNode = VirtualElement | VirtualTextNode | VirtualCommentNode;

function kebabToCamel(str: string): string {
	return str.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

let listenerCounter = 0;

const VOID_ELEMENTS = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr",
]);

/**
 * Virtual DOM element that records mutations via the MutationCollector
 * instead of touching real DOM.
 */
export class VirtualElement {
	static readonly ELEMENT_NODE = 1;
	static readonly TEXT_NODE = 3;
	static readonly COMMENT_NODE = 8;
	static readonly DOCUMENT_NODE = 9;
	static readonly DOCUMENT_FRAGMENT_NODE = 11;

	readonly _nodeId: NodeId;
	readonly nodeName: string;
	readonly tagName: string;
	readonly nodeType = 1;
	readonly namespaceURI: string;

	parentNode: VirtualElement | null = null;
	_ownerDocument: VirtualDocument | null = null;
	childNodes: VirtualNode[] = [];

	private _attributes = new Map<string, string>();
	private _classes: string[] = [];
	private _textContent = "";
	private _value = "";
	private _checked = false;
	private _disabled = false;
	private _selectedIndex = -1;
	private _datasetProxy: Record<string, string | undefined> | null = null;

	style: Record<string, string>;
	classList: VirtualClassList;

	// --- DOM-spec id getter/setter (maps to "id" attribute) ---

	get id(): string {
		return this.getAttribute("id") ?? "";
	}

	set id(value: string) {
		this.setAttribute("id", value);
	}

	// --- Element-only children getter ---

	get children(): VirtualElement[] {
		return this.childNodes.filter((c): c is VirtualElement => c.nodeType === 1);
	}

	get childElementCount(): number {
		return this.childNodes.filter((c) => c.nodeType === 1).length;
	}

	get firstElementChild(): VirtualElement | null {
		return this.childNodes.find((c): c is VirtualElement => c.nodeType === 1) ?? null;
	}

	get lastElementChild(): VirtualElement | null {
		for (let i = this.childNodes.length - 1; i >= 0; i--) {
			if (this.childNodes[i].nodeType === 1) return this.childNodes[i] as VirtualElement;
		}
		return null;
	}

	get clientWidth(): number {
		return this._readNodeProperty("clientWidth") ?? 0;
	}

	get clientHeight(): number {
		return this._readNodeProperty("clientHeight") ?? 0;
	}

	get scrollWidth(): number {
		return this._readNodeProperty("scrollWidth") ?? 0;
	}

	get scrollHeight(): number {
		return this._readNodeProperty("scrollHeight") ?? 0;
	}

	get offsetWidth(): number {
		return this._readNodeProperty("offsetWidth") ?? 0;
	}

	get offsetHeight(): number {
		return this._readNodeProperty("offsetHeight") ?? 0;
	}

	get offsetTop(): number {
		return this._readNodeProperty("offsetTop") ?? 0;
	}

	get offsetLeft(): number {
		return this._readNodeProperty("offsetLeft") ?? 0;
	}

	get scrollTop(): number {
		return this._readNodeProperty("scrollTop") ?? 0;
	}

	set scrollTop(v: number) {
		const mutation: DomMutation = {
			action: "setProperty",
			id: this._nodeId,
			property: "scrollTop",
			value: v,
		};
		this.collector.add(mutation);
	}

	get scrollLeft(): number {
		return this._readNodeProperty("scrollLeft") ?? 0;
	}

	set scrollLeft(v: number) {
		const mutation: DomMutation = {
			action: "setProperty",
			id: this._nodeId,
			property: "scrollLeft",
			value: v,
		};
		this.collector.add(mutation);
	}

	private _readNodeProperty(prop: string): number | null {
		const channel = this._ownerDocument?._syncChannel;
		if (channel) {
			const result = channel.request(
				QueryType.NodeProperty,
				JSON.stringify({ nodeId: this._nodeId, property: prop }),
			);
			if (typeof result === "number") return result;
		}
		return null;
	}

	constructor(
		tag: string,
		private collector: MutationCollector,
		id?: NodeId,
	) {
		this.nodeName = tag.toUpperCase();
		this.tagName = this.nodeName;
		this._nodeId = id ?? createNodeId();
		this.namespaceURI = "http://www.w3.org/1999/xhtml";
		this.style = createStyleProxy(this, collector);
		this.classList = new VirtualClassList(this);
	}

	_setNamespaceURI(ns: string): void {
		(this as { namespaceURI: string }).namespaceURI = ns;
	}

	// --- Attributes ---

	setAttribute(name: string, value: string): void {
		if (name === "id") {
			const oldId = this._attributes.get("id");
			this._attributes.set(name, value);
			if (this._ownerDocument) {
				if (oldId) {
					this._ownerDocument.unregisterElementById(oldId);
				}
				this._ownerDocument.registerElementById(value, this);
			}
			const mutation: DomMutation = {
				action: "setAttribute",
				id: this._nodeId,
				name: "id",
				value,
			};
			this.collector.add(mutation);
			return;
		}
		if (name === "class") {
			this._classes = value ? value.split(/\s+/).filter(Boolean) : [];
			this._attributes.set("class", value);
			const mutation: DomMutation = {
				action: "setClassName",
				id: this._nodeId,
				name: value,
			};
			this.collector.add(mutation);
			return;
		}
		if (name === "style") {
			this._parseAndSetStyles(value);
			const mutation: DomMutation = {
				action: "setAttribute",
				id: this._nodeId,
				name: "style",
				value,
				optional: true,
			};
			this.collector.add(mutation);
			return;
		}
		this._attributes.set(name, value);
		const mutation: DomMutation = {
			action: "setAttribute",
			id: this._nodeId,
			name,
			value,
		};
		this.collector.add(mutation);
	}

	getAttribute(name: string): string | null {
		return this._attributes.get(name) ?? null;
	}

	hasAttribute(name: string): boolean {
		return this._attributes.has(name);
	}

	removeAttribute(name: string): void {
		if (name === "class") {
			this._classes = [];
		}
		this._attributes.delete(name);
		const mutation: DomMutation = {
			action: "removeAttribute",
			id: this._nodeId,
			name,
		};
		this.collector.add(mutation);
	}

	getAttributeNS(_ns: string | null, name: string): string | null {
		return this.getAttribute(name);
	}

	setAttributeNS(_ns: string | null, name: string, value: string): void {
		this.setAttribute(name, value);
	}

	removeAttributeNS(_ns: string | null, name: string): void {
		this.removeAttribute(name);
	}

	get attributes(): {
		length: number;
		item(index: number): { name: string; value: string } | null;
	} {
		const entries = [...this._attributes.entries()];
		return {
			length: entries.length,
			item(index: number) {
				const entry = entries[index];
				return entry ? { name: entry[0], value: entry[1] } : null;
			},
		};
	}

	// --- Children ---

	appendChild(child: VirtualNode): VirtualNode {
		if (child instanceof VirtualElement && child.nodeName === "#DOCUMENT-FRAGMENT") {
			// Flatten document fragment
			const fragmentChildren = [...child.childNodes];
			for (const fc of fragmentChildren) {
				this._appendSingleChild(fc);
			}
			child.childNodes.length = 0;
			return child;
		}
		this._appendSingleChild(child);
		return child;
	}

	private _appendSingleChild(child: VirtualNode): void {
		if (child.parentNode) {
			child.parentNode.childNodes = child.parentNode.childNodes.filter((c) => c !== child);
		}
		child.parentNode = this;
		this.childNodes.push(child);
		const mutation: DomMutation = {
			action: "appendChild",
			id: this._nodeId,
			childId: child._nodeId,
		};
		this.collector.add(mutation);
	}

	removeChild(child: VirtualNode): VirtualNode {
		if (child instanceof VirtualElement) {
			child._cleanupFromDocument();
		}
		this.childNodes = this.childNodes.filter((c) => c !== child);
		child.parentNode = null;
		const mutation: DomMutation = {
			action: "removeChild",
			id: this._nodeId,
			childId: child._nodeId,
		};
		this.collector.add(mutation);
		return child;
	}

	insertBefore(newChild: VirtualNode, refChild: VirtualNode | null): VirtualNode {
		// Flatten document fragments
		if (newChild instanceof VirtualElement && newChild.nodeName === "#DOCUMENT-FRAGMENT") {
			const fragmentChildren = [...newChild.childNodes];
			for (const fc of fragmentChildren) {
				this.insertBefore(fc, refChild);
			}
			newChild.childNodes.length = 0;
			return newChild;
		}

		if (newChild.parentNode) {
			newChild.parentNode.childNodes = newChild.parentNode.childNodes.filter((c) => c !== newChild);
		}
		newChild.parentNode = this;

		if (refChild === null) {
			this.childNodes.push(newChild);
		} else {
			const index = this.childNodes.indexOf(refChild);
			if (index === -1) {
				this.childNodes.push(newChild);
			} else {
				this.childNodes.splice(index, 0, newChild);
			}
		}

		const mutation: DomMutation = {
			action: "insertBefore",
			id: this._nodeId,
			newId: newChild._nodeId,
			refId: refChild?._nodeId ?? null,
		};
		this.collector.add(mutation);
		return newChild;
	}

	remove(): void {
		this._cleanupFromDocument();
		if (this.parentNode) {
			this.parentNode.childNodes = this.parentNode.childNodes.filter((c) => c !== this);
		}
		this.parentNode = null;
		const mutation: DomMutation = {
			action: "removeNode",
			id: this._nodeId,
		};
		this.collector.add(mutation);
	}

	append(...nodes: VirtualNode[]): void {
		for (const node of nodes) {
			this.appendChild(node);
		}
	}

	prepend(...nodes: VirtualNode[]): void {
		const first = this.firstChild;
		for (const node of nodes) {
			this.insertBefore(node, first);
		}
	}

	replaceWith(...nodes: VirtualNode[]): void {
		const parent = this.parentNode;
		if (!parent) return;
		const nextSib = this.nextSibling;
		this.remove();
		for (const node of nodes) {
			parent.insertBefore(node, nextSib);
		}
	}

	before(...nodes: VirtualNode[]): void {
		const parent = this.parentNode;
		if (!parent) return;
		for (const node of nodes) {
			parent.insertBefore(node, this);
		}
	}

	after(...nodes: VirtualNode[]): void {
		const parent = this.parentNode;
		if (!parent) return;
		const nextSib = this.nextSibling;
		for (const node of nodes) {
			parent.insertBefore(node, nextSib);
		}
	}

	replaceChildren(...nodes: VirtualNode[]): void {
		while (this.childNodes.length > 0) {
			this.removeChild(this.childNodes[0]);
		}
		for (const node of nodes) {
			this.appendChild(node);
		}
	}

	// --- Text & HTML ---

	get textContent(): string {
		if (this.childNodes.length === 0) return this._textContent;
		let result = "";
		for (const child of this.childNodes) {
			if (child.nodeType === 3) result += (child as VirtualTextNode).nodeValue;
			else if (child.nodeType === 1) result += (child as VirtualElement).textContent;
		}
		return result;
	}

	set textContent(value: string) {
		// Per DOM spec, setting textContent removes all children first
		for (const child of this.childNodes) {
			if (child instanceof VirtualElement) {
				child._cleanupFromDocument();
			} else if (this._ownerDocument) {
				this._ownerDocument.unregisterElement(child._nodeId);
			}
			child.parentNode = null;
		}
		this.childNodes.length = 0;
		this._textContent = value;
		const mutation: DomMutation = {
			action: "setTextContent",
			id: this._nodeId,
			textContent: value,
		};
		this.collector.add(mutation);
	}

	get innerHTML(): string {
		if (this.childNodes.length === 0) {
			return this._textContent ? escapeHtml(this._textContent) : "";
		}
		return this.childNodes
			.map((child) => {
				if (child.nodeType === 3) return escapeHtml((child as VirtualTextNode).nodeValue);
				if (child.nodeType === 8)
					return `<!--${(child as VirtualCommentNode).nodeValue.replace(/--/g, "")}-->`;
				if (child instanceof VirtualElement) return child.outerHTML;
				return "";
			})
			.join("");
	}

	set innerHTML(value: string) {
		this._textContent = "";
		// Clear children — cleanup document registrations first
		for (const child of this.childNodes) {
			if (child instanceof VirtualElement) {
				child._cleanupFromDocument();
			} else if (this._ownerDocument) {
				this._ownerDocument.unregisterElement(child._nodeId);
			}
			child.parentNode = null;
		}
		this.childNodes.length = 0;
		const mutation: DomMutation = {
			action: "setHTML",
			id: this._nodeId,
			html: value,
		};
		this.collector.add(mutation);
	}

	get outerHTML(): string {
		const tag = this.tagName.toLowerCase();
		let attrs = "";
		for (const [key, value] of this._attributes) {
			attrs += ` ${key}="${escapeAttr(value)}"`;
		}
		// Serialize class attribute from _classes if not already in _attributes
		if (this._classes.length > 0 && !this._attributes.has("class")) {
			attrs += ` class="${escapeAttr(this._classes.join(" "))}"`;
		}
		// Serialize style attribute from the style proxy's cssText
		const cssText = (this.style as Record<string, unknown>).cssText as string;
		if (cssText) {
			attrs += ` style="${escapeAttr(cssText)}"`;
		}
		const inner = this.innerHTML;
		if (VOID_ELEMENTS.has(tag)) return `<${tag}${attrs}>`;
		return `<${tag}${attrs}>${inner}</${tag}>`;
	}

	// --- Input Properties ---

	get value(): string {
		return this._value;
	}

	set value(v: string) {
		this._value = v;
		const mutation: DomMutation = {
			action: "setProperty",
			id: this._nodeId,
			property: "value",
			value: v,
		};
		this.collector.add(mutation);
	}

	get checked(): boolean {
		return this._checked;
	}

	set checked(v: boolean) {
		this._checked = v;
		const mutation: DomMutation = {
			action: "setProperty",
			id: this._nodeId,
			property: "checked",
			value: v,
		};
		this.collector.add(mutation);
	}

	get disabled(): boolean {
		return this._disabled;
	}

	set disabled(v: boolean) {
		this._disabled = v;
		const mutation: DomMutation = {
			action: "setProperty",
			id: this._nodeId,
			property: "disabled",
			value: v,
		};
		this.collector.add(mutation);
	}

	get selectedIndex(): number {
		return this._selectedIndex;
	}

	set selectedIndex(v: number) {
		this._selectedIndex = v;
		const mutation: DomMutation = {
			action: "setProperty",
			id: this._nodeId,
			property: "selectedIndex",
			value: v,
		};
		this.collector.add(mutation);
	}

	_updateInputState(state: { value?: string; checked?: boolean; selectedIndex?: number }): void {
		if (state.value !== undefined) this._value = state.value;
		if (state.checked !== undefined) this._checked = state.checked;
		if (state.selectedIndex !== undefined) this._selectedIndex = state.selectedIndex;
	}

	// --- Media Properties ---

	private _currentTime = 0;
	private _duration = 0;
	private _paused = true;
	private _ended = false;
	private _readyState = 0;

	get currentTime(): number {
		return this._currentTime;
	}

	set currentTime(v: number) {
		this._currentTime = v;
		this.collector.add({
			action: "setProperty",
			id: this._nodeId,
			property: "currentTime",
			value: v,
		});
	}

	get duration(): number {
		return this._duration;
	}

	get paused(): boolean {
		return this._paused;
	}

	get ended(): boolean {
		return this._ended;
	}

	get readyState(): number {
		return this._readyState;
	}

	_updateMediaState(state: Record<string, unknown>): void {
		if (state.currentTime !== undefined) this._currentTime = state.currentTime as number;
		if (state.duration !== undefined) this._duration = state.duration as number;
		if (state.paused !== undefined) this._paused = state.paused as boolean;
		if (state.ended !== undefined) this._ended = state.ended as boolean;
		if (state.readyState !== undefined) this._readyState = state.readyState as number;
	}

	// --- Class ---

	get className(): string {
		return this._classes.join(" ");
	}

	set className(value: string) {
		this._classes = value ? value.split(/\s+/).filter(Boolean) : [];
		// Keep _attributes["class"] in sync so getAttribute("class") and outerHTML
		// always reflect the current class list via a single source of truth.
		if (this._classes.length > 0) {
			this._attributes.set("class", this._classes.join(" "));
		} else {
			this._attributes.delete("class");
		}
		const mutation: DomMutation = {
			action: "setClassName",
			id: this._nodeId,
			name: value,
		};
		this.collector.add(mutation);
	}

	// --- Events ---

	private _eventListeners = new Map<string, (e: unknown) => void>();
	private _listenerEventNames = new Map<string, string>();
	private _onHandlers = new Map<string, (e: unknown) => void>();

	addEventListener(
		name: string,
		callback: (e: unknown) => void,
		options?: AddEventListenerOptions | boolean,
	): void {
		if (!name) return;
		const listenerId = `${this._nodeId}_${name}_${++listenerCounter}`;

		// Parse options
		const once = typeof options === "object" ? (options?.once ?? false) : false;

		// Wrap callback for 'once' support
		let effectiveCallback = callback;
		if (once) {
			const originalCb = callback;
			effectiveCallback = (e: unknown) => {
				originalCb(e);
				this.removeEventListener(name, effectiveCallback);
			};
		}

		// Store the callback for the document to route events back
		this._eventListeners.set(listenerId, effectiveCallback);
		this._listenerEventNames.set(listenerId, name);
		this._ownerDocument?.registerListener(listenerId, this);
		const mutation: DomMutation = {
			action: "addEventListener",
			id: this._nodeId,
			name,
			listenerId,
		};
		this.collector.add(mutation);
	}

	getEventListener(listenerId: string): ((e: unknown) => void) | undefined {
		return this._eventListeners.get(listenerId);
	}

	removeEventListener(_name: string, callback: (e: unknown) => void): void {
		for (const [listenerId, cb] of this._eventListeners.entries()) {
			if (cb === callback && this._listenerEventNames.get(listenerId) === _name) {
				this._eventListeners.delete(listenerId);
				this._listenerEventNames.delete(listenerId);
				this._ownerDocument?.unregisterListener(listenerId);
				const mutation: DomMutation = {
					action: "removeEventListener",
					id: this._nodeId,
					listenerId,
				};
				this.collector.add(mutation);
				break;
			}
		}
	}

	_dispatchBubbledEvent(event: { type: string; immediatePropagationStopped?: boolean }): void {
		for (const [listenerId, cb] of this._eventListeners.entries()) {
			if (this._listenerEventNames.get(listenerId) === event.type) {
				cb(event);
				if (event.immediatePropagationStopped) break;
			}
		}
	}

	/**
	 * Recursively clean up this element and all children from the document's registries.
	 * Called before emitting removal mutations to prevent memory leaks.
	 */
	_cleanupFromDocument(): void {
		// Unregister all listeners from document's O(1) lookup map
		for (const listenerId of this._eventListeners.keys()) {
			this._ownerDocument?.unregisterListener(listenerId);
		}
		this._eventListeners.clear();
		this._listenerEventNames.clear();
		this._onHandlers.clear();
		if (this._ownerDocument) {
			// Unregister id attribute from the _ids map so getElementById no longer finds this element
			const elId = this._attributes.get("id");
			if (elId) {
				this._ownerDocument.unregisterElementById(elId);
			}
			this._ownerDocument.unregisterElement(this._nodeId);
		}
		for (const child of this.childNodes) {
			if (child instanceof VirtualElement) {
				child._cleanupFromDocument();
			} else if (this._ownerDocument) {
				// Clean up text/comment node IDs from _ids map
				this._ownerDocument.unregisterElement(child._nodeId);
			}
		}
	}

	preventDefaultFor(eventName: string): void {
		const mutation: DomMutation = {
			action: "configureEvent",
			id: this._nodeId,
			name: eventName,
			preventDefault: true,
		};
		this.collector.add(mutation);
	}

	private _setOnHandler(eventName: string, cb: ((e: unknown) => void) | null): void {
		const prev = this._onHandlers.get(eventName);
		if (prev) this.removeEventListener(eventName, prev);
		if (cb) {
			this.addEventListener(eventName, cb);
			this._onHandlers.set(eventName, cb);
		} else {
			this._onHandlers.delete(eventName);
		}
	}

	set onclick(cb: ((e: unknown) => void) | null) {
		this._setOnHandler("click", cb);
	}

	set ondblclick(cb: ((e: unknown) => void) | null) {
		this._setOnHandler("dblclick", cb);
	}

	set onmouseenter(cb: ((e: unknown) => void) | null) {
		this._setOnHandler("mouseenter", cb);
	}

	set onmouseleave(cb: ((e: unknown) => void) | null) {
		this._setOnHandler("mouseleave", cb);
	}

	set onmousedown(cb: ((e: unknown) => void) | null) {
		this._setOnHandler("mousedown", cb);
	}

	set onmouseup(cb: ((e: unknown) => void) | null) {
		this._setOnHandler("mouseup", cb);
	}

	set onmouseover(cb: ((e: unknown) => void) | null) {
		this._setOnHandler("mouseover", cb);
	}

	set onmousemove(cb: ((e: unknown) => void) | null) {
		this._setOnHandler("mousemove", cb);
	}

	set onkeydown(cb: ((e: unknown) => void) | null) {
		this._setOnHandler("keydown", cb);
	}

	set onkeyup(cb: ((e: unknown) => void) | null) {
		this._setOnHandler("keyup", cb);
	}

	set onkeypress(cb: ((e: unknown) => void) | null) {
		this._setOnHandler("keypress", cb);
	}

	set onchange(cb: ((e: unknown) => void) | null) {
		this._setOnHandler("change", cb);
	}

	set oncontextmenu(cb: ((e: unknown) => void) | null) {
		this._setOnHandler("contextmenu", cb);
	}

	set oninput(cb: ((e: unknown) => void) | null) {
		this._setOnHandler("input", cb);
	}

	set onfocus(cb: ((e: unknown) => void) | null) {
		this._setOnHandler("focus", cb);
	}

	set onblur(cb: ((e: unknown) => void) | null) {
		this._setOnHandler("blur", cb);
	}

	set onsubmit(cb: ((e: unknown) => void) | null) {
		this._setOnHandler("submit", cb);
	}

	// --- Navigation ---

	get firstChild(): VirtualNode | null {
		return this.childNodes[0] ?? null;
	}

	get lastChild(): VirtualNode | null {
		return this.childNodes[this.childNodes.length - 1] ?? null;
	}

	get nextSibling(): VirtualNode | null {
		if (!this.parentNode) return null;
		const idx = this.parentNode.childNodes.indexOf(this);
		return this.parentNode.childNodes[idx + 1] ?? null;
	}

	get previousSibling(): VirtualNode | null {
		if (!this.parentNode) return null;
		const idx = this.parentNode.childNodes.indexOf(this);
		return this.parentNode.childNodes[idx - 1] ?? null;
	}

	get parentElement(): VirtualElement | null {
		return this.parentNode;
	}

	get ownerDocument(): VirtualDocument | null {
		return this._ownerDocument;
	}

	get isConnected(): boolean {
		let current: VirtualElement | null = this;
		while (current) {
			if (current._ownerDocument && current === current._ownerDocument.documentElement) return true;
			current = current.parentNode;
		}
		return false;
	}

	getRootNode(): VirtualNode {
		let current: VirtualNode = this;
		while (current.parentNode) current = current.parentNode;
		return current;
	}

	get nextElementSibling(): VirtualElement | null {
		if (!this.parentNode) return null;
		const siblings = this.parentNode.childNodes;
		const idx = siblings.indexOf(this);
		for (let i = idx + 1; i < siblings.length; i++) {
			if (siblings[i].nodeType === 1) return siblings[i] as VirtualElement;
		}
		return null;
	}

	get previousElementSibling(): VirtualElement | null {
		if (!this.parentNode) return null;
		const siblings = this.parentNode.childNodes;
		const idx = siblings.indexOf(this);
		for (let i = idx - 1; i >= 0; i--) {
			if (siblings[i].nodeType === 1) return siblings[i] as VirtualElement;
		}
		return null;
	}

	hasChildNodes(): boolean {
		return this.childNodes.length > 0;
	}

	replaceChild(newChild: VirtualNode, oldChild: VirtualNode): VirtualNode {
		const idx = this.childNodes.indexOf(oldChild);
		if (idx === -1) return oldChild;
		this.insertBefore(newChild, oldChild);
		this.removeChild(oldChild);
		return oldChild;
	}

	normalize(): void {
		// Stub — text node merging not needed for framework compatibility
	}

	dispatchEvent(event: unknown): boolean {
		const evt = event as { type: string; immediatePropagationStopped?: boolean };
		if (evt.type) {
			this._dispatchBubbledEvent(evt);
		}
		return true;
	}

	// --- Clone ---

	cloneNode(deep?: boolean): VirtualElement {
		const clone = new VirtualElement(this.nodeName, this.collector);
		// Emit createNode mutation for the clone
		const createMutation: DomMutation = {
			action: "createNode",
			id: clone._nodeId,
			tag: this.tagName,
			textContent: this._textContent || "",
		};
		this.collector.add(createMutation);
		for (const [k, v] of this._attributes) {
			clone.setAttribute(k, v);
		}
		clone._classes = [...this._classes];
		clone._ownerDocument = this._ownerDocument;
		if (deep) {
			for (const child of this.childNodes) {
				clone.appendChild(child.cloneNode(true));
			}
		}
		return clone;
	}

	// --- Dataset ---

	get dataset(): Record<string, string | undefined> {
		if (this._datasetProxy) return this._datasetProxy;
		const el = this;
		this._datasetProxy = new Proxy({} as Record<string, string | undefined>, {
			get(_target, prop: string): string | undefined {
				if (typeof prop !== "string") return undefined;
				const attrName = `data-${toKebabCase(prop)}`;
				return el.getAttribute(attrName) ?? undefined;
			},
			set(_target, prop: string, value: string): boolean {
				if (typeof prop !== "string") return true;
				const attrName = `data-${toKebabCase(prop)}`;
				el.setAttribute(attrName, String(value));
				return true;
			},
			deleteProperty(_target, prop: string): boolean {
				if (typeof prop !== "string") return true;
				const attrName = `data-${toKebabCase(prop)}`;
				el.removeAttribute(attrName);
				return true;
			},
			has(_target, prop: string): boolean {
				if (typeof prop !== "string") return false;
				const attrName = `data-${toKebabCase(prop)}`;
				return el.hasAttribute(attrName);
			},
			ownKeys(): string[] {
				const keys: string[] = [];
				const attrs = el.attributes;
				for (let i = 0; i < attrs.length; i++) {
					const attr = attrs.item(i);
					if (attr?.name.startsWith("data-")) {
						keys.push(kebabToCamel(attr.name.slice(5)));
					}
				}
				return keys;
			},
			getOwnPropertyDescriptor(_target, prop: string) {
				if (typeof prop !== "string") return undefined;
				const attrName = `data-${toKebabCase(prop)}`;
				if (!el.hasAttribute(attrName)) return undefined;
				return {
					configurable: true,
					enumerable: true,
					writable: true,
					value: el.getAttribute(attrName),
				};
			},
		});
		return this._datasetProxy;
	}

	insertAdjacentHTML(position: InsertPosition, html: string): void {
		const mutation: DomMutation = {
			action: "insertAdjacentHTML",
			id: this._nodeId,
			position,
			html,
		};
		this.collector.add(mutation);
	}

	// --- Misc ---

	contains(other: VirtualNode | null): boolean {
		if (!other) return false;
		if (other === (this as VirtualNode)) return true;
		return this.childNodes.some(
			(child) => child === other || (child instanceof VirtualElement && child.contains(other)),
		);
	}

	querySelector(selector: string): VirtualElement | null {
		return selectorQuery(this, selector);
	}

	querySelectorAll(selector: string): VirtualElement[] {
		return selectorQueryAll(this, selector);
	}

	matches(selector: string): boolean {
		return selectorMatches(this, selector);
	}

	getElementsByTagName(tagName: string): VirtualElement[] {
		const upper = tagName.toUpperCase();
		return selectorQueryAll(this, upper === "*" ? "*" : tagName);
	}

	getElementsByClassName(className: string): VirtualElement[] {
		const selector = className
			.split(/\s+/)
			.filter(Boolean)
			.map((c) => `.${c}`)
			.join("");
		return selectorQueryAll(this, selector);
	}

	closest(selector: string): VirtualElement | null {
		let current: VirtualElement | null = this;
		while (current) {
			if (selectorMatches(current, selector)) return current;
			current = current.parentNode;
		}
		return null;
	}

	focus(): void {
		this.collector.add({ action: "callMethod", id: this._nodeId, method: "focus", args: [] });
	}

	blur(): void {
		this.collector.add({ action: "callMethod", id: this._nodeId, method: "blur", args: [] });
	}

	play(): void {
		this.collector.add({ action: "callMethod", id: this._nodeId, method: "play", args: [] });
	}

	pause(): void {
		this.collector.add({ action: "callMethod", id: this._nodeId, method: "pause", args: [] });
	}

	load(): void {
		this.collector.add({ action: "callMethod", id: this._nodeId, method: "load", args: [] });
	}

	click(): void {
		this.collector.add({ action: "callMethod", id: this._nodeId, method: "click", args: [] });
	}

	scrollIntoView(options?: unknown): void {
		this.collector.add({
			action: "callMethod",
			id: this._nodeId,
			method: "scrollIntoView",
			args: options ? [options] : [],
		});
	}

	select(): void {
		this.collector.add({ action: "callMethod", id: this._nodeId, method: "select", args: [] });
	}

	showModal(): void {
		this.collector.add({
			action: "callMethod",
			id: this._nodeId,
			method: "showModal",
			args: [],
		});
	}

	close(): void {
		this.collector.add({ action: "callMethod", id: this._nodeId, method: "close", args: [] });
	}

	getBoundingClientRect(): {
		top: number;
		left: number;
		right: number;
		bottom: number;
		width: number;
		height: number;
		x: number;
		y: number;
	} {
		const channel = this._ownerDocument?._syncChannel;
		if (channel) {
			const result = channel.request(
				QueryType.BoundingRect,
				JSON.stringify({ nodeId: this._nodeId }),
			);
			if (result && typeof result === "object") {
				const r = result as Record<string, number>;
				return {
					top: r.top ?? 0,
					left: r.left ?? 0,
					right: r.right ?? 0,
					bottom: r.bottom ?? 0,
					width: r.width ?? 0,
					height: r.height ?? 0,
					x: r.x ?? r.left ?? 0,
					y: r.y ?? r.top ?? 0,
				};
			}
		}
		return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
	}

	private _parseAndSetStyles(value: string): void {
		for (const part of value.split(";")) {
			const colonIdx = part.indexOf(":");
			if (colonIdx === -1) continue;
			const key = part.slice(0, colonIdx).trim();
			const val = part.slice(colonIdx + 1).trim();
			if (key) {
				this.style[key] = val;
			}
		}
	}
}

/**
 * Virtual text node.
 */
export class VirtualTextNode {
	static readonly ELEMENT_NODE = 1;
	static readonly TEXT_NODE = 3;
	static readonly COMMENT_NODE = 8;
	static readonly DOCUMENT_NODE = 9;
	static readonly DOCUMENT_FRAGMENT_NODE = 11;

	readonly nodeType = 3;
	readonly nodeName = "#text";
	parentNode: VirtualElement | null = null;
	_ownerDocument: VirtualDocument | null = null;
	private _nodeValue: string;

	constructor(
		text: string,
		readonly _nodeId: NodeId,
		private collector: MutationCollector,
	) {
		this._nodeValue = text;
	}

	get parentElement(): VirtualElement | null {
		return this.parentNode;
	}

	get nodeValue(): string {
		return this._nodeValue;
	}

	set nodeValue(value: string) {
		this._nodeValue = value;
		const mutation: DomMutation = {
			action: "setProperty",
			id: this._nodeId,
			property: "nodeValue",
			value,
		};
		this.collector.add(mutation);
	}

	get textContent(): string {
		return this._nodeValue;
	}

	set textContent(value: string) {
		this.nodeValue = value;
	}

	get nextSibling(): VirtualNode | null {
		if (!this.parentNode) return null;
		const siblings = this.parentNode.childNodes;
		const idx = siblings.indexOf(this);
		return siblings[idx + 1] ?? null;
	}

	get previousSibling(): VirtualNode | null {
		if (!this.parentNode) return null;
		const siblings = this.parentNode.childNodes;
		const idx = siblings.indexOf(this);
		return siblings[idx - 1] ?? null;
	}

	get childNodes(): VirtualNode[] {
		return [];
	}

	remove(): void {
		if (this.parentNode) {
			this.parentNode.childNodes = this.parentNode.childNodes.filter((c) => c !== this);
		}
		this.parentNode = null;
		const mutation: DomMutation = {
			action: "removeNode",
			id: this._nodeId,
		};
		this.collector.add(mutation);
	}

	cloneNode(_deep?: boolean): VirtualTextNode {
		const id = createNodeId();
		const clone = new VirtualTextNode(this._nodeValue, id, this.collector);
		clone._ownerDocument = this._ownerDocument;
		const mutation: DomMutation = {
			action: "createNode",
			id,
			tag: "#text",
			textContent: this._nodeValue,
		};
		this.collector.add(mutation);
		return clone;
	}
}

/**
 * Virtual comment node.
 */
export class VirtualCommentNode {
	static readonly ELEMENT_NODE = 1;
	static readonly TEXT_NODE = 3;
	static readonly COMMENT_NODE = 8;
	static readonly DOCUMENT_NODE = 9;
	static readonly DOCUMENT_FRAGMENT_NODE = 11;

	readonly nodeType = 8;
	readonly nodeName = "#comment";
	parentNode: VirtualElement | null = null;
	_ownerDocument: VirtualDocument | null = null;
	private _nodeValue: string;

	constructor(
		text: string,
		readonly _nodeId: NodeId,
		private collector: MutationCollector,
	) {
		this._nodeValue = text;
	}

	get parentElement(): VirtualElement | null {
		return this.parentNode;
	}

	get nodeValue(): string {
		return this._nodeValue;
	}

	set nodeValue(value: string) {
		this._nodeValue = value;
	}

	get textContent(): string {
		return this._nodeValue;
	}

	get nextSibling(): VirtualNode | null {
		if (!this.parentNode) return null;
		const siblings = this.parentNode.childNodes;
		const idx = siblings.indexOf(this);
		return siblings[idx + 1] ?? null;
	}

	get previousSibling(): VirtualNode | null {
		if (!this.parentNode) return null;
		const siblings = this.parentNode.childNodes;
		const idx = siblings.indexOf(this);
		return siblings[idx - 1] ?? null;
	}

	get childNodes(): VirtualNode[] {
		return [];
	}

	remove(): void {
		if (this.parentNode) {
			this.parentNode.childNodes = this.parentNode.childNodes.filter((c) => c !== this);
		}
		this.parentNode = null;
		const mutation: DomMutation = {
			action: "removeNode",
			id: this._nodeId,
		};
		this.collector.add(mutation);
	}

	cloneNode(_deep?: boolean): VirtualCommentNode {
		const id = createNodeId();
		const clone = new VirtualCommentNode(this._nodeValue, id, this.collector);
		clone._ownerDocument = this._ownerDocument;
		const mutation: DomMutation = {
			action: "createComment",
			id,
			textContent: this._nodeValue,
		};
		this.collector.add(mutation);
		return clone;
	}
}

class VirtualClassList {
	constructor(private element: VirtualElement) {}

	add(...names: string[]): void {
		const classes = this.element.className.split(" ").filter(Boolean);
		for (const name of names) {
			if (!classes.includes(name)) classes.push(name);
		}
		this.element.className = classes.join(" ");
	}

	remove(...names: string[]): void {
		const nameSet = new Set(names);
		const classes = this.element.className.split(" ").filter((c) => c !== "" && !nameSet.has(c));
		this.element.className = classes.join(" ");
	}

	contains(name: string): boolean {
		return this.element.className.split(" ").includes(name);
	}

	toggle(name: string, force?: boolean): boolean {
		const has = this.contains(name);
		if (force !== undefined) {
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

	get length(): number {
		return this.element.className.split(" ").filter(Boolean).length;
	}
}
