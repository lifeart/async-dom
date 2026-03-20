//#region src/shared/resolve-debug.ts
/**
* Resolves a `debug` option that can be `true`, a `DebugOptions` object, or `undefined`.
* `true` expands to sensible defaults; falsy values resolve to `undefined`.
*
* Shared across all framework adapters to avoid logic drift.
*/
function resolveDebugOption(debug) {
	if (debug === true) return {
		logMutations: true,
		logEvents: true,
		exposeDevtools: true
	};
	return debug || void 0;
}
//#endregion
Object.defineProperty(exports, "resolveDebugOption", {
	enumerable: true,
	get: function() {
		return resolveDebugOption;
	}
});

//# sourceMappingURL=resolve-debug.cjs.map