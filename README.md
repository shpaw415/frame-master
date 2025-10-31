# 🚀 Frame-Master

> **The plugin-first meta-framework for Bun.js**  
> **Build your stack, your way. No opinions, just possibilities.**

Frame-Master is **not a web framework**—it's a **plugin orchestration runtime** for Bun.js. There are no built-in routers, renderers, or build steps. Instead, **plugins define everything**: how requests are handled, how files are built, which frontend framework to use, and what features exist.

**Think of it as:** Express.js middleware philosophy + Webpack plugin system + Bun's speed = Frame-Master

## ⚡ Why Frame-Master?

**Tired of framework lock-in?** Frame-Master gives you **absolute freedom** through plugins. Use existing plugins or build your own framework.

```typescript
// Use React SSR plugin - or write your own!
import type { FrameMasterConfig } from "frame-master/server/type";
import reactSSRPlugin from "frame-master-plugin-react-ssr/plugin";

const config: FrameMasterConfig = {
  HTTPServer: { port: 3000 },
  plugins: [reactSSRPlugin()], // Defines routing, SSR, building
};

export default config;
```

**The key:** Frame-Master provides **infrastructure** (HTTP server, plugin lifecycle, build orchestration). Plugins provide **behavior** (routing, rendering, features).

## 🎯 Core Philosophy

### 🔌 **Plugins Define Everything**

Frame-Master has **zero built-in behavior**:

- No routing, renderer, or build step by default
- No conventions unless plugins create them
- Want a feature? Add or write a plugin

### 🏗️ **Singleton Build Pipeline**

All plugins contribute to **one unified build**:

```typescript
// Plugin A: buildConfig: { external: ["react"] }
// Plugin B: buildConfig: { plugins: [myBunPlugin()] }
// Result: ONE build with merged configs
builder.build("/src/client.ts");
```

### 🎨 **Framework Agnostic**

Frame-Master doesn't care about React, Vue, or Svelte. **Plugins decide everything.**

### 🌐 **Community Driven**

