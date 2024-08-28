# denops-router

This is a deno library for denops.vim as a router and a dispatcher for acwrite buffers.

## What's this?

A router handles acwrite buffers in the Vim/Neovim.
It handles buffers having a name under the specific schema (like `foo://`).
And attaches a handler mathcing for each path of the buffer name (like `foo://bar`).

Handlers should:

- Loading content
- Saving content if you needed
- Providing optional action

## Usage

If we want to create a special buffers like below:

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

Then, if we open the buffer matching the router, handlers may be called.

## Denops API functions

The router provides denops API functions:

- `router:open`
    - Open the buffer handled by the router.
    - Parameters:
        - `path: string`
        - `params?: Record<string, string|string[]>`
        - `fragment?: string`
        - `opener?: BufferOpener`
- `router:preload`
    - 
- `router:action`

And the some internal API functions:

- `router:internal:load`
    - It will be called when the buffer handled the router is opened.
- `router:internal:save`
    - It will be called when the buffer handled the router is saved.

See for detail, see the document of the "Router" class.

# License

[![MIT License](http://img.shields.io/badge/license-MIT-blue.svg)](http://www.opensource.org/licenses/MIT)

This software is released under the
[MIT License](http://www.opensource.org/licenses/MIT), see LICENSE.
