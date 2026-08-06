# Plugin Chaining

Plugin chaining is a powerful feature in Frame-Master v3.0.0+ that allows multiple plugins to transform the same file sequentially. When multiple plugins register `onLoad` handlers for the same file pattern, their outputs are chained together—the output of one becomes the input of the next.

## Overview

Without chaining, if two plugins both handle `.tsx` files, only the first one would run (Bun's default behavior). With chaining enabled, both plugins process the file in sequence, allowing for composable transformations.

```
┌─────────────────────────────────────────────────────────────┐
│                     Plugin Chaining Flow                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Original File ──► Plugin A ──► Plugin B ──► Final Output  │
│                                                              │
│   example.tsx       adds import   wraps code   bundled file │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Enabling/Disabling Chaining

Plugin chaining is **enabled by default**. You can disable it in your `frame-master.config.ts`:

```typescript
import { defineConfig } from "frame-master";

export default defineConfig({
  plugins: [
    // your plugins...
  ],
  pluginsOptions: {
    disableOnLoadChaining: true, // Disable chaining
  },
});
```

## How It Works

### Handler Registration

When chaining is enabled, Frame-Master collects all `onLoad` handlers from your plugins and groups them by their filter pattern and namespace:

```typescript
// Plugin A
build.onLoad({ filter: /\.tsx$/ }, async (args) => {
  // Handler 1 for .tsx files
});

// Plugin B
build.onLoad({ filter: /\.tsx$/ }, async (args) => {
  // Handler 2 for .tsx files - will run AFTER Handler 1
});
```

Both handlers will execute in order, with the output of Handler 1 feeding into Handler 2.

### Accessing Chained Content and Loader

Plugins can access the accumulated content and loader from previous handlers via special properties on `args`:

- **`args.__chainedContents`** - The transformed content from previous handlers in the chain
- **`args.__chainedLoader`** - The loader type returned by the previous handler (e.g., `"tsx"`, `"js"`, `"css"`)

```typescript
build.onLoad({ filter: /\.tsx$/ }, async (args) => {
  // Get content from previous handlers in the chain (if any)
  // Falls back to reading from disk if this is the first handler
  const content = args.__chainedContents ?? (await Bun.file(args.path).text());

  // Access the loader from the previous handler (useful for dynamic loader handling)
  const previousLoader = args.__chainedLoader; // e.g., "tsx", "js", etc.

  // Transform the content
  const transformed = `import "my-lib";\n${content}`;

  return {
    contents: transformed,
    loader: "tsx",
  };
});
```

### Helper Function

Frame-Master provides a helper function `getChainableContent` to simplify this pattern:

```typescript
import { getChainableContent } from "frame-master/plugin";

build.onLoad({ filter: /\.tsx$/ }, async (args) => {
  const content = await getChainableContent(args);

  return {
    contents: `import "my-lib";\n${content}`,
    loader: "tsx",
  };
});
```

## Custom Namespaces

Plugin chaining also works with custom namespaces (from `onResolve` redirects):

```typescript
// Redirect to custom namespace
build.onResolve({ filter: /^virtual:config$/ }, (args) => {
  return { path: "/config", namespace: "virtual" };
});

// Handle in custom namespace
build.onLoad({ filter: /.*/, namespace: "virtual" }, async (args) => {
  // For custom namespaces, you handle content yourself
  // (no automatic disk read since it's not a real file)
  return {
    contents: `export default { version: "1.0.0" }`,
    loader: "js",
  };
});
```

Custom namespace handlers can still be chained if multiple plugins register handlers for the same namespace/filter combination.

## Other Handlers

Only `onLoad` handlers are chained. Other handlers are passed through unchanged:

- **`onResolve`** - Passed through to Bun directly
- **`onStart`** - Passed through to Bun directly
- **`onEnd`** - Passed through to Bun directly (with proper `build.config` access)
- **`onBeforeParse`** - Passed through to Bun directly

## Verbose Logging

Use the `--verbose` flag to see detailed chaining information:

```bash
NODE_ENV=production frame-master build --verbose
```

Output example:

```
[PluginChaining] Adding plugin: react-to-html-transformer
[PluginChaining]   └─ Found 2 onLoad handler(s): \.css$, .*
[PluginChaining]   └─ Found other handlers (onResolve, onStart, etc.)
[PluginChaining] Creating chained plugin:
[PluginChaining]   └─ Total onLoad handlers: 6
[PluginChaining]   └─ Unique patterns: 4
[PluginChaining]   └─ Chained patterns (multiple handlers): 2
[PluginChaining]   └─ Plugins: react-to-html, apply-react
[PluginChaining] Chaining 2 handlers for: /src/pages/index.tsx
[PluginChaining]   └─ Handler order: react-to-html → apply-react
[PluginChaining]   └─ [1/2] react-to-html: 1024 → 2048 bytes (1.23ms)
[PluginChaining]   └─ [2/2] apply-react: 2048 → 2156 bytes (0.45ms)
```

## Example: Multi-Plugin Transformation

Here's a practical example with two plugins transforming React files:

```typescript
// plugin-add-imports.ts
export const addImportsPlugin: BunPlugin = {
  name: "add-imports",
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, async (args) => {
      const content =
        args.__chainedContents ?? (await Bun.file(args.path).text());

      // Add React import if missing
      if (!content.includes("import React")) {
        return {
          contents: `import React from "react";\n${content}`,
          loader: "tsx",
        };
      }

      return { contents: content, loader: "tsx" };
    });
  },
};

