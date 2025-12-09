# Plugin File Pool

The Plugin File Pool is a system that enables **chained `onLoad` handlers** when multiple Frame-Master plugins could match the same file. This allows plugins to collaboratively transform files in a pipeline fashion, where each plugin's output becomes the next plugin's input.

## Overview

In traditional Bun plugin systems, if multiple plugins register `onLoad` handlers for the same file filter, only one handler typically runs. Frame-Master's File Pool solves this by:

1. **Collecting** all `onLoad` handlers from plugins
2. **Grouping** them by namespace (handlers with different namespaces are isolated)
3. **Testing** each handler's filter against the actual file path at runtime
4. **Chaining** matching handlers in priority order

```
┌─────────────────────────────────────────────────────────────┐
│                    File Pool Pipeline                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  For index.tsx:                                              │
│  ──► Plugin A (/\.tsx$/)  ──►  Plugin B (/index\.tsx$/)     │
│      (priority 0)              (priority 1)                  │
│                                                              │
│  For Button.tsx:                                             │
│  ──► Plugin A (/\.tsx$/)  (only Plugin A matches)           │
│      (priority 0)                                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Key Concept: Runtime Filter Matching

Unlike simple filter-based grouping, the File Pool tests each handler's filter **at runtime** against the actual file path. This means:

- `/\.tsx$/` and `/index\.tsx$/` can **both** match `index.tsx` and will be chained
- `/src\/.*\.ts$/` and `/\.ts$/` can **both** match `src/utils.ts` and will be chained
- Handlers with **different namespaces** are never chained together

## Automatic Pooling

Frame-Master automatically pools `onLoad` handlers in two contexts:

### 1. Runtime Plugins

Runtime plugins defined in `runtimePlugins` are pooled when loaded via Bun's plugin system:

```typescript
import type { FrameMasterPlugin } from "frame-master/plugin/types";

export default function myPlugin(): FrameMasterPlugin {
  return {
    name: "my-plugin",
    version: "1.0.0",
    runtimePlugins: [
      {
        name: "my-runtime-transform",
        setup(build) {
          build.onLoad({ filter: /\.tsx$/ }, async (args) => {
            // This handler will be chained with other plugins' handlers
            const contents = await Bun.file(args.path).text();
            return { contents: contents + "\n// Transformed", loader: "tsx" };
          });
        },
      },
    ],
  };
}
```

### 2. Build Plugins

Build plugins defined in `build.buildConfig.plugins` are pooled when `builder.build()` is called:

```typescript
import type { FrameMasterPlugin } from "frame-master/plugin/types";

export default function myPlugin(): FrameMasterPlugin {
  return {
    name: "my-plugin",
    version: "1.0.0",
    build: {
      buildConfig: {
        plugins: [
          {
            name: "my-build-transform",
            setup(build) {
              build.onLoad({ filter: /\.css$/ }, async (args) => {
                const contents = await Bun.file(args.path).text();
                return {
                  contents: `/* Processed */\n${contents}`,
                  loader: "css",
                };
              });
            },
          },
        ],
      },
    },
  };
}
```

## Using `getPooledContents()` or `args.pooled`

When your handler might be part of a chain, you have two options to access previous handler's output:

### Option 1: Direct `args.pooled` Access

Each handler receives an extended args object with a `pooled` property containing the previous handler's result:

```typescript
import type { PooledOnLoadArgs } from "frame-master/plugin";

build.onLoad({ filter: /\.tsx$/ }, async (args: PooledOnLoadArgs) => {
  if (args.pooled) {
    // This handler is chained - use previous result
    console.log("Previous loader:", args.pooled.loader);
    console.log("Previous contents:", args.pooled.contents);
  } else {
    // First in chain - read from disk
    const contents = await Bun.file(args.path).text();
  }
  // ...
});
```

### Option 2: `getPooledContents()` Helper

Use `getPooledContents()` for a simpler API that handles both cases:

```typescript
import { getPooledContents, type PooledOnLoadArgs } from "frame-master/plugin";
import type { BunPlugin } from "bun";

