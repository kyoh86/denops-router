import type { Bufname } from "@denops/std/bufname";

/**
 * LoadContext represents a context when the buffer is loaded.
 * @property firstTime True if the buffer is loaded for the first time.
 *                    False if the buffer is reloaded.
 */
export type LoadContext = {
  firstTime: boolean;
};

/**
 * SaveContext represents a context when the buffer is saved.
 * (Reserved for future use)
 */
export type SaveContext = Record<PropertyKey, never>;

/**
 * Buffer represents a buffer.
 * @property bufnr Buffer number.
 * @property bufname Parsed buffer name.
 */
export interface Buffer {
  bufnr: number;
  bufname: Bufname;
}

/**
 * An Action is a function that performs some kind of action on the buffer.
 * @param buf Buffer to perform the action.
 * @param params Parameters for the action.
 * @returns Promise that resolves when the action is completed.
 */
export type Action = (
  buf: Buffer,
  params: Record<string, unknown>,
) => Promise<void> | void;

/**
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
  load(ctx: LoadContext, buf: Buffer): Promise<void>;
  /**
   * Write the buffer content to.
   * @param buf Buffer to save.
   */
  save?(ctx: SaveContext, buf: Buffer): Promise<void>;
  /**
   * Actions to be performed on the buffer.
   */
  actions?: Record<string, Action>;
}
