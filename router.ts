import type { Denops, Dispatcher } from "jsr:@denops/core@6.1.0";
import { ensure, is, maybe } from "@core/unknownutil";
import { batch } from "https://deno.land/x/denops_std@v6.5.0/batch/mod.ts";
import * as buffer from "https://deno.land/x/denops_std@v6.5.0/buffer/mod.ts";
import * as vars from "https://deno.land/x/denops_std@v6.5.0/variable/mod.ts";
import * as option from "https://deno.land/x/denops_std@v6.5.0/option/mod.ts";
import {
  type BufnameParams,
  format,
  parse,
} from "https://deno.land/x/denops_std@v6.5.0/bufname/mod.ts";

import opener from "./opener.ts";
import type { Handler } from "./types.ts";

/**
 * Router class to switch handlers for each buffer.
 *
 * The dispatcher has the following methods:
 * - `router:open`
 * - `router:action`
 *
 * `router:open` method is used to open a buffer with the specified kind and parameters.
 * `router:action` method is used to call the action of the handler.
 *
 * Each buffer is handled by a handler that matches the buffer name.
 *
 * @example
 * ```typescript
 * export async function main(denops: Denops) {
 *   const r = new Router();
 *   r.set(denops, "foo-handler",  {
 *     scheme: "foo",
 *     path: "/path/to",
 *     load: async (denops, loc) => {
 *       await denops.cmd(`echo "Read foo: ${loc.bufname}"`);
 *     },
 *     save: async (denops, loc) => {
 *       await denops.cmd(`echo "saveing foo: ${loc.bufname}"`);
 *     },
 *   });
 *   r.set(denops, "bar-handler", {
 *     scheme: "bar",
 *     path: "/path/to",
 *     load: async (denops, loc) => {
 *       await denops.cmd(`echo "Read bar: ${loc.name}"`);
 *       await denops.cmd(
 *         `nnoremap <buffer> <silent> <space> <CMD>call denops#notify('${denops.name}', 'router:action', [bufnr('%'), expand('%:p'), 'play', {}])<CR>`,
 *       );
 *     },
 *     actions: {
 *       play: async (denops, loc, _params) => {
 *         await denops.cmd(`echo "Action 'play' in bar: ${loc.name}"`);
 *       },
 *     },
 *   });
 *   denops.dispatcher = r.dispatch(denops, {});
 * }
 * ```
 * ```vim
 * " Calling 'router:open' for a handler, 'foo-handler' with an argument.
 * " A new buffer becomes a buffer named 'foo:///path/to;args=<args>', and the handler 'foo-handler' is called when the buffer is loaded
 * " And the buffer has a buftype 'acwrite' to save by the 'save' method of the handler.
 * command -nargs=1 Foo call denops#notify('plugin-name', 'router:open', ['foo-handler', <q-mods>, {'args': <q-args>}])
 * ```
 */
export class Router {
  #handlers: Map<string, Handler>;

  constructor() {
    this.#handlers = new Map();
  }

