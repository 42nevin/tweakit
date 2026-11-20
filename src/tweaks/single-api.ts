// Public declarations for the standalone bundle. Registration imports are a
// runtime concern of single.ts, not dependencies of this public API surface.
export * from "./core.js";
export { mountInspector } from "../inspector.js";
export type * from "../inspector.js";
