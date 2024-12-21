import type { Denops } from "@denops/std";
import * as fn from "@denops/std/function";
import { as, is, type Predicate } from "@core/unknownutil";

/**
 * Split direction of a window.
 */
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

/**
 * Predicate for unknownutil to ensure {@link Split}.
 * @param x The unknown value to check.
 * @returns `true` if the value is {@link Split}.
 * @example
 * ```typescript
 * const x: unknown = "split-top";
 * const split = ensure(x, isSplit); // split is Split
 * ```
 */
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

/**
 * Options to change a behavior of attaching a buffer to a window.
 * The buffer is attached to the window by `:edit` command.
 * @property {boolean} reuse If the buffer is already atached in any window, focus it.
 * @property {Split} split Before the buffer is attached in the window, split the window in this way.
 * The "none" means that the buffer is attached in the current window.
 */
export interface BufferOpener {
  reuse?: boolean;
  split?: Split;
}

/**
 * Predicate for unknownutil to ensure {@link BufferOpener}.
 * @param x The unknown value to check.
 * @returns `true` if the value is {@link BufferOpener}.
 * @example
 * ```typescript
 * const x: unknown = { reuse: true, split: "split-top" };
 * const opener = ensure(x, isBufferOpener); // opener is BufferOpener
 * ```
 */
export const isBufferOpener: Predicate<BufferOpener> = is.ObjectOf({
  split: as.Optional(isSplit),
  reuse: as.Optional(is.Boolean),
});

function getOpenCommand(split?: Split): string[] {
  switch (split) {
    case undefined:
    case "":
    case "none":
      return ["edit"];
    case "split-top":
      return ["topleft", "new"];
    case "split-above":
      return ["aboveleft", "new"];
    case "split-below":
      return ["belowright", "new"];
    case "split-bottom":
      return ["botright", "new"];
    case "split-leftmost":
      return ["topleft", "vnew"];
    case "split-left":
      return ["aboveleft", "vnew"];
    case "split-right":
      return ["belowright", "vnew"];
    case "split-rightmost":
      return ["botright", "vnew"];
    case "split-tab":
      return ["tabnew"];
  }
}

/**
 * Parse Vim's command modifiers (like :aboveleft, :vertical, etc.) to {@link Split}.
 * @param {string|unedefined} mods Vim's command modifiers joined by spaces
 * @returns {@link Split}
 */
export function parseMods(mods: string | undefined): Split {
  if (typeof mods === "undefined" || mods === "") {
    return "";
  }
  const words = mods.split(" ");
  let split: "" | "tab" | "horizontal" | "vertical" = "";
  let direction:
    | ""
    | "aboveleft"
    | "leftabove"
    | "belowright"
    | "rightbelow"
    | "topleft"
    | "botright" = "";

  for (const w of words) {
    switch (w) {
      case "tab":
      case "horizontal":
      case "vertical":
        split = w;
        break;
      case "aboveleft":
      case "leftabove":
      case "belowright":
      case "rightbelow":
      case "topleft":
      case "botright":
        direction = w;
        break;
    }
  }
  switch (split) {
    case "":
      switch (direction) {
        case "":
          return "";
        case "aboveleft":
        case "leftabove":
          return "split-above";
        case "belowright":
        case "rightbelow":
          return "split-below";
        case "topleft":
          return "split-top";
        case "botright":
          return "split-bottom";
        default:
          // dead block
      }
      break;
    case "tab":
      return "split-tab";
    case "horizontal":
      switch (direction) {
        case "":
        case "aboveleft":
        case "leftabove":
          return "split-above";
        case "belowright":
        case "rightbelow":
          return "split-below";
        case "topleft":
          return "split-top";
        case "botright":
          return "split-bottom";
        default:
          // dead block
      }
      break;
    case "vertical":
      switch (direction) {
        case "":
        case "aboveleft":
        case "leftabove":
          return "split-left";
        case "belowright":
        case "rightbelow":
          return "split-right";
        case "topleft":
          return "split-leftmost";
        case "botright":
          return "split-rightmost";
        default:
          // dead block
      }
      break;
  }
  throw new Error("invalid operation");
}

/**
 * Open a buffer in a window.
 * @param {Denops} denops Denops instance
 * @param {string} bufname Buffer name to open
 * @param {BufferOpener} opener Options to open the buffer
 * @returns {Promise<void>}
 */
export async function open(
  denops: Denops,
  bufname: string,
  opener?: BufferOpener,
): Promise<void> {
  opener ??= {};
  const winid = opener.reuse
    ? await fn.bufwinnr(
      denops,
      await fn.bufnr(denops, bufname),
    )
    : -1;
  await denops.cmd(
    (winid < 0
      ? [
        ...getOpenCommand(opener.split),
        await fn.fnameescape(denops, bufname),
      ]
      : [winid, "wincmd", "w"]).join(" ").trim(),
  );
}

/**
 * Preload a buffer in a window.
 * @param {Denops} denops Denops instance
 * @param {string} bufname Buffer name to preload
 * @returns {Promise<void>}
 */
export async function preload(denops: Denops, bufname: string): Promise<void> {
  return await fn.bufload(denops, await fn.bufadd(denops, bufname));
}
