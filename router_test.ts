import { test } from "jsr:@denops/test@^2.0.1";
import { assert } from "jsr:@std/assert@^0.225.3";
import { Router } from "./router.ts";
import { ensure, is } from "jsr:@core/unknownutil@^3.18.1";
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
      "",
      { id: "123" },
    ]);
    const buffers = ensure(
      await denops.call("getbufinfo", "testB://assert-loaded;id=123"),
      is.ArrayOf(is.ObjectOf({ variables: is.Record })),
    );
    assert(buffers.length === 1, "buffer should be opened");
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
      "",
      { id: "123", name: "John" },
      "bar.baz",
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
  name: "buffers should be opened with command",
  fn: async (denops) => {
    const r = new Router("testD");
    r.handle("assert-loaded", {
      load: (_buf) => Promise.resolve(),
    });
    denops.dispatcher = await r.dispatch(denops, {});
    r.handle("command-defined", {
      load: (_buf) => Promise.resolve(),
    });
    await denops.call("denops#request", denops.name, "router:setup:command", [
      "command-defined",
    ]);
    await denops.cmd("TestDOpenCommandDefined");
    const buffersWithCommand = ensure(
      await denops.call(
        "getbufinfo",
        "testD://command-defined;",
      ),
      is.ArrayOf(is.Unknown),
    );
    assert(
      buffersWithCommand.length === 1,
      "buffer with command should be opened",
    );

    await denops.cmd("TestDOpenCommandDefined --p1=v1 --p2=v2");
    const buffersWithCommandAndParams = ensure(
      await denops.call(
        "getbufinfo",
        "testD://command-defined;p1=v1&p2=v2",
      ),
      is.ArrayOf(is.Unknown),
    );
    assert(
      buffersWithCommandAndParams.length === 1,
      "buffer with command and params should be opened",
    );
  },
});

// TODO: Test router:internal:save
// TODO: Test router:action
