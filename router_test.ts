import { test } from "@denops/test";
import { assert } from "@std/assert";
import { Router } from "./router.ts";
import { ensure, is } from "@core/unknownutil";

test({
  mode: "all",
  name: "all",
  fn: async (denops) => {
    const r = new Router("foo");
    r.route("path/to", {
      load: (_loc) => Promise.resolve(),
    });
    denops.dispatcher = await r.dispatch(denops, {});
    assert(true, "setting handler and dispatching should be successed");

    r.route("assert-loaded", {
      load: (_loc) => Promise.resolve(),
    });

    await denops.call("denops#request", denops.name, "router:open", [
      "assert-loaded",
      "",
      { id: "123" },
    ]);
    const buffers = ensure(
      await denops.call("getbufinfo", "foo://assert-loaded;id=123"),
      is.ArrayOf(is.ObjectOf({ variables: is.Record })),
    );
    assert(buffers.length === 1, "buffer should be opened");
    const marker = buffers[0].variables.denops_router_handler_path;
    assert(
      marker === "assert-loaded",
      "handler marker should be set as loaded",
    );

    await denops.call("denops#request", denops.name, "router:open", [
      "assert-loaded",
      "",
      { id: "123", name: "John" },
      "bar.baz",
    ]);
    const buffersWithFragment = ensure(
      await denops.call(
        "getbufinfo",
        "foo://assert-loaded;id=123&name=John\\#bar.baz",
      ),
      is.ArrayOf(is.ObjectOf({ variables: is.Record })),
    );
    assert(
      buffersWithFragment.length === 1,
      "buffer with fragment should be opened",
    );

    // TODO: router:internal:save
    // TODO: router:action
  },
});
