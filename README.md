# 🚀 Frame-Master

> **Build your perfect full-stack framework, one plugin at a time.**  
> **⚡ Powered exclusively by Bun.js**

Frame-Master isn't just another web framework—it's a **framework maker** built specifically for the Bun.js runtime. Choose your frontend, pick your backend, add your features. Create the exact full-stack development experience you want with Bun's lightning-fast performance.

## ⚡ Why Frame-Master?

**Tired of framework lock-in?** Frustrated by "almost perfect" solutions? Frame-Master gives you the power to compose your ideal development stack through configuration.

```typescript
// Want React + PostgreSQL?
// frame-master.config.ts
import type { FrameMasterConfig } from "frame-master/server/type";
import { reactPlugin } from "frame-master/plugin/react";
import { postgresPlugin } from "frame-master/plugins/postgres";

const config: FrameMasterConfig = {
  HTTPServer: { port: 3000 },
  DevServer: { port: 3001 },
  plugins: [reactPlugin(), postgresPlugin()],
};

export default config;
```

```typescript
// Prefer Vue + SQLite? Just swap plugins!
// frame-master.config.ts
import type { FrameMasterConfig } from "frame-master/server/type";
import { vuePlugin } from "frame-master/plugins/vue";
import { sqlitePlugin } from "frame-master/plugins/sqlite";

const config: FrameMasterConfig = {
  HTTPServer: { port: 3000 },
  DevServer: { port: 3001 },
  plugins: [vuePlugin(), sqlitePlugin()],
};

export default config;
```

## 🎯 Core Philosophy

### 🔧 **Framework Agnostic**

- React, Vue, Svelte, Vanilla JS—your choice
- Built exclusively for Bun.js runtime
- Any database: PostgreSQL, MongoDB, SQLite

### 🔌 **Plugin Everything**

- Authentication? There's a plugin for that
- File uploads? Plugin
- Real-time features? Plugin
- Custom business logic? Build a plugin

### 🌐 **Community Driven**

- Share your plugin combinations
- Contribute to the ecosystem
- Build once, use everywhere

## 📦 Quick Start

### Installation

```bash
bun add frame-master
```

### Initialize Your Project

```bash
bun frame-master init
# This creates frame-master.config.ts and .frame-master/ directory
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
┌─────────────────────────────────────┐
│          Your Application          │
├─────────────────────────────────────┤
│              Plugins                │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐│
│  │ React   │ │  Auth   │ │Database ││
│  │ Plugin  │ │ Plugin  │ │ Plugin  ││
│  └─────────┘ └─────────┘ └─────────┘│
├─────────────────────────────────────┤
│         Frame-Master Core           │
│   • Plugin System                  │
│   • HTTP/Dev Server                │
│   • Runtime Loader                 │
│   • Build Pipeline                 │
└─────────────────────────────────────┘
```

## 🔌 Plugin System

Frame-Master's power comes from its extensible plugin architecture. Plugins handle everything from frontend frameworks to databases to authentication.

### Creating Custom Plugins

```typescript
// my-custom-plugin.ts
import type { FrameMasterPlugin } from "frame-master/plugin/types";

export function myCustomPlugin(options = {}): FrameMasterPlugin {
  return {
    name: "my-custom-plugin",

    // Server lifecycle hooks
    serverStart: {
      // Runs on main thread when server starts
      main: async () => {
        console.log("Plugin initialized on main thread");
      },

      // Runs only in development mode
      dev_main: async () => {
        console.log("Plugin initialized in dev mode");
      },
    },

    // Router hooks
    router: {
      // Before request processing
      before_request: async (master) => {
        // Initialize context or inject global values
        master.setContext({ customData: "value" });
        master.InjectGlobalValues({ __MY_GLOBAL__: "data" });
      },

      // Intercept and modify requests
      request: async (master) => {
        // Access and modify request
        console.log("Request:", master.request.url);

        // Optionally bypass with custom response
        master
          .setResponse("new response body", {
            header: { "x-header": "custom header" },
          })
          .sendNow();
      },

      // After request processing
      after_request: async (master) => {
        // Modify response headers
        const response = master.response;
        if (response) {
          response.headers.set("X-Custom", "Header");
        }

        // Or return a new response to override
        // return new Response("Override", { status: 200 });
      },

      // HTML rewriting
      html_rewrite: {
        initContext: (req) => {
          return { someData: "value" };
        },

        rewrite: async (reWriter, master, context) => {
          // Use HTMLRewriter to modify HTML
          reWriter.on("div", {
            element(element) {
              element.setAttribute("data-custom", "true");
            },
          });
        },

        after: async (HTML, master, context) => {
          // Final HTML processing
          console.log("HTML processed");
        },
      },
    },

    // File system change detection (dev mode only)
    onFileSystemChange: async (filePath, preventBuild) => {
      console.log("File changed:", filePath);
      // Optionally prevent rebuild
      // if (shouldSkip) preventBuild();
    },

    // Plugin priority (lower number = higher priority)
    priority: 0,

    // Plugin requirements
    requirement: {
      frameMasterPlugins: {
        "some-required-plugin": "^1.0.0",
      },
      frameMasterVersion: "^1.0.0",
      bunVersion: ">=1.2.0",
    },

    // Custom directives
    directives: [
      {
        name: "use-my-directive",
        regex:
          /^(?:\s*(?:\/\/.*?\n|\s)*)?['"]use[-\s]my-directive['"];?\s*(?:\/\/.*)?(?:\r?\n|$)/m,
      },
    ],

    // Runtime plugins for bunfig.toml
    runtimePlugins: [
      // Bun.BunPlugin instances
    ],
  };
}
```

