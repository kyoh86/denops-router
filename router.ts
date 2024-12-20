import type { Denops, Dispatcher } from "@denops/core";
import { as, ensure, is } from "@core/unknownutil";
import { batch } from "@denops/std/batch";
import * as buffer from "@denops/std/buffer";
import * as fn from "@denops/std/function";
import * as vars from "@denops/std/variable";
import * as option from "@denops/std/option";
import {
  type BufnameParams,
  format,
  parse as parseAsBufname,
} from "@denops/std/bufname";

import {
  type BufferOpener as BufferOpener,
  isBufferOpener,
  open,
  preload,
} from "./opener.ts";
import type { Handler } from "./types.ts";

/**
 * `Router` class defines how a Denops plugin handles each buffer that is named
 * like a URL such as `foo://path/to;param=value#fragment`.
 *
 * It registers the `BufReadCmd` auto command, and when a buffer is opened matching
 * any handler, the corresponding handler will be called. Handlers must implement the
 * `Handler` interface.
 *
 * The router selects the handler by the path and passes parameters and a fragment to it.
 */
export class Router {
  #handlers: Map<string, Handler>;
  #scheme: string;
  #defaultHandler?: Handler;

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
    if (this.#defaultHandler) {
      return {
        bufname: parsed,
        path: parsed.expr,
        handler: this.#defaultHandler,
      };
    }
    throw new Error(`There's no valid handler for a buffer ${bufname}`);
  }

  /**
   * This method is called from the auto command `BufReadCmd` with `<abuf>` and `<afile>`.
   * It sets the buffer as a special buffer and calls the `load` method of the handler
   * that matches the path.
   *
   * @param denops Denops instance.
   * @param prefix Prefix for internal denops dispatched command names.
   * @param abuf Buffer number.
   * @param afile File name.
   */
  async #load(denops: Denops, prefix: string, abuf: number, afile: string) {
    const { path, bufname, handler } = this.#match(afile);
    await buffer.ensure(denops, abuf, async () => {
      await batch(denops, async (denops) => {
        await handler.load({ bufnr: abuf, bufname });
        await vars.b.set(denops, "denops_router_handler_path", path); // A marker for the handler kind: now it's used just for the test
        await option.swapfile.setLocal(denops, false);
        await option.modified.setLocal(denops, false);
        if (handler.save) {
          await denops.cmd(
            `autocmd BufWriteCmd <buffer> call denops#request('${denops.name}', '${prefix}:internal:save', [${abuf}, '${afile}'])`,
          );
          await option.buftype.setLocal(denops, "acwrite");
        } else {
          await option.modifiable.setLocal(denops, false);
          await option.readonly.setLocal(denops, true);
        }
      });
    });
  }

  /**
   * This method is called from the auto command `BufWriteCmd` with `<abuf>` and `<afile>`.
   * It searches the handler for the buffer and calls the `save` method of it.
   *
   * @param denops Denops instance.
   * @param abuf Buffer number.
   * @param afile File name.
   */
  async #save(denops: Denops, abuf: number, afile: string) {
    const { bufname, handler } = this.#match(afile);
    if (!handler.save) {
      throw new Error(`There's no valid writable handler for ${afile}`);
    }
    await handler.save({ bufnr: abuf, bufname });
    await option.modified.setLocal(denops, false);
  }

  /**
   * Call an action of the handler bound for the buffer.
   * This method can also be called from the dispatched interface: `router:action`.
   *
   * @param denops Denops instance.
   * @param buf Target buffer number.
   * @param actName Name of the action to be called.
   * @param params Parameters for the action. Note that these are not parameters in the buffer name.
   * @return Promise<void>
   */
  public async action(
    denops: Denops,
    buf: number,
    actName: string,
    params: Record<string, unknown>,
  ) {
    const { bufname, handler } = this.#match(await fn.bufname(denops, buf));
    const action = (handler.actions || {})[actName];
    if (!action) {
      throw new Error(`There's no valid action ${actName} for ${buf}`);
    }
    await action({ bufnr: buf, bufname }, params);
  }

  /**
   * Get a buffer name with the specified path, parameters, and fragment.
   *
   * @param path Path to open.
   * @param params Parameters for the buffer name.
   * @param fragment Fragment for the buffer name.
   * @returns string that a buffer name.
   */
  public bufname(
    path: string,
    params?: BufnameParams,
    fragment?: string,
  ): string {
    if (!this.#handlers.has(path) && !this.#defaultHandler) {
      throw new Error(`There's no handler for a path '${path}'`);
    }
    return format({
      scheme: this.#scheme,
      expr: path,
      params,
      fragment,
    });
  }

  /**
   * Open a buffer for the path, parameters and fragment.
   * The buffer is handled by the handler that matches the path.
   * This method can also be called from the dispatched interface: `router:open`.
   *
   * @param denops Denops instance.
   * @param path Path to open.
   * @param params Parameters for the buffer name.
   * @param fragment Fragment for the buffer name.
   * @param opener Options to decide window selector.
   * @returns Promise that resolves when the buffer is opened.
   */
  public async open(
    denops: Denops,
    path: string,
    params?: BufnameParams,
    fragment?: string,
    opener?: BufferOpener,
  ): Promise<string> {
    const bufname = this.bufname(path, params, fragment);
    await open(denops, bufname, opener);
    return bufname;
  }

  /**
   * Preload a buffer with the specified path, parameters, and fragment.
   * The buffer is handled by the handler that matches the path.
   * This method can also be called from the dispatched interface: `router:preload`.
   *
   * @param denops Denops instance.
   * @param path Path to open.
   * @param params Parameters for the buffer name.
   * @param fragment Fragment for the buffer name.
   * @returns Promise that resolves when the buffer is opened.
   */
  public async preload(
    denops: Denops,
    path: string,
    params?: BufnameParams,
    fragment?: string,
  ): Promise<string> {
    const bufname = this.bufname(path, params, fragment);
    await preload(denops, bufname);
    return bufname;
  }

  /**
   * Set a handler for the specified path.
   *
   * @param path Path which the handler processes.
   * @param handler Handler to handle the buffer.
   */
  public handle(path: string, handler: Handler) {
    this.#handlers.set(path, handler);
  }

  /**
   * Set a handler to handle the buffer when there's no handler matched for the path.
   *
   * @param handler Handler to handle the buffer.
   */
  public handleFallback(handler: Handler) {
    this.#defaultHandler = handler;
  }

  /**
   * Register methods to call the router in the given dispatcher.
   *
   * The dispatcher will have the following methods:
   * - `router:open`
   * - `router:preload`
   * - `router:action`
   *
   * `router:open` method is used to open a buffer with the specified
   * path and parameters.
   *
   * `router:preload` method is used to preload a buffer with the specified
   * path and parameters.
   *
   * `router:action` method is used to call the action of the handler.
   *
   * @example
   * ```typescript
   * import type { Entrypoint } from "@denops/std";
   * import { Router } from "@kyoh86/denops-router";
   *
   * export const main: Entrypoint = async (denops) => {
   *   denops.dispatcher = {
   *       // ...
   *   }
   *
   *   const r = new Router("foo");
   *
   *   r.handle("path/to/foo", {
   *     load: async (loc) => {
   *       await denops.cmd(`echo "Read foo: ${loc.bufname}"`);
   *     },
   *     save: async (loc) => {
   *       await denops.cmd(`echo "Saving foo: ${loc.bufname}"`);
   *     },
   *   });
   *
   *   r.handle("path/to/bar", {
   *     load: async (loc) => {
   *       await denops.cmd(`echo "Read bar: ${loc.bufname}"`);
   *       await denops.cmd(
   *         `nnoremap <buffer> <silent> <space> <CMD>call denops#notify('${denops.name}', 'router:action', [bufnr('%'), 'play', {}])<CR>`,
   *       );
   *     },
   *     actions: {
   *       play: async (loc, _params) => {
   *         await denops.cmd(`echo "Action 'play' in bar: ${loc.bufname}"`);
   *       },
   *     },
   *   });
   *
   *   denops.dispatcher = await r.dispatch(denops, denops.dispatcher);
   * }
   * ```
   *
   * ```vim
   * " Call 'router:open' for the handler 'foo-handler' with a parameter.
   * call denops#notify('plugin-name', 'router:open', ['path/to/foo', 'vertical', {'param1': 'bar'}, '.baz'])
   * " A new buffer becomes a buffer named 'foo://path/to/foo;param1=bar#.baz',
   * " and the handler 'foo-handler' is called when the buffer is loaded.
   * " The buffer has a buftype 'acwrite' to save by the 'save' method of the handler.
   *
   * ```
   * @param dispatcher Source dispatcher to override.
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
        `autocmd BufReadCmd ${this.#scheme}://* call denops#request('${denops.name}', '${prefix}:internal:load', [bufnr(), bufname()])`,
      );
      await denops.cmd("augroup END");
    });

    const override: Dispatcher = {};
    override[`${prefix}:open`] = async (
      uPath: unknown,
      uParams: unknown,
      uFragment: unknown,
      uOpener: unknown,
    ) => {
      const path = ensure(uPath, is.String);
      const params = ensure(
        uParams,
        as.Optional(is.RecordOf(
          as.Optional(is.UnionOf([is.String, is.ArrayOf(is.String)])),
        )),
      );
      const fragment = ensure(uFragment, as.Optional(is.String));
      const opener = ensure(uOpener, as.Optional(isBufferOpener));
      return await this.open(denops, path, params, fragment, opener);
    };
    override[`${prefix}:preload`] = async (
      uPath: unknown,
      uParams: unknown,
      uFragment: unknown,
    ) => {
      const path = ensure(uPath, is.String);
      const params = ensure(
        uParams,
        as.Optional(is.RecordOf(
          as.Optional(is.UnionOf([is.String, is.ArrayOf(is.String)])),
        )),
      );
      const fragment = ensure(uFragment, as.Optional(is.String));
      await this.preload(denops, path, params, fragment);
    };
    override[`${prefix}:internal:load`] = async (
      uBuf: unknown,
      uFile: unknown,
    ) => {
      const buf = ensure(uBuf, is.Number);
      const file = ensure(uFile, is.String);
      await this.#load(denops, prefix, buf, file);
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
      uAct: unknown,
      uParams: unknown,
    ) => {
      const buf = ensure(uBuf, is.Number);
      const act = ensure(uAct, is.String);
      const params = ensure(uParams, is.Record);
      await this.action(denops, buf, act, params);
    };
    return { ...dispatcher, ...override };
  }
}