const myPlugin: BunPlugin = {
  name: "my-transform-plugin",
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, async (args: PooledOnLoadArgs) => {
      // Automatically handles both cases:
      // - First in chain: reads from disk
      // - Not first: gets previous handler's output
      const { contents, loader } = await getPooledContents(args);

      // Transform the contents
      const transformed = addImports(contents);

      return { contents: transformed, loader: loader ?? "tsx" };
    });
  },
};
```

### Chain Flow Example

```
File: index.tsx (original on disk)
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ Handler 1 (priority 0)                                       │
│ args.pooled = undefined (first handler)                      │
│ Returns: { loader: "tsx", contents: "// Step 1\n..." }       │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ Handler 2 (priority 5)                                       │
│ args.pooled = { loader: "tsx", contents: "// Step 1\n..." }  │
│ Returns: { loader: "html", contents: "<html>..." }           │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ Handler 3 (priority 10)                                      │
│ args.pooled = { loader: "html", contents: "<html>..." }      │
│ Returns: { loader: "file", contents: "final output" }        │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
Final result: { loader: "file", contents: "final output" }
```

### Why Use Chain-Aware Reading?

Without it, your handler would always read from disk, ignoring transformations from previous handlers:

```typescript
// ❌ Bad - ignores previous handlers
build.onLoad({ filter: /\.tsx$/ }, async (args) => {
  const contents = await Bun.file(args.path).text(); // Always reads original
  return { contents: transform(contents), loader: "tsx" };
});

// ✅ Good - respects the chain
build.onLoad({ filter: /\.tsx$/ }, async (args) => {
  const { contents } = await getPooledContents(args); // Gets chained output
  return { contents: transform(contents), loader: "tsx" };
});
```

## Priority Order

Handlers are executed in **plugin priority order** (lower number = runs first):

```typescript
// Plugin A (priority: 0) - runs first
{
  name: "plugin-a",
  priority: 0,
  runtimePlugins: [/* ... */]
}

// Plugin B (priority: 10) - runs second
{
  name: "plugin-b",
  priority: 10,
  runtimePlugins: [/* ... */]
}
```

If priority is not specified, it defaults to `1000`.

## Prevent Chaining

A handler can stop the chain by returning `preventChaining: true`. No subsequent handlers will run after that.

```typescript
import type { PooledOnLoadResult, PooledOnLoadArgs } from "frame-master/plugin";

build.onLoad(
  { filter: /\.tsx$/ },
  async (args: PooledOnLoadArgs): Promise<PooledOnLoadResult> => {
    const { contents } = await getPooledContents(args);

    // Condition to stop the chain
    if (args.path.includes("final")) {
      return {
        contents: finalize(contents),
        loader: "tsx",
        preventChaining: true, // Chain stops here
      };
    }

    return { contents: transform(contents), loader: "tsx" };
  }
);
```

### Chain Flow with `preventChaining`

```
File: component.tsx
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ Handler 1 (priority 0)                                       │
│ Returns: { loader: "tsx", contents: "step 1..." }            │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ Handler 2 (priority 5)                                       │
│ Returns: { loader: "tsx", contents: "final", preventChaining: true }
└─────────────────────────────────────────────────────────────┘
       │
       ▼  ← CHAIN STOPS HERE

Handler 3 (priority 10) - NEVER RUNS

Final result: { loader: "tsx", contents: "final" }
```

### Use Cases for `preventChaining`

- **Cache hits**: Return cached result without further processing
- **Error handling**: Stop chain when a critical error is detected
- **Short-circuit optimization**: Skip unnecessary transformations
- **Final transformations**: Mark output as complete

## Namespace Isolation

Handlers are grouped by **namespace only**. Within the same namespace, handlers with different filters can still be chained if their filters both match the same file:

```typescript
// These CAN be chained (same namespace, both match "index.tsx")
build.onLoad({ filter: /\.tsx$/ }, handler1); // matches index.tsx
build.onLoad({ filter: /index\.tsx$/ }, handler2); // matches index.tsx

// These are ISOLATED (different namespaces - never chain together)
build.onLoad({ filter: /\.tsx$/, namespace: "virtual" }, handler3);
build.onLoad({ filter: /\.tsx$/, namespace: "file" }, handler4);
build.onLoad({ filter: /\.tsx$/, namespace: "file" }, handler5);
```

## Advanced: Manual File Pool Usage

For advanced use cases, you can create and manage file pools directly:

```typescript
import { FilePool, wrapPluginForPool } from "frame-master/plugin";
import type { BunPlugin } from "bun";

// Create a pool
const pool = new FilePool();

// Define plugins
const pluginA: BunPlugin = {
  name: "plugin-a",
  setup(build) {
    build.onLoad({ filter: /\.md$/ }, async (args) => {
      const contents = await Bun.file(args.path).text();
      return { contents: parseMarkdown(contents), loader: "js" };
    });
  },
};

const pluginB: BunPlugin = {
  name: "plugin-b",
  setup(build) {
    build.onLoad({ filter: /\.md$/ }, async (args) => {
      const { contents } = await getPooledContents(args);
      return { contents: addWrapper(contents), loader: "js" };
    });
  },
};