Browse plugins at [frame-master.com](https://frame-master.com) - official and community solutions.

## 📦 Quick Start

### Installation

```bash
bun add -g frame-master
```

### Create a New Project

```bash
# Create a new project with the create command
bunx frame-master create my-app

# Or initialize Frame-Master in an existing project
bunx frame-master init
```

### Configure Your Framework

```typescript
// frame-master.config.ts (created by init command)
import type { FrameMasterConfig } from "frame-master/server/type";

const config: FrameMasterConfig = {
  HTTPServer: {
    port: 3000,
  },
  plugins: [
    // Add your plugins here
  ],
};

export default config;
```

### Start Development

```bash
bun frame-master dev
# Hot reload, plugin management, and more!
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│      Your Application (plugin-defined)         │
├─────────────────────────────────────────────────┤
│             Plugin Layer                        │
│  [React SSR] [Auth] [Database] [Custom...]     │
├─────────────────────────────────────────────────┤
│      Frame-Master Core Runtime                  │
│  • HTTP Server  • Plugin Lifecycle              │
│  • Singleton Builder  • File Watcher (dev)      │
└─────────────────────────────────────────────────┘
```

**Key concepts:**

- Plugin hooks: request handling, server startup, file changes, builds
- Unified build: All plugins → one `builder` singleton
- Runtime plugins: Modify Bun's module loader (import .svg as JSX)
- No conventions: Plugins create structure

## 🔌 Plugin System

Plugins can: define routes, render HTML, build bundles, add WebSockets, modify Bun's loader, watch files, handle auth, databases, and more.

### Core Plugin Structure

```typescript
import type { FrameMasterPlugin } from "frame-master/plugin/types";

export function myPlugin(): FrameMasterPlugin {
  return {
    name: "my-plugin",
    version: "1.0.0",

    // SERVER LIFECYCLE
    serverStart: {
      main: async () => {}, // Runs on server start
      dev_main: async () => {}, // Dev mode only
    },

    // REQUEST LIFECYCLE
    router: {
      before_request: async (master) => {
        // Initialize context, auth, logging
        master.setContext({ requestId: crypto.randomUUID() });
      },
      request: async (master) => {
        // Handle requests, define routes
        if (new URL(master.request.url).pathname === "/api/hello") {
          master.setResponse("Hello!").sendNow();
        }
      },
      after_request: async (master) => {
        // Modify headers, cleanup
      },
      html_rewrite: {
        rewrite: async (rewriter, master, ctx) => {
          // Transform HTML with HTMLRewriter
        },
      },
    },

    // BUILD SYSTEM (shared singleton)
    build: {
      buildConfig: { external: ["react"], target: "browser" }, // Static
      // OR
      buildConfig: async (builder) => ({ external: ["lib"] }), // Dynamic
      beforeBuild: async (config, builder) => {},
      afterBuild: async (config, result, builder) => {},
    },

    // RUNTIME PLUGINS (Bun module loader)
    runtimePlugins: [
      {
        name: "svg-loader",
        setup(build) {
          build.onLoad({ filter: /\.svg$/ }, async (args) => {
            // Transform .svg imports
          });
        },
      },
    ],

    // FILE WATCHING (dev mode)
    fileSystemWatchDir: ["./src"],
    onFileSystemChange: async (type, path, abs) => {},

    // WEBSOCKETS
    websocket: {
      onOpen: async (ws) => {},
      onMessage: async (ws, msg) => {},
      onClose: async (ws) => {},
    },

    // CUSTOM ROUTES
    serverConfig: {
      routes: {
        "/health": () => new Response("OK"),
      },
    },

    // METADATA
    priority: 0, // Lower = runs first
    requirement: {
      frameMasterVersion: "^1.0.0",
      bunVersion: ">=1.2.0",
    },
  };
}
```

### Singleton Builder Pattern

**One builder, shared by all plugins:**

```typescript
import { builder } from "frame-master/build";

// Static config (merged on import)
build: {
  buildConfig: {
    external: ["my-lib"],
  }
}

// Dynamic config (called during builder.build())
build: {
  buildConfig: async (builder) => ({
    external: ["my-lib"],
    plugins: [customBunPlugin()],
  });
}

// Trigger a build (includes all plugin configs)
await builder.build("/src/client.ts");
```

**Merging:** Static configs merge on import → Dynamic configs merge on `build()` → All merged for `Bun.build()`

**Example:**

```typescript
// Plugin A: { external: ["react"] }
// Plugin B: { external: ["lodash"], minify: true }
// Result: { external: ["react", "lodash"], minify: true }
```

### Runtime vs Build Plugins

**Two separate systems:**

| Runtime Plugins                 | Build Plugins               |
| ------------------------------- | --------------------------- |
| Modify Bun's module loader      | Bundle code for browser     |
| Transform imports at runtime    | Run during `Bun.build()`    |
| Example: `.svg` → JSX component | Example: Minify, tree-shake |

```typescript
// Runtime: Transform .txt files into modules
runtimePlugins: [
  {
    name: "txt-loader",
    setup(build) {
      build.onLoad({ filter: /\.txt$/ }, async (args) => ({
        contents: `export default ${JSON.stringify(
          await Bun.file(args.path).text()
        )}`,
        loader: "js",
      }));
    },
  },
];

// Build: Bundle for browser
build: {
  buildConfig: {
    plugins: [
      {
        name: "browser-plugin",
        setup(build) {
          build.onLoad({ filter: /\.browser\.ts$/ }, async (args) => {
            // Transform for browser
          });
        },
      },
    ];
  }
}
```

## 🎨 Example Use Cases

### React SSR App

```typescript
import reactSSRPlugin from "frame-master-plugin-react-ssr/plugin";

export default {
  HTTPServer: { port: 3000 },
  plugins: [reactSSRPlugin()], // Handles routing, SSR, bundling, HMR
};
```

### Custom API Server

```typescript
// plugins/api.ts
export function apiPlugin(routes): FrameMasterPlugin {
  return {
    name: "api",
    router: {
      request: async (master) => {
        const url = new URL(master.request.url);
        if (url.pathname.startsWith("/api/")) {
          const data = await handlers[routes[url.pathname]]();
          master
            .setResponse(JSON.stringify(data), {
              headers: { "Content-Type": "application/json" },
            })
            .sendNow();
        }
      },
    },
  };
}

// frame-master.config.ts
export default {
  HTTPServer: { port: 3000 },
  plugins: [
    dbPlugin({ connection: process.env.DATABASE_URL }),
    apiPlugin({ "/api/users": "getUsers", "/api/posts": "getPosts" }),
  ],
};
```

### Static Site Generator

```typescript
export function ssgPlugin(options): FrameMasterPlugin {
  return {
    name: "ssg",
    serverStart: {
      main: async () => {
        for (const page of options.pages) {
          await Bun.write(
            `${options.outputDir}/${page}.html`,
            await generateHTML(page)
          );
        }
      },
    },
    router: {
      request: async (master) => {
        const file = Bun.file(
          `${options.outputDir}${new URL(master.request.url).pathname}.html`
        );
        if (await file.exists()) {
          master.setResponse(await file.text()).sendNow();
        }
      },
    },
  };
}
```

## 🌟 What Makes Frame-Master Different?

### 🎯 Zero Built-in Behavior

Most frameworks have opinions (Next.js: file routing, Remix: loaders). **Frame-Master has nothing** - it's a blank canvas. Add plugins for routing, SSR, or any feature you need.

### 🔄 Plugin Composability

Plugins compose through the singleton builder and lifecycle hooks. Order matters (priority system).

### 🚀 Bun-First Architecture

Built exclusively for Bun.js: `Bun.build()`, `Bun.serve()`, Bun plugins, Bun's speed.

### �️ **Build Your Own Framework**

Frame-Master is for:

- **Framework authors** building custom frameworks
- **Advanced developers** needing full control
- **Companies** with unique requirements

**Not for:** Quick starts, "batteries included" needs, or projects fitting Next.js/Remix.

```bash
# Create a new Frame-Master project
bun frame-master create my-app

# Initialize Frame-Master in existing project
bun frame-master init

# Start development server
bun frame-master dev

# Start production server
bun frame-master start

# Get help
bun frame-master --help
```

## 📁 Project Structure

Frame-Master enforces **no structure**. Plugins define conventions:

```
my-project/
├── frame-master.config.ts    # Plugin configuration
├── .frame-master/             # Optional plugin files
└── src/                       # Whatever your plugins expect
```

Example: `frame-master-plugin-react-ssr` expects `src/pages/` for routing. Your custom plugin might use `routes/` instead.

## 📚 Available Exports

```typescript
// Plugin development
import type { FrameMasterPlugin } from "frame-master/plugin/types";
import { utils } from "frame-master/plugin/utils";

// Configuration
import type { FrameMasterConfig } from "frame-master/server/type";

// Build system
import { builder, Builder, defineBuildConfig } from "frame-master/build";
```

## 🔧 Builder API

### Basic Operations

```typescript
import { builder, Builder, defineBuildConfig } from "frame-master/build";

// Build
await builder.build("/src/client.ts");

// Access outputs
builder.outputs?.forEach((a) => console.log(a.path, a.size));

// Get merged config
const config = builder.getConfig();
```

### Analysis & Reports

```typescript
// Analyze
const analysis = builder.analyzeBuild();
console.log("Total:", analysis.totalSize, "bytes");
console.log("Largest:", analysis.largestFiles);

// Reports
console.log(builder.generateReport("text")); // Human
const json = builder.generateReport("json"); // Machine

// History
const avg =
  builder.getBuildHistory().reduce((s, b) => s + b.duration, 0) /
  builder.getBuildHistory().length;
```

### Helpers

```typescript
// Type-safe config
const config = defineBuildConfig({
  target: "browser",
  external: ["react"],
});

// Regex filter for Bun plugins
const filter = Builder.pluginRegexMake({
  path: ["src", "components"],
  ext: ["tsx", "ts"],
});

// Stub server-only code
Builder.returnEmptyFile("tsx", { serverFn: null });
```

### Example: Plugin with Analysis

```typescript
export function advancedPlugin(): FrameMasterPlugin {
  return {
    name: "advanced-plugin",
    build: {
      buildConfig: defineBuildConfig({
        external: ["react"],
        minify: process.env.NODE_ENV === "production",
      }),
      afterBuild: async (config, result, builder) => {
        if (!result.success) return;

        const analysis = builder.analyzeBuild();
        if (analysis.totalSize > 1_000_000) {
          console.warn(
            `⚠️ Bundle: ${(analysis.totalSize / 1_000_000).toFixed(2)}MB`
          );
        }

        // Save report
        await Bun.write(
          ".frame-master/report.json",
          builder.generateReport("json")
        );
      },
    },
  };
}
```

## 🤝 Contributing

Contributions welcome: 🐛 bugs, 💡 features, 🔌 plugins, 📖 docs, 🎨 examples.

See [Contributing Guide](CONTRIBUTING.md).

## 📄 License

MIT © [shpaw415](https://github.com/shpaw415)
