import type { Denops, Dispatcher } from "@denops/core";
import { ensure, is, maybe } from "@core/unknownutil";
import { batch } from "https://deno.land/x/denops_std@v6.5.0/batch/mod.ts";
import * as buffer from "https://deno.land/x/denops_std@v6.5.0/buffer/mod.ts";
import * as vars from "https://deno.land/x/denops_std@v6.5.0/variable/mod.ts";
import * as option from "https://deno.land/x/denops_std@v6.5.0/option/mod.ts";
import {
  type BufnameParams,
  format,
  parse as parseAsBufname,
} from "https://deno.land/x/denops_std@v6.5.0/bufname/mod.ts";
import {
  parse as parseArguments,
} from "https://deno.land/x/denops_std@v6.5.0/argument/mod.ts";

import opener from "./opener.ts";
import type { Handler } from "./types.ts";

/**
 * Router class to switch handlers for each buffer.
 *
 * The dispatcher has the following methods:
 * - `router:open`
 * - `router:action`
 *
 * `router:open` method is used to open a buffer with the specified path and parameters.
 * `router:action` method is used to call the action of the handler.
 *
 * Each buffer is handled by a handler that matches the buffer name.
 *
 * @example
 * ```typescript
 * export async function main(denops: Denops) {
 *   const r = new Router("foo");
 *   r.route("path/to/foo",  {
 *     load: async (loc) => {
 *       await denops.cmd(`echo "Read foo: ${loc.bufname}"`);
 *     },
 *     save: async (loc) => {
 *       await denops.cmd(`echo "saveing foo: ${loc.bufname}"`);
 *     },
 *   });
 *   r.route("path/to/bar", {
 *     load: async (loc) => {
 *       await denops.cmd(`echo "Read bar: ${loc.name}"`);
 *       await denops.cmd(
 *         `nnoremap <buffer> <silent> <space> <CMD>call denops#notify('${denops.name}', 'router:action', [bufnr('%'), expand('%:p'), 'play', {}])<CR>`,
 *       );
 *     },
 *     actions: {
 *       play: async (loc, _params) => {
 *         await denops.cmd(`echo "Action 'play' in bar: ${loc.name}"`);
 *       },
 *     },
 *   });
 *   denops.dispatcher = await r.dispatch(denops, {});
 * }
 * ```
 * ```vim
 * " Calling 'router:open' for the handler 'foo-handler' with a parameter;
 * call denops#notify('plugin-name', 'router:open', ['path/to/foo', 'vertical', {'param1': 'bar'}, '.baz'])
 * "  a new buffer becomes a buffer named 'foo://path/to/foo;param1=bar#.baz',
 * "  and the handler 'foo-handler' is called when the buffer is loaded.
 * " The buffer has a buftype 'acwrite' to save by the 'save' method of the handler.
 *
 * " Calling the handler from command, we can use 'router:command:open' API.
 * command -nargs=* Foo call denops#notify('plugin-name', 'router:command:open', ['path/to/foo', <q-mods>, [<f-args>], '.corge'])
 * " It parses command arguments as parameters for the buffer name.
 * " For example, `:Foo --bar=baz --qux=quux` opens foo://path/to/foo;bar=baz&qux=quux#.corge
 * ```
 */
export class Router {
  #handlers: Map<string, Handler>;
  #scheme: string;

  constructor(scheme: string) {
    this.#handlers = new Map();
    this.#scheme = scheme;
  }

  #match(bufname: string) {
    const parsed = parseAsBufname(bufname);
    if (parsed.scheme !== this.#scheme) {
      throw new Error(`Invalid operation for ${bufname}`);
    }
    for (const [path, handler] of this.#handlers.entries()) {
      if (path === parsed.expr) {
        return { bufname: parsed, path, handler };
      }
    }
    throw new Error(`There's no valid handler for a buffer ${bufname}`);
  }

  async #load(denops: Denops, abuf: number, afile: string) {
    const { path, bufname, handler } = this.#match(afile);
    await buffer.ensure(denops, abuf, async () => {
      await batch(denops, async (denops) => {
        await handler.load({ bufnr: abuf, bufname });
        await vars.b.set(denops, "denops_router_handler_path", path); // A marker for the handler kind: now it's used just for the test
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

  async #save(abuf: number, afile: string) {
    const { bufname, handler } = this.#match(afile);
    if (!handler.save) {
      throw new Error(`There's no valid writable handler for ${afile}`);
    }
    await handler.save({ bufnr: abuf, bufname });
  }

  async #action(
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
    await action({ bufnr: abuf, bufname }, params);
  }

  /**
   * Open a buffer with the specified path and parameters and a fragment.
   * The buffer is handled by the handler that matches the path.
   *
   * @param denops Denops instance to handle the buffer.
   * @param path Path to open.
   * @param mods Modifiers for the `:edit` command.
   * @param params Parameters for the buffer name.
   * @param fragment Fragment for the buffer name.
   * @returns Promise that resolves when the buffer is opened.
   */
  public async open(
    denops: Denops,
    path: string,
    mods: string = "",
    params?: BufnameParams,
    fragment?: string,
  ) {
    if (!this.#handlers.has(path)) {
      throw new Error(`There's no handler for a path '${path}'`);
    }
    const bufname = format({
      scheme: this.#scheme,
      expr: path,
      params,
      fragment,
    });
    const edit = opener(mods);
    await denops.cmd(
      [mods, edit, await denops.call("fnameescape", bufname)].join(" ").trim(),
    );
  }

  /**
   * Set a handler for the specified path.
   *
   * @param path Path which the handler processes.
   * @param handler Handler to handle the buffer.
   */
  public route(path: string, handler: Handler) {
    this.#handlers.set(path, handler);
  }

  /**
   * Dispatch the given dispatcher.
   *
   * @param dispatcher Dispatcher to dispatch.
   * @param prefix Prefix of the dispatcher methods; default: "router".
   * @returns Dispatcher to use.
   */
  public async dispatch(
    denops: Denops,
    dispatcher: Dispatcher,
    prefix = "router",
  ): Promise<Dispatcher> {
    await batch(denops, async (denops) => {
      await denops.cmd(`augroup denops-${denops.name}-${this.#scheme}`);
      await denops.cmd(`autocmd! *`);
      await denops.cmd(
        `autocmd BufReadCmd ${this.#scheme}://* call denops#request('${denops.name}', 'router:internal:load', [bufnr(), bufname()])`,
      );
      await denops.cmd("augroup END");
    });

    const override: Dispatcher = {};
    override[`${prefix}:open`] = async (
      uPath: unknown,
      uMods: unknown,
      uParams: unknown,
      uFragment: unknown,
    ) => {
      const path = ensure(uPath, is.String);
      const mods = maybe(uMods, is.String);
      const params = maybe(
        uParams,
        is.RecordOf(
          is.UnionOf([is.String, is.ArrayOf(is.String), is.Undefined]),
        ),
      );
      const fragment = maybe(uFragment, is.String);
      await this.open(denops, path, mods || "", params, fragment);
    };
    override[`${prefix}:command:open`] = async (
      uPath: unknown,
      uMods: unknown,
      uArgs: unknown,
      uFragment: unknown,
    ) => {
      const path = ensure(uPath, is.String);
      const mods = maybe(uMods, is.String);
      const args = maybe(uArgs, is.ArrayOf(is.String));
      const [, params] = parseArguments(args || []);
      const fragment = maybe(uFragment, is.String);
      await this.open(denops, path, mods || "", params, fragment);
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
      await this.#save(buf, file);
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
      await this.#action(buf, file, act, params);
    };
    return { ...dispatcher, ...override };
  }
}
