import type { Denops, Dispatcher } from "@denops/core";
import { batch } from "@denops/std/batch";
import * as buffer from "@denops/std/buffer";
import * as fn from "@denops/std/function";
import * as vars from "@denops/std/variable";
import * as option from "@denops/std/option";
import * as v from "@valibot/valibot";

import {
  type BufnameParams,
  format,
  parse as parseAsBufname,
} from "@denops/std/bufname";

import {
  type BufferOpener as BufferOpener,
  bufferOpenerSchema,
  open,
  preload,
} from "./opener.ts";
import type { Handler } from "./types.ts";
import { is, maybe } from "@core/unknownutil";

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
  #scheme: string;
  #handlers: Map<string, Handler> = new Map();
  #fallbackHandler?: Handler;

  constructor(scheme: string) {
    if (!scheme) {
      throw new Error("Scheme must be a non-empty string");
    }
    this.#scheme = scheme;
  }

  /**
   * Matches the given buffer name with the registered handlers.
   * @param bufname The name of the buffer to match.
   * @returns An object containing the matched handler, path, and parsed buffer name.
   * @throws Error if no valid handler is found for the buffer name.
   */
  #findHandler(bufname: string) {
    const parsed = parseAsBufname(bufname);
    if (parsed.scheme !== this.#scheme) {
      throw new Error(`Invalid operation for ${bufname}`);
    }
    for (const [path, handler] of this.#handlers.entries()) {
      if (path === parsed.expr) {
        return { bufname: parsed, path, handler };
      }
    }
    if (this.#fallbackHandler) {
      return {
        bufname: parsed,
        path: parsed.expr,
        handler: this.#fallbackHandler,
      };
    }
    throw new Error(`There's no valid handler for a buffer ${bufname}`);
  }

  /**
   * This method is called from the auto command `BufReadCmd` with `<abuf>` and `<afile>`.
   * It sets the buffer as a special buffer and calls the `load` method of the handler
   * that matches the path.
   *
   * If an error occurs, the buffer will be set as a read-only buffer with an error message.
   *
   * @param denops Denops instance.
   * @param prefix Prefix for internal denops dispatched command names.
   * @param abuf Buffer number.
   * @param afile File name.
   * @returns Promise<void>
   */
  async #loadBuffer(
    denops: Denops,
    prefix: string,
    abuf: number,
    afile: string,
  ): Promise<void> {
    try {
      return await this.#loadBufferCore(denops, prefix, abuf, afile);
    } catch (e) {
      await buffer.replace(denops, abuf, [`${e}`]);
      await buffer.ensure(denops, abuf, async () => {
        await option.modifiable.setLocal(denops, false);
        await option.readonly.setLocal(denops, true);
        await denops.cmd(`setlocal filetype=denops-router-error`);
        // ハイライト設定を追加します
        await denops.cmd(`
          syntax clear
          syntax match Error /\\v.+/
          highlight link Error ErrorMsg
        `);
      });
    }
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
   * @returns Promise<void>
   */
  async #loadBufferCore(
    denops: Denops,
    prefix: string,
    abuf: number,
    afile: string,
  ): Promise<void> {
    const { path, bufname, handler } = this.#findHandler(afile);
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
   * @returns Promise<void>
   */
  async #saveBuffer(denops: Denops, abuf: number, afile: string) {
    const { bufname, handler } = this.#findHandler(afile);
    if (!handler.save) {
      throw new Error(`There's no valid writable handler for ${afile}`);
    }
    await handler.save({ bufnr: abuf, bufname });
    await option.modified.setLocal(denops, false);
  }

  /**
   * @deprecated Use `executeAction` instead.
   */
  public action(
    denops: Denops,
    buf: number,
    actName: string,
    params: Record<string, unknown> = {},
  ): Promise<void> {
    return this.executeAction(denops, buf, actName, params);
  }

  /**
   * Call an action of the handler bound for the buffer.
   * This method can also be called from the dispatched interface: `router:action`.
   *
   * @param denops Denops instance.
   * @param buf Target buffer number.
   * @param actName Name of the action to be called.
   * @param params Parameters for the action. Note that these are not parameters in the buffer name.
   * @returns Promise<void>
   */
  public async executeAction(
    denops: Denops,
    buf: number,
    actName: string,
    params: Record<string, unknown> = {},
  ): Promise<void> {
    const { bufname, handler } = this.#findHandler(
      await fn.bufname(denops, buf),
    );
    const action = handler.actions ? handler.actions[actName] : undefined;
    if (!action) {
      throw new Error(`There's no valid action ${actName} for ${buf}`);
    }
    await action({ bufnr: buf, bufname }, params);
  }

  /**
   * @deprecated Use `createBufname` instead.
   */
  public bufname(
    path: string,
    params?: BufnameParams,
    fragment?: string,
  ): string {
    return this.createBufname(path, params, fragment);
  }

  /**
   * Get a buffer name with the specified path, parameters, and fragment.
   *
   * @param path Path to open.
   * @param params Parameters for the buffer name.
   * @param fragment Fragment for the buffer name.
   * @returns The formatted buffer name as a string.
   */
  public createBufname(
    path: string,
    params?: BufnameParams,
    fragment?: string,
  ): string {
    if (!this.#handlers.has(path) && !this.#fallbackHandler) {
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
    const bufname = this.createBufname(path, params, fragment);
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
    const bufname = this.createBufname(path, params, fragment);
    await preload(denops, bufname);
    return bufname;
  }

  /**
   * @deprecated Use `addHandler` instead.
   */
  public handle(path: string, handler: Handler): void {
    return this.addHandler(path, handler);
  }

  /**
   * Set a handler for the specified path.
   *
   * @param path Path which the handler processes.
   * @param handler Handler to handle the buffer.
   * @returns void
   */
  public addHandler(path: string, handler: Handler): void {
    this.#handlers.set(path, handler);
  }

  /**
   * @deprecated Use `setFallbackHandler` instead.
   */
  public handleFallback(handler: Handler) {
    this.#fallbackHandler = handler;
  }

  /**
   * Set a handler to handle the buffer when there's no handler matched for the path.
   *
   * @param handler Handler to handle the buffer.
   * @returns void
   */
  public setFallbackHandler(handler: Handler) {
    this.#fallbackHandler = handler;
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
  public async dispatch<T extends Dispatcher, P extends string>(
    denops: Denops,
    dispatcher: T,
    prefix: P = "router" as P,
  ): Promise<T> {
    const p = prefix ?? "router" as P;
    await batch(denops, async (denops) => {
      await denops.cmd(`augroup denops-${denops.name}-${this.#scheme}`);
      await denops.cmd(`autocmd! *`);
      await denops.cmd(
        `autocmd BufReadCmd ${this.#scheme}://* call denops#request('${denops.name}', '${p}:internal:load', [bufnr(), bufname()])`,
      );
      await denops.cmd("augroup END");
    });

    const open = async (
      uPath: unknown,
      uParams: unknown,
      uFragment: unknown,
      uOpener: unknown,
    ) => {
      try {
        const path = v.parse(v.string(), uPath, {
          message: (issue) => `Invalid 1st arg: ${issue.message}`,
        });
        const params = v.parse(
          v.optional(
            v.record(
              v.string(),
              v.optional(v.union([v.string(), v.array(v.string())])),
            ),
          ),
          uParams,
          { message: (issue) => `Invalid 2nd arg: ${issue.message}` },
        );
        const fragment = v.parse(v.optional(v.string()), uFragment, {
          message: (issue) => `Invalid 3rd arg: ${issue.message}`,
        });
        const opener = v.parse(v.optional(bufferOpenerSchema), uOpener, {
          message: (issue) => {
            console.log(issue);
            return `Invalid 4th arg: ${issue.message}`;
          },
        });
        return await this.open(denops, path, params, fragment, opener);
      } catch (e) {
        const err = maybe(e, is.ObjectOf({ message: is.String }));
        if (err) {
          await denops.cmd("echohl ErrorMsg | echomsg l:msg | echohl None", {
            msg: `Error: ${err.message}`,
          });
        } else {
          throw e;
        }
      }
    };

    const preload = async (
      uPath: unknown,
      uParams: unknown,
      uFragment: unknown,
    ) => {
      try {
        const path = v.parse(v.string(), uPath, {
          message: (issue) => `Invalid 1st arg: ${issue.message}`,
        });
        const params = v.parse(
          v.optional(
            v.record(
              v.string(),
              v.optional(v.union([v.string(), v.array(v.string())])),
            ),
          ),
          uParams,
          { message: (issue) => `Invalid 2nd arg: ${issue.message}` },
        );
        const fragment = v.parse(v.optional(v.string()), uFragment, {
          message: (issue) => `Invalid 3rd arg: ${issue.message}`,
        });
        await this.preload(denops, path, params, fragment);
      } catch (e) {
        const err = maybe(e, is.ObjectOf({ message: is.String }));
        if (err) {
          await denops.cmd("echohl ErrorMsg | echomsg l:msg | echohl None", {
            msg: `Error: ${err.message}`,
          });
        } else {
          throw e;
        }
      }
    };

    const internalLoad = async (
      uBuf: unknown,
      uFile: unknown,
    ) => {
      try {
        const buf = v.parse(v.number(), uBuf, {
          message: (issue) => `Invalid 1st arg: ${issue.message}`,
        });
        const file = v.parse(v.string(), uFile, {
          message: (issue) => `Invalid 2nd arg: ${issue.message}`,
        });
        await this.#loadBuffer(denops, prefix, buf, file);
      } catch (e) {
        const err = maybe(e, is.ObjectOf({ message: is.String }));
        if (err) {
          await denops.cmd("echohl ErrorMsg | echomsg l:msg | echohl None", {
            msg: `Error: ${err.message}`,
          });
        } else {
          throw e;
        }
      }
    };

    const internalSave = async (
      uBuf: unknown,
      uFile: unknown,
    ) => {
      try {
        const buf = v.parse(v.number(), uBuf, {
          message: (issue) => `Invalid 1st arg: ${issue.message}`,
        });
        const file = v.parse(v.string(), uFile, {
          message: (issue) => `Invalid 2nd arg: ${issue.message}`,
        });
        await this.#saveBuffer(denops, buf, file);
      } catch (e) {
        const err = maybe(e, is.ObjectOf({ message: is.String }));
        if (err) {
          await denops.cmd("echohl ErrorMsg | echomsg l:msg | echohl None", {
            msg: `Error: ${err.message}`,
          });
        } else {
          throw e;
        }
      }
    };

    const action = async (
      uBuf: unknown,
      uAct: unknown,
      uParams: unknown,
    ) => {
      try {
        const buf = v.parse(v.number(), uBuf, {
          message: (issue) => `Invalid 1st arg: ${issue.message}`,
        });
        const act = v.parse(v.string(), uAct, {
          message: (issue) => `Invalid 2nd arg: ${issue.message}`,
        });
        const params = v.parse(
          v.record(v.string(), v.unknown()),
          uParams,
          { message: (issue) => `Invalid 3rd arg: ${issue.message}` },
        );
        await this.executeAction(denops, buf, act, params);
      } catch (e) {
        const err = maybe(e, is.ObjectOf({ message: is.String }));
        if (err) {
          await denops.cmd("echohl ErrorMsg | echomsg l:msg | echohl None", {
            msg: `Error: ${err.message}`,
          });
        } else {
          throw e;
        }
      }
    };

    return {
      ...dispatcher,
      [`${p}:open`]: open,
      [`${p}:preload`]: preload,
      [`${p}:internal:load`]: internalLoad,
      [`${p}:internal:save`]: internalSave,
      [`${p}:action`]: action,
    };
  }
}
