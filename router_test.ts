import { test } from "@denops/test";
import { assert } from "@std/assert";
import { Router } from "./router.ts";
import { ensure, is } from "@core/unknownutil";
import type { Buffer } from "./types.ts";

test({
  mode: "all",
  name: "setting handler and dispatching should be successed",
  fn: async (denops) => {
    const r = new Router("testA");
    r.handle("path/to", {
      load: (_buf) => Promise.resolve(),
    });
    denops.dispatcher = await r.dispatch(denops, {});
  },
});

test({
  mode: "all",
  name: "handler should be loaded when it opens buffer",
  fn: async (denops) => {
    const r = new Router("testB");
    let loaded: boolean = false;
    let loadedBuffer: Buffer;
    r.handle("assert-loaded", {
      load: (buf) => {
        loaded = true;
        loadedBuffer = buf;
        return Promise.resolve();
      },
    });
    denops.dispatcher = await r.dispatch(denops, {});

    await denops.call("denops#request", denops.name, "router:open", [
      "assert-loaded",
      { id: "123" },
      "",
      {},
    ]);
    const buffers = ensure(
      await denops.call("getbufinfo", "testB://assert-loaded;id=123"),
      is.ArrayOf(is.ObjectOf({ variables: is.Record, windows: is.Array })),
    );
    assert(buffers.length === 1, "buffer should be opened");
    assert(
      buffers[0].windows.length > 0,
      "buffer should be assigned to any window",
    );
    assert(loaded, "handler should be loaded");
    assert(
      // @ts-ignore This is assigned by closure
      loadedBuffer?.bufname.scheme === "testB",
      "handler should be loaded",
    );
    const marker = buffers[0].variables.denops_router_handler_path;
    assert(
      marker === "assert-loaded",
      "handler marker should be set as loaded",
    );
  },
});

test({
  mode: "all",
  name: "buffers should be opened with fragment and params",
  fn: async (denops) => {
    const r = new Router("testC");
    r.handle("assert-loaded", {
      load: (_buf) => Promise.resolve(),
    });
    denops.dispatcher = await r.dispatch(denops, {});
    await denops.call("denops#request", denops.name, "router:open", [
      "assert-loaded",
      { id: "123", name: "John" },
      "bar.baz",
      {},
    ]);

    const buffersWithFragment = ensure(
      await denops.call(
        "getbufinfo",
        "testC://assert-loaded;id=123&name=John\\#bar.baz",
      ),
      is.ArrayOf(is.ObjectOf({ variables: is.Record })),
    );
    assert(
      buffersWithFragment.length === 1,
      "buffer with fragment should be opened",
    );
  },
});

test({
  mode: "all",
  name: "handler should be loaded when it preloads buffer",
  fn: async (denops) => {
    const r = new Router("testE");
    let loaded: boolean = false;
    let loadedBuffer: Buffer;
    r.handle("assert-loaded", {
      load: (buf) => {
        loaded = true;
        loadedBuffer = buf;
        return Promise.resolve();
      },
    });
    denops.dispatcher = await r.dispatch(denops, {});

    await denops.call("denops#request", denops.name, "router:preload", [
      "assert-loaded",
      { id: "123" },
    ]);
    const buffers = ensure(
      await denops.call("getbufinfo", "testE://assert-loaded;id=123"),
      is.ArrayOf(is.ObjectOf({ variables: is.Record })),
    );
    assert(buffers.length === 1, "buffer should be preloaded");
    assert(loaded, "handler should be loaded");
    assert(
      // @ts-ignore This is assigned by closure
      loadedBuffer?.bufname.scheme === "testE",
      "handler should be loaded",
    );
    const marker = buffers[0].variables.denops_router_handler_path;
    assert(
      marker === "assert-loaded",
      "handler marker should be set as loaded",
    );
  },
});

// TODO: Test router:internal:save
// TODO: Test router:action
