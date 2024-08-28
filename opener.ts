import type { Denops } from "@denops/std";
import {
  bufadd,
  bufload,
  bufnr,
  bufwinnr,
  fnameescape,
} from "@denops/std/function";
import type { BufferOpener, Split } from "./types.ts";

function openCommand(split?: Split): string[] {
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

function joinCommand(...t: (string | { toString(): string })[]) {
  return t.join(" ").trim();
}

export async function open(
  denops: Denops,
  bufname: string,
  opener?: BufferOpener,
) {
  opener ??= {};
  const winid = opener.reuse
    ? await bufwinnr(
      denops,
      await bufnr(denops, bufname),
    )
    : -1;
  await denops.cmd(
    (winid < 0)
      ? joinCommand(
        ...openCommand(opener.split),
        await fnameescape(denops, bufname),
      )
      : joinCommand(winid, "wincmd", "w"),
  );
}

export async function preload(denops: Denops, bufname: string) {
  return await bufload(denops, await bufadd(denops, bufname));
}
