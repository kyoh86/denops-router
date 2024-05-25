import { test } from "@denops/test";
import { assert } from "@std/assert";
import { Router } from "./router.ts";
import { ensure, is } from "@core/unknownutil";

test({
  mode: "all",
  name: "all",
  fn: async (denops) => {
    const r = new Router();
    r.set(denops, "foo-handler", {
      scheme: "foo",
      path: "",
      load: (_denops, _loc) => Promise.resolve(),
    });
    denops.dispatcher = r.dispatch(denops, {});
    assert(true, "setting handler and dispatching should be successed");

    r.set(denops, "assert-loaded", {
      scheme: "loaded",
      path: "/path/to",
      load: (_denops, _loc) => Promise.resolve(),
    });

    await denops.call("denops#request", denops.name, "router:open", [
      "assert-loaded",
      "",
      { id: "123" },
    ]);
    const buffers = ensure(
      await denops.call("getbufinfo", "loaded:///path/to;id=123"),
      is.ArrayOf(is.ObjectOf({ variables: is.Record })),
    );
    assert(buffers.length === 1, "buffer should be opened");
    const marker = buffers[0].variables.denops_router_handler;
    assert(
      marker === "assert-loaded",
      "handler marker should be set as loaded",
    );

    // TODO: router:internal:save
    // TODO: router:action
  },
});