  #match(bufname: string) {
    const parsed = parse(bufname);
    for (const [kind, handler] of this.#handlers.entries()) {
      if (handler.scheme === parsed.scheme && handler.path === parsed.expr) {
        return { kind, bufname: parsed, handler };
      }
    }
    throw new Error(`There's no valid handler for a buffer ${bufname}`);
  }

  #bufname(kind: string, params?: BufnameParams, fragment?: string) {
    const h = this.#handlers.get(kind);
    if (!h) {
      throw new Error(`There's no handler for a kind '${kind}'`);
    }
    return format({
      scheme: h.scheme,
      expr: h.path,
      params,
      fragment,
    });
  }

  async #open(
    denops: Denops,
    kind: string,
    mods: string = "",
    params?: BufnameParams,
    fragment?: string,
  ) {
    const bufname = this.#bufname(kind, params, fragment);
    const edit = opener(mods);
    await denops.cmd([mods, edit, bufname].join(" ").trim());
  }

  async #load(denops: Denops, abuf: number, afile: string) {
    const { kind, bufname, handler } = this.#match(afile);
    await buffer.ensure(denops, abuf, async () => {
      await batch(denops, async (denops) => {
        await handler.load(denops, { bufnr: abuf, bufname });
        await vars.b.set(denops, "denops_router_handler", kind); // A marker for the handler kind: now it's used just for the test
        await option.swapfile.setLocal(denops, false);
        if (handler.save) {
          await denops.cmd(
            `autocmd BufWriteCmd <buffer> call denops#notify('${denops.name}', 'router:save', [${abuf}, '${afile}'])`,
          );
          await option.buftype.setLocal(denops, "acwrite");
        } else {
          await option.modifiable.setLocal(denops, false);
          await option.bufhidden.setLocal(denops, "wipe");
        }
      });
    });
  }

  async #save(denops: Denops, abuf: number, afile: string) {
    const { bufname, handler } = this.#match(afile);
    if (!handler.save) {
      throw new Error(`There's no valid writable handler for ${afile}`);
    }
    await handler.save(denops, { bufnr: abuf, bufname });
  }

  async #action(
    denops: Denops,
    abuf: number,
    afile: string,
    actName: string,
    params: Record<string, unknown>,
  ) {
    const { bufname, handler } = this.#match(afile);
    const action = (handler.actions || {})[actName];
    if (!action) {
      throw new Error(`There's no valid action ${actName} for ${afile}`);
    }
    await action(denops, { bufnr: abuf, bufname }, params);
  }

  /**
   * Set a handler for the specified kind.
   *
   * @param kind Kind of the handler.
   * @param handler Handler to handle the buffer.
   */
  async set(
    denops: Denops,
    kind: string,
    handler: Handler,
  ) {
    this.#handlers.set(kind, handler);
    await batch(denops, async (denops) => {
      await denops.cmd(`augroup denops-${denops.name}-${handler.scheme}`);
      await denops.cmd(`autocmd! *`);
      await denops.cmd(
        `autocmd BufReadCmd ${handler.scheme}://* call denops#request('${denops.name}', 'router:internal:load', [bufnr(), bufname()])`,
      );
      await denops.cmd("augroup END");
    });
  }

  /**
   * Dispatch the given dispatcher.
   *
   * @param dispatcher Dispatcher to dispatch.
   * @param prefix Prefix of the dispatcher methods; default: "router".
   * @returns Dispatcher to use.
   */
  dispatch(
    denops: Denops,
    dispatcher: Dispatcher,
    prefix = "router",
  ): Dispatcher {
    const override: Dispatcher = {};
    override[`${prefix}:open`] = async (
      uKind: unknown,
      uMods: unknown,
      uParams: unknown,
    ) => {
      const kind = ensure(uKind, is.String);
      const mods = maybe(uMods, is.String);
      const params = maybe(
        uParams,
        is.RecordOf(
          is.UnionOf([is.String, is.ArrayOf(is.String), is.Undefined]),
        ),
      );
      const fragments = maybe(uParams, is.String);
      await this.#open(denops, kind, mods || "", params, fragments);
    };
    override[`${prefix}:internal:load`] = async (
      uBuf: unknown,
      uFile: unknown,
    ) => {
      const buf = ensure(uBuf, is.Number);
      const file = ensure(uFile, is.String);
      await this.#load(denops, buf, file);
    };
    override[`${prefix}:internal:save`] = async (
      uBuf: unknown,
      uFile: unknown,
    ) => {
      const buf = ensure(uBuf, is.Number);
      const file = ensure(uFile, is.String);
      await this.#save(denops, buf, file);
    };
    override[`${prefix}:action`] = async (
      uBuf: unknown,
      uFile: unknown,
      uAct: unknown,
      uParams: unknown,
    ) => {
      const buf = ensure(uBuf, is.Number);
      const file = ensure(uFile, is.String);
      const act = ensure(uAct, is.String);
      const params = ensure(uParams, is.Record);
      await this.#action(denops, buf, file, act, params);
    };
    return { ...dispatcher, ...override };
  }
}
