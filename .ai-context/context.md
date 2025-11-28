# Frame-Master Context

## Project Overview

**Frame-Master** is a plugin-first meta-framework built exclusively for **Bun.js**. It provides a blank canvas runtime with no built-in opinions—no default router, renderer, or build step. All functionality (routing, SSR, API handling, etc.) is composed via plugins.

## Core Philosophy

- **Plugins Define Everything**: The core runtime only handles the HTTP server, plugin lifecycle, and build orchestration.
- **Singleton Build Pipeline**: All plugins contribute to a unified build configuration.
- **Bun-First**: Leverages `Bun.serve()`, `Bun.build()`, and Bun's native speed.

## Project Structure

### Root Directories

- **`bin/`**: CLI entry points and commands.
  - `index.ts`: Main CLI entry (`frame-master`).
  - `dev`, `start`, `init`, `create`: Command implementations.
- **`src/`**: Core runtime source code.
  - `server/`: HTTP server logic, request manager, and configuration loading.
  - `plugins/`: Plugin loader, types, and utility functions.
  - `build/`: Singleton builder implementation.
- **`docs/`**: Documentation files.
- **`templates/`**: Project templates (e.g., `frame-master-template-cloudflare-pages-react-tailwind`).

### Key Files

- **`package.json`**: Defines dependencies and scripts.
- **`frame-master.config.ts`**: The main configuration file for a Frame-Master project.
- **`README.md`**: Comprehensive documentation.

## Architecture

### 1. The Runtime (`src/server/`)

- Wraps `Bun.serve()`.
- Initializes the **Plugin Loader**.
- Manages the **Request Lifecycle**:
  - `before_request` -> `request` -> `after_request` -> `html_rewrite`.
- Merges server configurations from all plugins.

### 2. The Plugin System (`src/plugins/`)

Plugins are objects that hook into various lifecycle stages:

- **Server Lifecycle**: `serverStart` (main/dev).
- **Request Lifecycle**: `router` hooks.
- **Build System**: `buildConfig` (static or dynamic), `beforeBuild`, `afterBuild`.
- **Runtime Plugins**: Modify Bun's module loader (e.g., importing `.svg` as JSX).
- **File Watching**: `onFileSystemChange`.
- **WebSockets**: `onOpen`, `onMessage`, `onClose`.

### 3. The Builder (`src/build/`)

- A singleton instance that aggregates build configurations from all active plugins.
- Supports both static and dynamic configuration merging.
- Generates build reports and analysis.

## Development Workflow

### CLI Commands

- **`bun frame-master dev`**: Starts the development server with hot reloading and file watching.
- **`bun frame-master start`**: Starts the production server.
- **`bun frame-master init`**: Initializes Frame-Master in the current directory.
- **`bun frame-master create <name>`**: Creates a new project from a template.
- **`bun frame-master build`**: Triggers the build process.

### Configuration (`frame-master.config.ts`)

```typescript
import type { FrameMasterConfig } from "frame-master/server/types";

const config: FrameMasterConfig = {
  HTTPServer: {
    port: 3000,
  },
  plugins: [
    // Plugins go here
  ],
};

export default config;
```

## Tech Stack

- **Runtime**: Bun.js
- **Language**: TypeScript
- **CLI**: Commander.js
- **Frontend**: Framework-agnostic (React supported via plugins).

## Important Notes for AI Agent

- When modifying the core, ensure backward compatibility for plugins.
- The build system is central; changes there affect how plugins interact.
- `request-manager.ts` is the heart of request handling.
- Always check `src/plugins/types.ts` for the latest plugin API definitions.
