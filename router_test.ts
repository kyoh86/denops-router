import { test } from "@denops/test";
import { assert } from "@std/assert";
import { Router } from "./router.ts";
import { ensure, is } from "@core/unknownutil";

test({
  mode: "all",
  name: "all",
  fn: async (denops) => {
    const r = new Router("foo");
    r.handle("path/to", {
      load: (_loc) => Promise.resolve(),
    });
    denops.dispatcher = await r.dispatch(denops, {});
    assert(true, "setting handler and dispatching should be successed");

    r.handle("assert-loaded", {
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
    r.handle("command-defined", {
      load: (_loc) => Promise.resolve(),
    });
    await denops.call("denops#request", denops.name, "router:setup:command", [
      "command-defined",
    ]);
    await denops.cmd("FooOpenCommandDefined");
    const buffersWithCommand = ensure(
      await denops.call(
        "getbufinfo",
        "foo://command-defined;",
      ),
      is.ArrayOf(is.ObjectOf({ variables: is.Record })),
    );
    console.log(
      ensure(
        await denops.call(
          "getbufinfo",
          "foo://command-defined;",
        ),
        is.ArrayOf(is.ObjectOf({ name: is.String })),
      ).map((x) => x.name),
    );
    assert(
      buffersWithCommand.length === 1,
      "buffer with command should be opened",
    );

    await denops.cmd("FooOpenCommandDefined --p1=v1 --p2=v2");
    const buffersWithCommandAndParams = ensure(
      await denops.call(
        "getbufinfo",
        "foo://command-defined;p1=v1&p2=v2",
      ),
      is.ArrayOf(is.ObjectOf({ variables: is.Record })),
    );
    assert(
      buffersWithCommandAndParams.length === 1,
      "buffer with command and params should be opened",
    );
  },
});
