import type { Bufname } from "@denops/std/bufname";
import { as, is, type Predicate } from "@core/unknownutil";

export interface Buffer {
  bufnr: number;
  bufname: Bufname;
}

export type Action = (
  buf: Buffer,
  params: Record<string, unknown>,
) => Promise<void> | void;

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
  load(buf: Buffer): Promise<void>;
  /**
   * Write the buffer content to.
   * @param buf Buffer to save.
   */
  save?(buf: Buffer): Promise<void>;
  /**
   * Actions to be performed on the buffer.
   */
  actions?: Record<string, Action>;
}

export type Split =
  | ""
  | "none"
  | "split-top"
  | "split-above"
  | "split-below"
  | "split-bottom"
  | "split-leftmost"
  | "split-left"
  | "split-right"
  | "split-rightmost"
  | "split-tab";

export const isSplit: Predicate<Split> = is.UnionOf([
  is.LiteralOf(""),
  is.LiteralOf("none"),
  is.LiteralOf("split-top"),
  is.LiteralOf("split-above"),
  is.LiteralOf("split-below"),
  is.LiteralOf("split-bottom"),
  is.LiteralOf("split-leftmost"),
  is.LiteralOf("split-left"),
  is.LiteralOf("split-right"),
  is.LiteralOf("split-rightmost"),
  is.LiteralOf("split-tab"),
]);

export interface BufferOpener {
  reuse?: boolean;
  split?: Split;
}

export const isBufferOpener: Predicate<BufferOpener> = is.ObjectOf({
  split: as.Optional(isSplit),
  reuse: as.Optional(is.Boolean),
});
