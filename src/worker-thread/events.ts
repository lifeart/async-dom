/**
 * Virtual event classes that simulate DOM event behavior
 * including bubbling, propagation control, and default prevention.
 */

export class VirtualEvent {
	readonly type: string;
	target: unknown;
	currentTarget: unknown;
	readonly bubbles: boolean;
	readonly cancelable: boolean;
	defaultPrevented = false;
	readonly timeStamp: number;
	readonly isTrusted: boolean;
	eventPhase = 0;

	private _stopPropagation = false;
	private _stopImmediatePropagation = false;

	constructor(type: string, init?: Record<string, unknown>) {
		this.type = type;
		this.target = init?.target ?? null;
		this.currentTarget = init?.currentTarget ?? null;
		this.bubbles = (init?.bubbles as boolean) ?? false;
		this.cancelable = (init?.cancelable as boolean) ?? true;
		this.timeStamp = (init?.timeStamp as number) ?? Date.now();
		this.isTrusted = (init?.isTrusted as boolean) ?? false;

		// Copy all other properties from init
		if (init) {
			for (const key of Object.keys(init)) {
				if (!(key in this)) {
					(this as Record<string, unknown>)[key] = init[key];
				}
			}
		}
	}

	preventDefault(): void {
		if (this.cancelable) {
			this.defaultPrevented = true;
		}
	}

	stopPropagation(): void {
		this._stopPropagation = true;
	}

	stopImmediatePropagation(): void {
		this._stopImmediatePropagation = true;
		this._stopPropagation = true;
	}

	get propagationStopped(): boolean {
		return this._stopPropagation;
	}

	get immediatePropagationStopped(): boolean {
		return this._stopImmediatePropagation;
	}
}

export class VirtualCustomEvent extends VirtualEvent {
	readonly detail: unknown;

	constructor(type: string, init?: Record<string, unknown>) {
		super(type, init);
		this.detail = init?.detail ?? null;
	}
}
