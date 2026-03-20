import type { DomMutation, InsertPosition, NodeId } from "./protocol.ts";
import type { StringStore } from "./string-store.ts";

/**
 * Opcodes for mutation actions. Each maps to a DomMutation action type.
 * Using plain numeric constants since `const enum` is not compatible
 * with isolatedModules / verbatimModuleSyntax.
 */
export const MutOp = {
	CreateNode: 0,
	CreateComment: 1,
	AppendChild: 2,
	RemoveNode: 3,
	RemoveChild: 4,
	InsertBefore: 5,
	SetAttribute: 6,
	RemoveAttribute: 7,
	SetStyle: 8,
	SetProperty: 9,
	SetTextContent: 10,
	SetClassName: 11,
	SetHTML: 12,
	AddEventListener: 13,
	HeadAppendChild: 14,
	BodyAppendChild: 15,
	PushState: 16,
	ReplaceState: 17,
	ScrollTo: 18,
	InsertAdjacentHTML: 19,
	ConfigureEvent: 20,
	RemoveEventListener: 21,
	CallMethod: 22,
} as const;

export type MutOpValue = (typeof MutOp)[keyof typeof MutOp];

/**
 * Encodes DomMutation objects into a compact binary format using DataView.
 *
 * Wire format per mutation:
 * - uint8 opcode (1 byte)
 * - uint32 for NodeIds (4 bytes each, little-endian)
 * - uint16 for string store indices (2 bytes each, little-endian)
 * - uint8 for booleans (1 byte)
 *
 * Strings are deduplicated via a shared StringStore — only their uint16
 * index is written to the buffer.
 */
export class BinaryMutationEncoder {
	private buffer: ArrayBuffer;
	private view: DataView;
	private offset = 0;
	private strings: StringStore;

	constructor(strings: StringStore, initialSize = 4096) {
		this.buffer = new ArrayBuffer(initialSize);
		this.view = new DataView(this.buffer);
		this.strings = strings;
	}

	private ensureCapacity(bytes: number): void {
		if (this.offset + bytes <= this.buffer.byteLength) return;
		const newSize = Math.max(this.buffer.byteLength * 2, this.offset + bytes);
		const newBuffer = new ArrayBuffer(newSize);
		new Uint8Array(newBuffer).set(new Uint8Array(this.buffer));
		this.buffer = newBuffer;
		this.view = new DataView(this.buffer);
	}

	private writeU8(value: number): void {
		this.ensureCapacity(1);
		this.view.setUint8(this.offset++, value);
	}

	private writeU16(value: number): void {
		this.ensureCapacity(2);
		this.view.setUint16(this.offset, value, true);
		this.offset += 2;
	}

	private writeU32(value: number): void {
		this.ensureCapacity(4);
		this.view.setUint32(this.offset, value, true);
		this.offset += 4;
	}

	private writeStr(value: string): void {
		this.writeU16(this.strings.store(value));
	}

	private writeNodeId(id: NodeId): void {
		this.writeU32(id as number);
	}