// Register plugins to pool with priorities
wrapPluginForPool(pool, "plugin-a", 0, pluginA);
wrapPluginForPool(pool, "plugin-b", 1, pluginB);

// Create unified plugin
const unifiedPlugin = pool.createUnifiedPlugin("my-md-pipeline");

// Use in Bun.build
await Bun.build({
  entrypoints: ["./src/index.ts"],
  plugins: [unifiedPlugin],
});
```

## FilePool API Reference

### `FilePool` Class

```typescript
class FilePool {
  // Register a handler to the pool
  register(
    pluginName: string,
    priority: number,
    options: OnLoadOptions,
    handler: OnLoadHandler
  ): void;

  // Create a unified Bun plugin with chained handlers
  createUnifiedPlugin(name: string): BunPlugin;

  // Apply pooled handlers to an existing plugin builder
  applyToBuilder(build: PluginBuilder): void;

  // Get the number of registered handlers
  get size(): number;

  // Get the number of unique filter groups
  get groupCount(): number;

  // Clear all registered handlers
  clear(): void;

  // Get debug information
  getDebugInfo(): {
    totalHandlers: number;
    groups: Array<{
      filter: string;
      handlers: Array<{ pluginName: string; priority: number }>;
    }>;
  };
}
```

### `wrapPluginForPool()`

Captures `onLoad` handlers from a BunPlugin and registers them to a pool:

```typescript
function wrapPluginForPool(
  pool: FilePool,
  pluginName: string,
  priority: number,
  plugin: BunPlugin
): void;
```

### `getPooledContents()`

Gets file contents from the chain or disk:

```typescript
function getPooledContents(
  args: OnLoadArgs
): Promise<{ contents: string; loader?: string }>;
```

## Example: Multi-Plugin CSS Pipeline

Here's a complete example of three plugins working together to process CSS files:

```typescript
// Plugin 1: CSS Variables (runs first)
const cssVariablesPlugin: FrameMasterPlugin = {
  name: "css-variables",
  version: "1.0.0",
  priority: 0,
  build: {
    buildConfig: {
      plugins: [
        {
          name: "css-variables",
          setup(build) {
            build.onLoad({ filter: /\.css$/ }, async (args) => {
              const contents = await Bun.file(args.path).text();
              const withVariables = injectCSSVariables(contents);
              return { contents: withVariables, loader: "css" };
            });
          },
        },
      ],
    },
  },
};

// Plugin 2: Autoprefixer (runs second)
const autoprefixerPlugin: FrameMasterPlugin = {
  name: "autoprefixer",
  version: "1.0.0",
  priority: 10,
  build: {
    buildConfig: {
      plugins: [
        {
          name: "autoprefixer",
          setup(build) {
            build.onLoad({ filter: /\.css$/ }, async (args) => {
              const { contents } = await getPooledContents(args);
              const prefixed = addVendorPrefixes(contents);
              return { contents: prefixed, loader: "css" };
            });
          },
        },
      ],
    },
  },
};

// Plugin 3: CSS Minifier (runs last)
const cssMinifierPlugin: FrameMasterPlugin = {
  name: "css-minifier",
  version: "1.0.0",
  priority: 20,
  build: {
    buildConfig: {
      plugins: [
        {
          name: "css-minifier",
          setup(build) {
            build.onLoad({ filter: /\.css$/ }, async (args) => {
              const { contents } = await getPooledContents(args);
              const minified = minifyCSS(contents);
              return { contents: minified, loader: "css" };
            });
          },
        },
      ],
    },
  },
};

// In frame-master.config.ts
export default {
  plugins: [cssVariablesPlugin, autoprefixerPlugin, cssMinifierPlugin],
};

// Result: CSS files go through:
// 1. Variable injection
// 2. Vendor prefixing
// 3. Minification
```

## Debugging

Use `getDebugInfo()` to inspect the pool state:

```typescript
import { FilePool } from "frame-master/plugin";

const pool = new FilePool();
// ... register handlers ...

console.log(JSON.stringify(pool.getDebugInfo(), null, 2));
```

Output:

```json
{
  "totalHandlers": 3,
  "groups": [
    {
      "filter": ":/\\.css$/",
      "handlers": [
        { "pluginName": "css-variables", "priority": 0 },
        { "pluginName": "autoprefixer", "priority": 10 },
        { "pluginName": "css-minifier", "priority": 20 }
      ]
    }
  ]
}
```