// plugin-wrap-component.ts
export const wrapComponentPlugin: BunPlugin = {
  name: "wrap-component",
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, async (args) => {
      const content =
        args.__chainedContents ?? (await Bun.file(args.path).text());

      // Wrap with error boundary
      return {
        contents: `
          import { ErrorBoundary } from "react-error-boundary";
          ${content}
          export const WrappedComponent = () => (
            <ErrorBoundary fallback={<div>Error</div>}>
              <Component />
            </ErrorBoundary>
          );
        `,
        loader: "tsx",
      };
    });
  },
};

// frame-master.config.ts
export default defineConfig({
  plugins: [
    myPlugin({
      // ...
      build: {
        plugins: [addImportsPlugin, wrapComponentPlugin],
      },
    }),
  ],
});
```

Both plugins will process `.tsx` files in sequence.

## API Reference

### `chainPlugins(plugins: BunPlugin[]): BunPlugin`

Chains multiple BunPlugins into a single plugin with onLoad handler chaining.

```typescript
import { chainPlugins } from "frame-master/plugin";

const chainedPlugin = chainPlugins([pluginA, pluginB, pluginC]);
```

### `getChainableContent(args: OnLoadArgs): Promise<string>`

Helper to get content from the chain or read from disk.

```typescript
import { getChainableContent } from "frame-master/plugin";

const content = await getChainableContent(args);
```

### `PluginProxy` Class

Low-level API for manual plugin chaining:

```typescript
import { PluginProxy } from "frame-master/plugin";

const proxy = new PluginProxy();
proxy.addPlugin(pluginA);
proxy.addPlugin(pluginB);

const chainedPlugin = proxy.createChainedPlugin();
```

## Best Practices

1. **Always check `__chainedContents` first** - This ensures your plugin works correctly whether it's first in the chain or not.

2. **Use `getChainableContent` helper** - It handles the fallback logic for you.

3. **Be mindful of handler order** - Plugins are chained in the order they appear in your config.

4. **Use unique filter patterns when possible** - If your plugin doesn't need to chain with others, use a specific filter to avoid unnecessary chaining overhead.

5. **Test with `--verbose`** - Use verbose logging during development to see the chaining flow.

## Migration from Pre-3.0.0

If you're upgrading from a version before 3.0.0 and your plugins relied on the previous behavior (only first handler runs), you can disable chaining:

```typescript
export default defineConfig({
  pluginsOptions: {
    disableOnLoadChaining: true,
  },
});
```

Or update your plugins to handle chained content properly using `args.__chainedContents`.