	encode(mutation: DomMutation): void {
		switch (mutation.action) {
			case "createNode":
				this.writeU8(MutOp.CreateNode);
				this.writeNodeId(mutation.id);
				this.writeStr(mutation.tag);
				this.writeStr(mutation.textContent ?? "");
				break;
			case "createComment":
				this.writeU8(MutOp.CreateComment);
				this.writeNodeId(mutation.id);
				this.writeStr(mutation.textContent);
				break;
			case "appendChild":
				this.writeU8(MutOp.AppendChild);
				this.writeNodeId(mutation.id);
				this.writeNodeId(mutation.childId);
				break;
			case "removeNode":
				this.writeU8(MutOp.RemoveNode);
				this.writeNodeId(mutation.id);
				break;
			case "removeChild":
				this.writeU8(MutOp.RemoveChild);
				this.writeNodeId(mutation.id);
				this.writeNodeId(mutation.childId);
				break;
			case "insertBefore":
				this.writeU8(MutOp.InsertBefore);
				this.writeNodeId(mutation.id);
				this.writeNodeId(mutation.newId);
				this.writeU32(mutation.refId !== null ? (mutation.refId as number) : 0xffffffff);
				break;
			case "setAttribute":
				this.writeU8(MutOp.SetAttribute);
				this.writeNodeId(mutation.id);
				this.writeStr(mutation.name);
				this.writeStr(mutation.value);
				this.writeU8(mutation.optional ? 1 : 0);
				break;
			case "removeAttribute":
				this.writeU8(MutOp.RemoveAttribute);
				this.writeNodeId(mutation.id);
				this.writeStr(mutation.name);
				break;
			case "setStyle":
				this.writeU8(MutOp.SetStyle);
				this.writeNodeId(mutation.id);
				this.writeStr(mutation.property);
				this.writeStr(mutation.value);
				this.writeU8(mutation.optional ? 1 : 0);
				break;
			case "setProperty":
				this.writeU8(MutOp.SetProperty);
				this.writeNodeId(mutation.id);
				this.writeStr(mutation.property);
				this.writeStr(JSON.stringify(mutation.value));
				break;
			case "setTextContent":
				this.writeU8(MutOp.SetTextContent);
				this.writeNodeId(mutation.id);
				this.writeStr(mutation.textContent);
				break;
			case "setClassName":
				this.writeU8(MutOp.SetClassName);
				this.writeNodeId(mutation.id);
				this.writeStr(mutation.name);
				break;
			case "setHTML":
				this.writeU8(MutOp.SetHTML);
				this.writeNodeId(mutation.id);
				this.writeStr(mutation.html);
				break;
			case "addEventListener":
				this.writeU8(MutOp.AddEventListener);
				this.writeNodeId(mutation.id);
				this.writeStr(mutation.name);
				this.writeStr(mutation.listenerId);
				break;
			case "headAppendChild":
				this.writeU8(MutOp.HeadAppendChild);
				this.writeNodeId(mutation.id);
				break;
			case "bodyAppendChild":
				this.writeU8(MutOp.BodyAppendChild);
				this.writeNodeId(mutation.id);
				break;
			case "pushState":
				this.writeU8(MutOp.PushState);
				this.writeStr(JSON.stringify(mutation.state));
				this.writeStr(mutation.title);
				this.writeStr(mutation.url);
				break;
			case "replaceState":
				this.writeU8(MutOp.ReplaceState);
				this.writeStr(JSON.stringify(mutation.state));
				this.writeStr(mutation.title);
				this.writeStr(mutation.url);
				break;
			case "scrollTo":
				this.writeU8(MutOp.ScrollTo);
				this.writeU32(mutation.x);
				this.writeU32(mutation.y);
				break;
			case "insertAdjacentHTML":
				this.writeU8(MutOp.InsertAdjacentHTML);
				this.writeNodeId(mutation.id);
				this.writeStr(mutation.position);
				this.writeStr(mutation.html);
				break;
			case "configureEvent":
				this.writeU8(MutOp.ConfigureEvent);
				this.writeNodeId(mutation.id);
				this.writeStr(mutation.name);
				this.writeU8(mutation.preventDefault ? 1 : 0);
				this.writeU8(mutation.passive ? 1 : 0);
				break;
			case "removeEventListener":
				this.writeU8(MutOp.RemoveEventListener);
				this.writeNodeId(mutation.id);
				this.writeStr(mutation.listenerId);
				break;
			case "callMethod":
				this.writeU8(MutOp.CallMethod);
				this.writeNodeId(mutation.id);
				this.writeStr(mutation.method);
				this.writeStr(JSON.stringify(mutation.args));
				break;
		}
	}

	/**
	 * Returns a trimmed copy of the internal buffer containing all encoded mutations.
	 */
	finish(): ArrayBuffer {
		return this.buffer.slice(0, this.offset);
	}

	/**
	 * Reset the write offset so the encoder can be reused for the next batch.
	 */
	reset(): void {
		this.offset = 0;
	}
}

/**
 * Decodes a binary buffer produced by BinaryMutationEncoder back into
 * DomMutation objects. Requires a synchronized StringStore to resolve
 * string indices.
 */
export class BinaryMutationDecoder {
	private view!: DataView;
	private offset = 0;
	private strings: StringStore;

	constructor(strings: StringStore) {
		this.strings = strings;
	}

	private readU8(): number {
		if (this.offset + 1 > this.view.byteLength)
			throw new Error("Binary decode: unexpected end of buffer");
		return this.view.getUint8(this.offset++);
	}

	private readU16(): number {
		if (this.offset + 2 > this.view.byteLength)
			throw new Error("Binary decode: unexpected end of buffer");
		const v = this.view.getUint16(this.offset, true);
		this.offset += 2;
		return v;
	}

	private readU32(): number {
		if (this.offset + 4 > this.view.byteLength)
			throw new Error("Binary decode: unexpected end of buffer");
		const v = this.view.getUint32(this.offset, true);
		this.offset += 4;
		return v;
	}

	private readStr(): string {
		return this.strings.get(this.readU16());
	}

	private readNodeId(): NodeId {
		return this.readU32() as NodeId;
	}

