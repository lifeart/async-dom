import type { DomMutation, InsertPosition, NodeId } from "../core/protocol.ts";
import { createNodeId } from "../core/protocol.ts";
import { QueryType } from "../core/sync-channel.ts";
import type { MutationCollector } from "./mutation-collector.ts";
import type { VirtualDocument } from "./document.ts";
import { createStyleProxy, toKebabCase } from "./style-proxy.ts";
import { querySelectorAll as selectorQueryAll, querySelector as selectorQuery, matches as selectorMatches } from "./selector-engine.ts";

export type VirtualNode = VirtualElement | VirtualTextNode | VirtualCommentNode;

function kebabToCamel(str: string): string {
	return str.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

let globalNodeCounter = 0;
let listenerCounter = 0;

function generateNodeId(prefix: string): NodeId {
	globalNodeCounter++;
	return createNodeId(`${prefix}-${globalNodeCounter}`);
}

/**
 * Virtual DOM element that records mutations via the MutationCollector
 * instead of touching real DOM.
 */
export class VirtualElement {
	readonly id: NodeId;
	readonly nodeName: string;
	readonly tagName: string;
	readonly nodeType = 1;

	parentNode: VirtualElement | null = null;
	_ownerDocument: VirtualDocument | null = null;
	children: VirtualNode[] = [];

	private _attributes = new Map<string, string>();
	private _classes: string[] = [];
	private _innerHTML = "";
	private _textContent = "";
	private _value = "";
	private _checked = false;
	private _disabled = false;
	private _selectedIndex = -1;
	private _datasetProxy: Record<string, string | undefined> | null = null;

	style: Record<string, string>;
	classList: VirtualClassList;

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
			id: this.id,
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
			id: this.id,
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
				JSON.stringify({ nodeId: this.id, property: prop }),
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
		this.id = id ?? generateNodeId("a");
		this.style = createStyleProxy(this, collector);
		this.classList = new VirtualClassList(this);
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
				id: this.id,
				name: "id",
				value,
			};
			this.collector.add(mutation);
			return;
		}
		if (name === "style") {
			this._parseAndSetStyles(value);
			const mutation: DomMutation = {
				action: "setAttribute",
				id: this.id,
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
			id: this.id,
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
		this._attributes.delete(name);
		const mutation: DomMutation = {
			action: "removeAttribute",
			id: this.id,
			name,
		};
		this.collector.add(mutation);
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
			const fragmentChildren = [...child.children];
			for (const fc of fragmentChildren) {
				this._appendSingleChild(fc);
			}
			child.children.length = 0;
			return child;
		}
		this._appendSingleChild(child);
		return child;
	}

	private _appendSingleChild(child: VirtualNode): void {
		if (child.parentNode) {
			child.parentNode.children = child.parentNode.children.filter((c) => c !== child);
		}
		child.parentNode = this;
		this.children.push(child);
		const mutation: DomMutation = {
			action: "appendChild",
			id: this.id,
			childId: child.id,
		};
		this.collector.add(mutation);
	}

	removeChild(child: VirtualNode): VirtualNode {
		this.children = this.children.filter((c) => c !== child);
		child.parentNode = null;
		const mutation: DomMutation = {
			action: "removeChild",
			id: this.id,
			childId: child.id,
		};
		this.collector.add(mutation);
		return child;
	}

	insertBefore(newChild: VirtualNode, refChild: VirtualNode | null): VirtualNode {
		// Flatten document fragments
		if (newChild instanceof VirtualElement && newChild.nodeName === "#DOCUMENT-FRAGMENT") {
			const fragmentChildren = [...newChild.children];
			for (const fc of fragmentChildren) {
				this.insertBefore(fc, refChild);
			}
			newChild.children.length = 0;
			return newChild;
		}

		if (newChild.parentNode) {
			newChild.parentNode.children = newChild.parentNode.children.filter((c) => c !== newChild);
		}
		newChild.parentNode = this;

		if (refChild === null) {
			this.children.push(newChild);
		} else {
			const index = this.children.indexOf(refChild);
			if (index === -1) {
				this.children.push(newChild);
			} else {
				this.children.splice(index, 0, newChild);
			}
		}

		const mutation: DomMutation = {
			action: "insertBefore",
			id: this.id,
			newId: newChild.id,
			refId: refChild?.id ?? null,
		};
		this.collector.add(mutation);
		return newChild;
	}

	remove(): void {
		if (this.parentNode) {
			this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
		}
		this.parentNode = null;
		const mutation: DomMutation = {
			action: "removeNode",
			id: this.id,
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
		while (this.children.length > 0) {
			this.removeChild(this.children[0]);
		}
		for (const node of nodes) {
			this.appendChild(node);
		}
	}

	// --- Text & HTML ---

	get textContent(): string {
		return this._textContent;
	}

	set textContent(value: string) {
		this._textContent = value;
		const mutation: DomMutation = {
			action: "setTextContent",
			id: this.id,
			textContent: value,
		};
		this.collector.add(mutation);
	}

	get innerHTML(): string {
		return this._innerHTML;
	}

	set innerHTML(value: string) {
		this._innerHTML = value;
		// Clear children
		this.children.length = 0;
		const mutation: DomMutation = {
			action: "setHTML",
			id: this.id,
			html: value,
		};
		this.collector.add(mutation);
	}

	// --- Input Properties ---

	get value(): string {
		return this._value;
	}

	set value(v: string) {
		this._value = v;
		const mutation: DomMutation = {
			action: "setProperty",
			id: this.id,
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
			id: this.id,
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
			id: this.id,
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
			id: this.id,
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

	// --- Class ---

	get className(): string {
		return this._classes.join(" ");
	}

	set className(value: string) {
		this._classes = value ? value.split(" ").filter(Boolean) : [];
		const mutation: DomMutation = {
			action: "setClassName",
			id: this.id,
			name: value,
		};
		this.collector.add(mutation);
	}

	// --- Events ---

	addEventListener(name: string, callback: (e: unknown) => void): void {
		if (!name) return;
		const listenerId = `${this.id}_${name}_${++listenerCounter}`;
		// Store the callback for the document to route events back
		this._eventListeners.set(listenerId, callback);
		this._listenerEventNames.set(listenerId, name);
		const mutation: DomMutation = {
			action: "addEventListener",
			id: this.id,
			name,
			listenerId,
		};
		this.collector.add(mutation);
	}

	private _eventListeners = new Map<string, (e: unknown) => void>();
	private _listenerEventNames = new Map<string, string>();

	getEventListener(listenerId: string): ((e: unknown) => void) | undefined {
		return this._eventListeners.get(listenerId);
	}

	removeEventListener(_name: string, callback: (e: unknown) => void): void {
		for (const [listenerId, cb] of this._eventListeners.entries()) {
			if (cb === callback) {
				this._eventListeners.delete(listenerId);
				this._listenerEventNames.delete(listenerId);
				const mutation: DomMutation = {
					action: "removeEventListener",
					id: this.id,
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

	preventDefaultFor(eventName: string): void {
		const mutation: DomMutation = {
			action: "configureEvent",
			id: this.id,
			name: eventName,
			preventDefault: true,
		};
		this.collector.add(mutation);
	}

	set onclick(cb: ((e: unknown) => void) | null) {
		if (cb) this.addEventListener("click", cb);
	}

	set ondblclick(cb: ((e: unknown) => void) | null) {
		if (cb) this.addEventListener("dblclick", cb);
	}

	set onmouseenter(cb: ((e: unknown) => void) | null) {
		if (cb) this.addEventListener("mouseenter", cb);
	}

	set onmouseleave(cb: ((e: unknown) => void) | null) {
		if (cb) this.addEventListener("mouseleave", cb);
	}

	set onmousedown(cb: ((e: unknown) => void) | null) {
		if (cb) this.addEventListener("mousedown", cb);
	}

	set onmouseup(cb: ((e: unknown) => void) | null) {
		if (cb) this.addEventListener("mouseup", cb);
	}

	set onmouseover(cb: ((e: unknown) => void) | null) {
		if (cb) this.addEventListener("mouseover", cb);
	}

	set onmousemove(cb: ((e: unknown) => void) | null) {
		if (cb) this.addEventListener("mousemove", cb);
	}

	set onkeydown(cb: ((e: unknown) => void) | null) {
		if (cb) this.addEventListener("keydown", cb);
	}

	set onkeyup(cb: ((e: unknown) => void) | null) {
		if (cb) this.addEventListener("keyup", cb);
	}

	set onkeypress(cb: ((e: unknown) => void) | null) {
		if (cb) this.addEventListener("keypress", cb);
	}

	set onchange(cb: ((e: unknown) => void) | null) {
		if (cb) this.addEventListener("change", cb);
	}

	set oncontextmenu(cb: ((e: unknown) => void) | null) {
		if (cb) this.addEventListener("contextmenu", cb);
	}

	// --- Navigation ---

	get firstChild(): VirtualNode | null {
		return this.children[0] ?? null;
	}

	get lastChild(): VirtualNode | null {
		return this.children[this.children.length - 1] ?? null;
	}

	get childNodes(): VirtualNode[] {
		return this.children;
	}

	get nextSibling(): VirtualNode | null {
		if (!this.parentNode) return null;
		const idx = this.parentNode.children.indexOf(this);
		return this.parentNode.children[idx + 1] ?? null;
	}

	get previousSibling(): VirtualNode | null {
		if (!this.parentNode) return null;
		const idx = this.parentNode.children.indexOf(this);
		return this.parentNode.children[idx - 1] ?? null;
	}

	get parentElement(): VirtualElement | null {
		return this.parentNode;
	}

	get ownerDocument(): VirtualDocument | null {
		return this._ownerDocument;
	}

	// --- Clone ---

	cloneNode(deep?: boolean): VirtualElement {
		const clone = new VirtualElement(this.nodeName, this.collector);
		// Emit createNode mutation for the clone
		const createMutation: DomMutation = {
			action: "createNode",
			id: clone.id,
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
			for (const child of this.children) {
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
					if (attr && attr.name.startsWith("data-")) {
						keys.push(kebabToCamel(attr.name.slice(5)));
					}
				}
				return keys;
			},
			getOwnPropertyDescriptor(_target, prop: string) {
				if (typeof prop !== "string") return undefined;
				const attrName = `data-${toKebabCase(prop)}`;
				if (!el.hasAttribute(attrName)) return undefined;
				return { configurable: true, enumerable: true, writable: true, value: el.getAttribute(attrName) };
			},
		});
		return this._datasetProxy;
	}

	insertAdjacentHTML(position: InsertPosition, html: string): void {
		const mutation: DomMutation = {
			action: "insertAdjacentHTML",
			id: this.id,
			position,
			html,
		};
		this.collector.add(mutation);
	}

	// --- Misc ---

	contains(other: VirtualNode | null): boolean {
		if (!other) return false;
		if (other === (this as VirtualNode)) return true;
		return this.children.some(
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
		const selector = className.split(/\s+/).filter(Boolean).map(c => `.${c}`).join("");
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
		// no-op stub
	}

	blur(): void {
		// no-op stub
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
				JSON.stringify({ nodeId: this.id }),
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
	readonly nodeType = 3;
	readonly nodeName = "#text";
	parentNode: VirtualElement | null = null;
	_ownerDocument: VirtualDocument | null = null;
	private _nodeValue: string;

	constructor(
		text: string,
		readonly id: NodeId,
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
			id: this.id,
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

	remove(): void {
		if (this.parentNode) {
			this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
		}
		this.parentNode = null;
		const mutation: DomMutation = {
			action: "removeNode",
			id: this.id,
		};
		this.collector.add(mutation);
	}

	cloneNode(_deep?: boolean): VirtualTextNode {
		return new VirtualTextNode(this._nodeValue, generateNodeId("t"), this.collector);
	}
}

/**
 * Virtual comment node.
 */
export class VirtualCommentNode {
	readonly nodeType = 8;
	readonly nodeName = "#comment";
	parentNode: VirtualElement | null = null;
	_ownerDocument: VirtualDocument | null = null;
	private _nodeValue: string;

	constructor(
		text: string,
		readonly id: NodeId,
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

	remove(): void {
		if (this.parentNode) {
			this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
		}
		this.parentNode = null;
		const mutation: DomMutation = {
			action: "removeNode",
			id: this.id,
		};
		this.collector.add(mutation);
	}

	cloneNode(_deep?: boolean): VirtualCommentNode {
		return new VirtualCommentNode(this._nodeValue, generateNodeId("c"), this.collector);
	}
}

class VirtualClassList {
	constructor(private element: VirtualElement) {}

	add(name: string): void {
		const classes = this.element.className.split(" ").filter(Boolean);
		if (!classes.includes(name)) {
			classes.push(name);
			this.element.className = classes.join(" ");
		}
	}

	remove(name: string): void {
		const classes = this.element.className.split(" ").filter((c) => c !== name && c !== "");
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
}
