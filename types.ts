import type { Bufname } from "https://deno.land/x/denops_std@v6.5.0/bufname/mod.ts";

export interface Location {
  bufnr: number;
  bufname: Bufname;
}

export type Action = (
  buf: Location,
  params: Record<string, unknown>,
) => Promise<void>;

/*
 * Handler handles buffers that matches the buffer name for the scheme and path.
 *
 * Creating new buffer for them, handlers are able to generate the name with `bufname` method.
 * Calling some kind of the actions for the buffer, handlers may define the `actions` property.
 *
 * The `load` or `save` method is called when the buffer is loaded or saving.
 * If the `save` method is not defined, the buffer may be read-only.
 */
export interface Handler {
  /**
   * Read the buffer content and set it into the buffer.
   * @param buf Buffer to load.
   */
  load(buf: Location): Promise<void>;
  /**
   * Write the buffer content to.
   * @param buf Buffer to save.
   */
  save?(buf: Location): Promise<void>;
  /**
   * Actions to be performed on the buffer.
   */
  actions?: Record<string, Action>;
}