Then use it in your configuration:

```typescript
// frame-master.config.ts
import type { FrameMasterConfig } from "frame-master/server/type";
import { myCustomPlugin } from "./plugins/my-custom-plugin";

const config: FrameMasterConfig = {
  HTTPServer: { port: 3000 },
  plugins: [
    myCustomPlugin({
      // plugin options
    }),
  ],
};

export default config;
```

## 🎨 Example Configurations

### Full-Stack React App

```typescript
// frame-master.config.ts
import type { FrameMasterConfig } from "frame-master/server/type";
import reactPlugin from "frame-master-plugin-react-ssr/plugin";

const config: FrameMasterConfig = {
  HTTPServer: { port: 3000 },
  plugins: [
    reactPlugin({
      // React-specific options
    }),
  ],
};

export default config;
```

### Multi-Plugin Setup

```typescript
// frame-master.config.ts
import type { FrameMasterConfig } from "frame-master/server/type";
import { reactPlugin } from "frame-master/plugin/react";
import { authPlugin } from "./plugins/auth-plugin";
import { databasePlugin } from "./plugins/database-plugin";

const config: FrameMasterConfig = {
  HTTPServer: { port: 3000 },
  plugins: [
    reactPlugin({}),
    authPlugin({
      providers: ["google", "github"],
    }),
    databasePlugin({
      type: "postgresql",
      connection: process.env.DATABASE_URL,
    }),
  ],
};

export default config;
```

### Custom Development Setup

```typescript
// frame-master.config.ts
import type { FrameMasterConfig } from "frame-master/server/type";
import { myFrameworkPlugin } from "./plugins/my-framework";

const config: FrameMasterConfig = {
  HTTPServer: {
    port: parseInt(process.env.PORT || "3000"),
    host: "0.0.0.0",
  },
  plugins: [
    myFrameworkPlugin({
      // Your custom configuration
    }),
  ],
};

export default config;
```

## 🌟 What Makes Frame-Master Unique?

### 🎯 **True Flexibility**

Unlike other frameworks that give you "configuration options," Frame-Master gives you **architectural freedom**. Don't like how Next.js handles routing? Use a different plugin. Need custom build logic? Write a plugin.

### 🔄 **Migration Made Easy**

Outgrown your current stack? With Frame-Master, you can:

- Swap frontend frameworks by changing plugins
- Add new features without framework constraints
- Migrate gradually by replacing plugins one at a time

### 🚀 **Performance by Design**

- Only load what you need
- Plugin-level optimization
- Built specifically for Bun.js runtime
- Hot reload during development

### 👥 **Community First**

- Share your plugin combinations
- Contribute to the ecosystem
- Learn from others' solutions
- Build reusable components

## �️ Development Commands

```bash
# Initialize a new Frame-Master project
bun frame-master init

# Start development server
bun frame-master dev

# start production server
bun frame-master start

# Get help
bun frame-master --help
```

## 📁 Project Structure

After running `bun frame-master init`, your project will have:

```
my-project/
├── frame-master.config.ts    # Main configuration
├── .frame-master/           # Frame-Master internals
    ├── build/              # Build utilities
    ├── server.ts           # Server setup
    ├── preload.ts          # Runtime preloader
    └── frame-master-custom-type.d.ts
```

## 📚 Available Exports

Frame-Master provides several entry points for different use cases:

```typescript
// Plugin development
import type { FrameMasterPlugin } from "frame-master/plugin/types";
import { utils } from "frame-master/plugin";

// Server configuration
import type { FrameMasterConfig } from "frame-master/server/type";
```

## 🤝 Contributing

We love contributions! Whether it's:

- 🐛 Bug reports
- 💡 Feature requests
- 🔌 New plugins
- 📖 Documentation improvements
- 🎨 Example projects

Check out our [Contributing Guide](CONTRIBUTING.md) to get started.

## 🎉 Community

- **GitHub Discussions**: Share your plugin combinations
- **Issues**: Report bugs and request features
- **Examples**: Check out community-built configurations

## 📄 License

MIT © [shpaw415](https://github.com/shpaw415)

---

<div align="center">

**Stop settling for "almost perfect" frameworks.**  
**Build the perfect one for your needs.**

[Get Started](#-quick-start) • [Plugin System](#-plugin-system) • [Examples](#-example-configurations)

</div>
