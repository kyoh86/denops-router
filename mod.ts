/**
 * @module
 *
 * Deno module for denops.vim, serving as a router and dispatcher for
 * acwrite buffers.
 *
 * @example
 * ```typescript
 * import { Router } from "@kyoh86/denops-router";
 * import type { Entrypoint } from "@denops/std";
 *
 * export const main: Entrypoint = async (denops) => {
 *   denops.dispatcher = {
 *     // ...
 *   };
 *
 *   const router = new Router("diary");
 *
 *   router.handle("new", { // path: `new`
 *     load: async (buf) => {
 *       // ...
 *     },
 *     save: async (buf) => {
 *       // ...
 *     },
 *   });
 *
 *   router.handle("list", { // path: `list`
 *     load: async (buf) => {
 *       // ...
 *     },
 *     actions: {
 *       open: (_, params) => {
 *         // ...
 *       },
 *     },
 *   });
 *
 *   router.handle("view", { // path: `view`
 *     load: async (buf) => {
 *       // ...
 *     },
 *     save: async (buf) => {
 *       // ...
 *     },
 *   });
 *
 *   denops.dispatcher = await router.dispatch(denops, denops.dispatcher);
 * };
 * ```
 */
export * from "./types.ts";
export * from "./router.ts";
export * from "./opener.ts";