	decode(buffer: ArrayBuffer): DomMutation[] {
		this.view = new DataView(buffer);
		this.offset = 0;
		const mutations: DomMutation[] = [];

		while (this.offset < buffer.byteLength) {
			const op = this.readU8();
			mutations.push(this.decodeMutation(op));
		}
		return mutations;
	}

	private decodeMutation(op: number): DomMutation {
		switch (op) {
			case MutOp.CreateNode: {
				const id = this.readNodeId();
				const tag = this.readStr();
				const textContent = this.readStr();
				return {
					action: "createNode",
					id,
					tag,
					...(textContent ? { textContent } : {}),
				};
			}
			case MutOp.CreateComment:
				return {
					action: "createComment",
					id: this.readNodeId(),
					textContent: this.readStr(),
				};
			case MutOp.AppendChild:
				return {
					action: "appendChild",
					id: this.readNodeId(),
					childId: this.readNodeId(),
				};
			case MutOp.RemoveNode:
				return { action: "removeNode", id: this.readNodeId() };
			case MutOp.RemoveChild:
				return {
					action: "removeChild",
					id: this.readNodeId(),
					childId: this.readNodeId(),
				};
			case MutOp.InsertBefore: {
				const id = this.readNodeId();
				const newId = this.readNodeId();
				const refRaw = this.readU32();
				return {
					action: "insertBefore",
					id,
					newId,
					refId: refRaw === 0xffffffff ? null : (refRaw as NodeId),
				};
			}
			case MutOp.SetAttribute: {
				const id = this.readNodeId();
				const name = this.readStr();
				const value = this.readStr();
				const optional = this.readU8() === 1;
				return {
					action: "setAttribute",
					id,
					name,
					value,
					...(optional ? { optional } : {}),
				};
			}
			case MutOp.RemoveAttribute:
				return {
					action: "removeAttribute",
					id: this.readNodeId(),
					name: this.readStr(),
				};
			case MutOp.SetStyle: {
				const id = this.readNodeId();
				const property = this.readStr();
				const value = this.readStr();
				const optional = this.readU8() === 1;
				return {
					action: "setStyle",
					id,
					property,
					value,
					...(optional ? { optional } : {}),
				};
			}
			case MutOp.SetProperty: {
				const id = this.readNodeId();
				const property = this.readStr();
				const valueStr = this.readStr();
				return {
					action: "setProperty",
					id,
					property,
					value: JSON.parse(valueStr),
				};
			}
			case MutOp.SetTextContent:
				return {
					action: "setTextContent",
					id: this.readNodeId(),
					textContent: this.readStr(),
				};
			case MutOp.SetClassName:
				return {
					action: "setClassName",
					id: this.readNodeId(),
					name: this.readStr(),
				};
			case MutOp.SetHTML:
				return {
					action: "setHTML",
					id: this.readNodeId(),
					html: this.readStr(),
				};
			case MutOp.AddEventListener: {
				const id = this.readNodeId();
				const name = this.readStr();
				const listenerId = this.readStr();
				return { action: "addEventListener", id, name, listenerId };
			}
			case MutOp.HeadAppendChild:
				return { action: "headAppendChild", id: this.readNodeId() };
			case MutOp.BodyAppendChild:
				return { action: "bodyAppendChild", id: this.readNodeId() };
			case MutOp.PushState: {
				const state = JSON.parse(this.readStr());
				const title = this.readStr();
				const url = this.readStr();
				return { action: "pushState", state, title, url };
			}
			case MutOp.ReplaceState: {
				const state = JSON.parse(this.readStr());
				const title = this.readStr();
				const url = this.readStr();
				return { action: "replaceState", state, title, url };
			}
			case MutOp.ScrollTo:
				return { action: "scrollTo", x: this.readU32(), y: this.readU32() };
			case MutOp.InsertAdjacentHTML: {
				const id = this.readNodeId();
				const position = this.readStr() as InsertPosition;
				const html = this.readStr();
				return { action: "insertAdjacentHTML", id, position, html };
			}
			case MutOp.ConfigureEvent: {
				const id = this.readNodeId();
				const name = this.readStr();
				const preventDefault = this.readU8() === 1;
				const passive = this.readU8() === 1;
				return {
					action: "configureEvent",
					id,
					name,
					preventDefault,
					...(passive ? { passive } : {}),
				};
			}
			case MutOp.RemoveEventListener:
				return {
					action: "removeEventListener",
					id: this.readNodeId(),
					listenerId: this.readStr(),
				};
			case MutOp.CallMethod: {
				const id = this.readNodeId();
				const method = this.readStr();
				const argsStr = this.readStr();
				return { action: "callMethod", id, method, args: JSON.parse(argsStr) };
			}
			default:
				throw new Error(`Unknown mutation opcode: ${op}`);
		}
	}
}
