# Plugin test suite

Programmatic test helpers for **Frame-Master plugin authors**. Use this with Bun’s test runner to exercise the HTTP server, request pipeline, and unified build pipeline without scaffolding a full app.

| Surface | Purpose |
| ------- | ------- |
| **`test-suite/`** (this package) | Public library: `frame-master/testing` |
| **`test/`** | Internal unit tests for the Frame-Master core |
| **`bin/testing/`** | Interactive GUI: `frame-master test start` |

## Install

```bash
bun add -d frame-master
# or use your linked / workspace version while developing against main
```

## Quick start

```ts
import { afterEach, expect, test } from "bun:test";
import type { FrameMasterPlugin } from "frame-master/plugin/types";
import { createPluginTestEnv, type PluginTestEnv } from "frame-master/testing";

function myPlugin(): FrameMasterPlugin {
  return {
    name: "my-plugin",
    version: "1.0.0",
    router: {
      request(master) {
        if (master.URL.pathname === "/hello") {
          master.setResponse("ok");
        }
      },
    },
  };
}

let env: PluginTestEnv | undefined;

afterEach(async () => {
  await env?.dispose();
  env = undefined;
});

test("route responds", async () => {
  env = await createPluginTestEnv({ plugins: [myPlugin()] });
  const res = await env.fetch("/hello");
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("ok");
});
```

## API

### `createPluginTestEnv(options)`

Creates an in-memory `FrameMasterConfig` (default `HTTPServer.port: 0`), `PluginLoader`, and builder.

| Option | Default | Description |
| ------ | ------- | ----------- |
| `plugins` | required | Plugins under test |
| `config` | `{}` | Partial config overrides (`HTTPServer`, `pluginsOptions`, …) |
| `cwd` | `process.cwd()` | Working directory for fixtures |
| `startServer` | `true` | Start HTTP server on create |
| `runCreateContext` | `true` | Run `createContext` hooks |
| `runServerStart` | `true` | Run `serverStart` hooks |
| `runServerStop` | `true` | Run `serverStop` on `dispose()` |

### `PluginTestEnv` methods

| Method | Description |
| ------ | ----------- |
| `env.fetch(path, init?)` | HTTP request against the live server |
| `env.handleRequest(request)` | Request pipeline without network (returns `{ response, master }`) |
| `env.build({ entrypoints?, buildConfig? })` | Unified build pipeline |
| `env.start()` | Start server if not already running |
| `env.dispose()` | Run `serverStop`, then stop servers / release resources |
| `env.config` / `env.builder` / `env.pluginLoader` / `env.server` / `env.baseUrl` | Escape hatches |

### Fixtures

```ts
import { withTempDir, writeFixture } from "frame-master/testing";

await withTempDir(async (dir) => {
  const entry = await writeFixture(dir, "entry.ts", `export const x = 1;\n`);
  // ...
});
```

Also: `createTempDir`, `removeTempDir`.

### Runtime plugins

Runtime plugins are registered by Bun before their dependent modules load. Preload
the `runtimePlugins` declared by the plugins under test before importing those
modules:

```ts
// test/preload.ts
import { loadRuntimePluginFromPlugins } from "frame-master/testing";
import MyPlugin from "../";
import OtherPluginFromThirdParty from "frame-master-plugin-other-plugin";

await loadRuntimePluginFromPlugins([
  MyPlugin({}),
  OtherPluginFromThirdParty({}),
]);
```

The helper preserves Frame-Master's runtime `onLoad` chaining behavior. It only
registers `runtimePlugins` declared by the provided plugins and does not load a
project configuration or create a test environment.

## Build testing (priority)

```ts
import { join } from "node:path";
import {
  createPluginTestEnv,
  withTempDir,
  writeFixture,
} from "frame-master/testing";

await withTempDir(async (dir) => {
  const entry = await writeFixture(dir, "client.ts", `export const n = 1;\n`);
  const env = await createPluginTestEnv({
    plugins: [
      {
        name: "assets",
        version: "1.0.0",
        build: {
          buildConfig: {
            outdir: join(dir, "out"),
            target: "bun",
            entrypoints: [entry],
          },
        },
      },
    ],
    startServer: false,
    cwd: dir,
  });
  const result = await env.build();
  expect(result.success).toBe(true);
  await env.dispose();
});
```

## Isolation notes

Frame-Master uses process-level singletons (config mock, global plugin context). Prefer:

- one env per test
- always `await env.dispose()` in `afterEach`
- avoid parallel test files that share process state

## Examples

See [`examples/`](./examples/) for copy-paste recipes.

## Running suite self-tests (this repo)

```bash
bun test test-suite
# or full repo suite
bun test
```
