# denops-router

This is a deno library for denops.vim as a router and a dispatcher for acwrite buffers.

## What's this?

A router handles acwrite buffers (i.e. virtual buffer) in the Vim/Neovim.
It handles buffers having a name under the specific schema (like `foo://`).
And attaches a handler mathcing for each path of the buffer name (like `foo://bar`).

Handlers should:

- Loading content
- Saving content if we need
- Providing optional action

## Usage

If we want to create a virtual buffers like below:

- `diary://new`
    - Create a new diary
    - Saving the diary
- `diary://list`
    - Show a list of the diaries
    - Open a diary
- `diary://view`
    - Show a diary
    - Saving the diary

We should create a router and attach some handlers for each buffer path.
And we must dispatch the router to denops dispatcher:

```typescript
import { Router } from "@kyoh86/denops-router";
import type { Entrypoint } from "@denops/std";

export const main: Entrypoint = async (denops) => {
    denops.dispatcher = {
        // ...
    }

    const router = new Router("diary");

    router.handle("new", {  // path: `new`
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
            }
          ,
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
}
```

Then, if we open the virtual buffer, handlers may be called.

## Buffer name

Virtual buffers handled by the router, has a name formed:

`<schema>://<path>;<param1>=<value1>&<param2>=<value2>#<fragment>`

The router matches the name for each router only by `<path>` and parameters and the fragment in the name will be passed to the handler.

See for detail: https://jsr.io/@denops/std/doc/bufname/~

## Denops API functions

The router provides denops API functions:

- `router:open`
    - Open a virtual buffer.
    - Parameters:
        - `path: string`
            - A *path* part of the name of the buffer.
        - `params?: Record<string, string|string[]>`
            - A *parameter* part of the name of the buffer.
        - `fragment?: string`
            - A *fragment* part of the name of the buffer.
        - `opener?: BufferOpener`
            - Options to change a behavior of attaching a buffer to a window.
            - See for detail: a document for the "BufferOpener" interface.
- `router:preload`
    - Load a virtual buffer in background.
    - Parameters:
        - `path: string`
        - `params?: Record<string, string|string[]>`
        - `fragment?: string`
- `router:action`
    - Call the custom action of the handler attached for the buffer.
        - `buf: number`
            - A number of the target buffer.
        - `act: string`
            - A name of the action to call.
        - `params: Record`
            - A set of the parameters for the action.

And the some internal API functions:

- `router:internal:load`
    - It will be called when the buffer handled the router is opened.
- `router:internal:save`
    - It will be called when the buffer handled the router is saved.

# License

[![MIT License](http://img.shields.io/badge/license-MIT-blue.svg)](http://www.opensource.org/licenses/MIT)

This software is released under the
[MIT License](http://www.opensource.org/licenses/MIT), see LICENSE.
