# denops-router

This is a Deno library for denops.vim, serving as a router and dispatcher for
acwrite buffers.

## What's this?

A router manages acwrite buffers (i.e., virtual buffers) in Vim/Neovim. It
handles buffers with names following a specific schema (like `foo://`). It then
assigns a handler matching each path of the buffer name (e.g., `foo://bar`).

Handlers are responsible for:

- Loading content
- Saving content if needed
- Providing optional actions

## Usage

If we want to create virtual buffers like the following:

- `diary://new`
  - Creates a new diary
  - Saves the diary
- `diary://list`
  - Shows a list of diaries
  - Opens a diary
- `diary://view`
  - Displays a diary
  - Saves the diary

We should create a router and attach handlers for each buffer path. Then, we
need to dispatch the router to the denops dispatcher:

```typescript
import { Router } from "@kyoh86/denops-router";
import type { Entrypoint } from "@denops/std";

export const main: Entrypoint = async (denops) => {
  denops.dispatcher = {
    // ...
  };

  const router = new Router("diary");

  router.handle("new", { // path: `new`
    load: async (buf) => {
      // ...
    },
    save: async (buf) => {
      // ...
    },
  });

  router.handle("list", { // path: `list`
    load: async (buf) => {
      // ...
    },
    actions: {
      open: (_, params) => {
        // ...
      },
    },
  });

  router.handle("view", { // path: `view`
    load: async (buf) => {
      // ...
    },
    save: async (buf) => {
      // ...
    },
  });

  denops.dispatcher = await router.dispatch(denops, denops.dispatcher);
};
```

Once a virtual buffer is opened, the corresponding handlers will be invoked.

## Buffer name

Virtual buffers managed by the router have names formed as follows:

`<schema>://<path>;<param1>=<value1>&<param2>=<value2>#<fragment>`

The router matches the buffer names based on the `<path>`, while the parameters
and fragments are passed to the handler.

For more details, see
[a document for `bufname` module in the @denops/std](https://jsr.io/@denops/std/doc/bufname/~)

## Denops API functions

The router provides the following denops API functions:

- `router:open`
  - Opens a virtual buffer.
  - Parameters:
    - `path: string`
      - The _path_ part of the buffer name.
    - `params?: Record<string, string|string[]>`
      - The _parameters_ part of the buffer name.
    - `fragment?: string`
      - The _fragment_ part of the buffer name.
    - `opener?: BufferOpener`
      - Options for how to attach the buffer to a window.
      - For details, refer to the "BufferOpener" interface documentation.
- `router:preload`
  - Loads a virtual buffer in the background.
  - Parameters:
    - `path: string`
    - `params?: Record<string, string|string[]>`
    - `fragment?: string`
- `router:action`
  - Calls a custom action of the handler attached to the buffer.
  - Parameters:
    - `buf: number`
      - The buffer number of the target.
    - `act: string`
      - The name of the action to call.
    - `params: Record<string, any>`
      - A set of parameters for the action.

Additionally, there are some internal API functions:

- `router:internal:load`
  - Called when the buffer managed by the router is opened.
- `router:internal:save`
  - Called when the buffer managed by the router is saved.

## License

[![MIT License](http://img.shields.io/badge/license-MIT-blue.svg)](http://www.opensource.org/licenses/MIT)

This software is released under the
[MIT License](http://www.opensource.org/licenses/MIT). See LICENSE for more
information.
