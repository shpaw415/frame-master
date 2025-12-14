# Frame-Master Copilot Instructions

## Project Overview

Frame-Master is a **plugin-first meta-framework for Bun.js** - not a web framework. The core runtime provides HTTP server, plugin lifecycle, build orchestration, and file watching. **Plugins define all behavior** (routing, SSR, building).

## Architecture

### Core Components

- **Plugin Loader** ([src/plugins/plugin-loader.ts](src/plugins/plugin-loader.ts)) - Loads and sorts plugins by priority, validates requirements
- **Request Manager** ([src/server/request-manager.ts](src/server/request-manager.ts)) - `masterRequest` class handles request lifecycle, cookies, context, response building
- **Singleton Builder** ([src/build/index.ts](src/build/index.ts)) - All plugins contribute to ONE unified build via merged configs
- **Plugin Chaining** ([src/plugins/plugin-chaining.ts](src/plugins/plugin-chaining.ts)) - Chains multiple `onLoad` handlers for same file pattern (enabled by default)

### Plugin Hook Lifecycle

```
Server Start: serverStart.main → serverStart.dev_main (dev only)
Request Flow: before_request → request → after_request → html_rewrite
Build Flow:   buildConfig (merged) → beforeBuild → Bun.build → afterBuild
```

### Key Types

- `FrameMasterPlugin` - Full plugin interface with all hooks ([src/plugins/types.ts](src/plugins/types.ts))
- `FrameMasterConfig` - Main config structure ([src/server/type.ts](src/server/type.ts))
- `masterRequest` - Request context class with cookie/response helpers

## Development Commands

```bash
bun run frame-master dev      # Start dev server with hot reload
bun run frame-master start    # Production server
bun test                      # Run all tests with bun:test
bun test test/plugin-chaining.test.ts  # Run specific test
```

## Code Patterns

### Plugin Structure

```typescript
import type { FrameMasterPlugin } from "frame-master/plugin/types";

export function myPlugin(): FrameMasterPlugin {
  return {
    name: "my-plugin",
    version: "1.0.0",
    priority: 100, // Lower = higher priority (0 runs first)
    router: {
      before_request: (master) => master.setContext({ key: "value" }),
      request: (master) => master.setResponse("Hello"),
      after_request: (master) =>
        master.response.headers.set("X-Header", "value"),
    },
    build: {
      buildConfig: { external: ["react"], minify: true },
      // Or dynamic: buildConfig: (builder) => ({ minify: !builder.isLogEnabled })
    },
  };
}
```

### Response Setting Pattern

Use `masterRequest` methods, never construct Response directly in plugins:

```typescript
master.setResponse(body, init); // Set response body
master.setJSXResponse(<Component />); // React SSR
master.sendNow(); // Skip remaining request plugins
master.setContext({ key: value }); // Share data between hooks
master.getCookie("name", encrypted); // Read cookies
master.setCookie("name", data, options); // Set cookies
```

### Build Configuration Merging

Plugins contribute config that gets intelligently merged:

- **Arrays** (`external`, `entrypoints`): Deduplicated and concatenated
- **Objects** (`define`, `loader`): Deep merged
- **Plugins array**: Concatenated (order preserved)
- **Primitives**: Last plugin wins (warning if conflict)

## Testing Conventions

Tests use Bun's native test runner in `test/` directory:

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";

describe("feature", () => {
  beforeAll(() => {
    /* setup */
  });
  afterAll(() => {
    /* cleanup temp files */
  });

  test("should do something", () => {
    expect(result).toBe(expected);
  });
});
```

CLI tests spawn `bun` processes and check outputs ([test/cli/cli.test.ts](test/cli/cli.test.ts)).

## Package Exports

Import from these paths (defined in `package.json` exports):

```typescript
import { builder } from "frame-master/build";
import { masterRequest } from "frame-master/server/request";
import type { FrameMasterPlugin } from "frame-master/plugin/types";
import { onRoute } from "frame-master/utils"; // Route helper
```

## Important Conventions

- Config file: `frame-master.config.ts` in project root
- Build output: `.frame-master/build/` directory
- Files marked `"server only"` (directive at top) run only on server
- Plugin chaining allows multiple plugins to transform same file pattern sequentially
- Use `verboseLog()` from `frame-master/utils` for debug output (enabled via `-v` flag)
