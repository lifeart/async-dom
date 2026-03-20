# Changelog

## 2.0.0-alpha.1

Complete rewrite of @lifeart/async-dom as a modern TypeScript library.

### Added
- TypeScript with strict mode and discriminated union message protocol
- Frame-budget scheduler with adaptive batch sizing, priority sorting, and viewport culling
- Proxy-based virtual DOM with microtask-batched mutation collection
- Multiple transport backends: Web Worker (postMessage), WebSocket (with reconnection), optional Comlink adapter
- Multi-app support: multiple workers rendering to one document
- ESM + CJS dual-package build via tsdown
- Vitest test suite with unit and integration tests
- Biome for linting and formatting
- GitHub Actions CI pipeline

### Changed
- Mutations are always batched (array), eliminating dual single/batch code paths
- Event listeners use listenerId instead of magic string conventions
- Node cache uses Map instead of plain object
- SVG namespace handling expanded beyond just `svg` and `path`
- WebSocket transport includes exponential backoff reconnection with jitter
- Event bridge uses AbortController for clean listener removal

### Removed
- Multiple DOM implementations (domino, jsdom, simple-dom bundles) — replaced by single virtual DOM
- Framework-specific hooks (app-hooks.js for Ember)
- importScripts / CommonJS shims — replaced by ES module workers
- ProcessTransport Node.js process.send() mode
- Alert handling (synchronous alert blocks everything)
- LegacyProcessTransport class
- browserify build tooling
- eslint 4 configuration
