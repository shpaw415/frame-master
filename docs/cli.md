# Frame-Master CLI Documentation

Command-line interface for managing Frame-Master projects and plugins.

## Installation

```bash
bun add -g frame-master
```

## Commands Overview

### Project Management

#### `frame-master init`

Initialize Frame-Master in the current project.

```bash
frame-master init
```

Creates:

- `frame-master.config.ts` - Main configuration file
- `.frame-master/` - Build directory
- `bunfig.toml` - Bun configuration

#### `frame-master create <name>`

Create a new Frame-Master project.

```bash
frame-master create my-app
frame-master create my-app --type minimal
```

**Options:**

- `-t, --type <type>` - Project type (default: `minimal`)

**Available Types:**

- `minimal` - Minimal project setup

#### `frame-master dev`

Start the development server.

```bash
frame-master dev
```

Features:

- Hot Module Replacement (HMR)
- File watching
- Development-only plugin hooks
- Detailed error pages

#### `frame-master start`

Start the production server.

```bash
frame-master start
```

Features:

- Optimized for performance
- Production-only plugin hooks
- Minimal logging

### Plugin Management

#### `frame-master plugin list`

List all installed plugins.

```bash
frame-master plugin list
frame-master plugin list --verbose
```

**Options:**

- `-v, --verbose` - Show detailed plugin information

**Example Output:**

```
📦 Installed Plugins:

1. frame-master-plugin-react-ssr v1.0.0
2. frame-master-security-headers v1.0.0
3. frame-master-plugin-session v1.0.0

Total: 3 plugins
```

#### `frame-master plugin info <plugin-name>`

Show detailed information about a specific plugin.

```bash
frame-master plugin info frame-master-plugin-react-ssr
```

**Shows:**

- Plugin name and version
- Priority
- Features (router hooks, server lifecycle, etc.)
- Requirements (Frame-Master version, Bun version, dependencies)
- Directives
- WebSocket handlers

**Example Output:**

```
📋 Plugin Information:

Name: frame-master-plugin-react-ssr
Version: 1.0.0
Priority: 10

Features:
  Router:
    ✓ before_request
    ✓ request
    ✓ html_rewrite
  Server Lifecycle:
    ✓ main
    ✓ dev_main
  File System:
    ✓ Watching 2 directories

Requirements:
  Frame-Master: ^1.0.0
  Bun: >=1.2.0
  Required Plugins:
    - some-plugin: ^1.0.0

Directives:
  - use-client
  - use-server
```

#### `frame-master plugin validate`

Validate plugin configuration and requirements.

```bash
frame-master plugin validate
```

**Checks:**

- Duplicate plugin names
- Frame-Master version compatibility
- Bun version compatibility
- Required plugin dependencies
- Plugin version fields
- Priority conflicts

**Example Output:**

```
🔍 Validating configuration...

✓ Configuration is valid!
```

Or if issues are found:

```
🔍 Validating configuration...

✗ my-plugin: requires Frame-Master ^2.0.0, but 1.1.0 is installed
✗ another-plugin: requires plugin "missing-plugin" which is not installed
⚠ some-plugin: missing version field (recommended)
⚠ Multiple plugins share the same priority: plugin-a (10), plugin-b (10)

Found 2 errors
Found 2 warnings
```

#### `frame-master plugin create <name>`

Create a new plugin template.

```bash
frame-master plugin create my-custom-plugin
frame-master plugin create my-plugin --dir ./plugins
```

**Options:**

- `-d, --dir <directory>` - Output directory (default: `./`)

**Creates:**

- `index.ts` - Plugin implementation with all hooks
- `package.json` - Package configuration
- `README.md` - Plugin documentation

**Generated Structure:**

```
my-custom-plugin/
├── index.ts
├── package.json
└── README.md
```

## Common Workflows

### Starting a New Project

```bash
# Create project
frame-master create my-app

# Navigate to project
cd my-app

# Install dependencies
bun install

# Start development server
frame-master dev
```

### Managing Plugins

```bash
# List all plugins
frame-master plugin list -v

# Check specific plugin info
frame-master plugin info frame-master-plugin-react-ssr

# Validate configuration
frame-master plugin validate

# Create custom plugin
frame-master plugin create my-feature
cd my-feature
# Edit index.ts to implement your plugin
```

### Production Deployment

```bash
# Validate configuration first
frame-master plugin validate

# Start production server
NODE_ENV=production frame-master start
```

## Environment Variables

### `NODE_ENV`

Controls the runtime environment.

- `development` - Development mode (used by `frame-master dev`)
- `production` - Production mode (used by `frame-master start`)

```bash
NODE_ENV=production frame-master start
```

### `PUBLIC_*`

Any environment variable prefixed with `PUBLIC_` will be available client-side.

```bash
PUBLIC_API_URL=https://api.example.com frame-master dev
```

Access in client code:

```typescript
console.log(process.env.PUBLIC_API_URL);
```

## Configuration File

The `frame-master.config.ts` file is the main configuration:

```typescript
import type { FrameMasterConfig } from "frame-master/server/types";
import reactSSR from "frame-master-plugin-react-ssr/plugin";
import securityHeaders from "frame-master/plugin/security-headers";

const config: FrameMasterConfig = {
  HTTPServer: {
    port: 3000,
    hostname: "localhost",
  },
  plugins: [
    reactSSR({
      pagesDir: "./src/pages",
    }),
    securityHeaders({
      preset: "strict",
    }),
  ],
};

export default config;
```

## Troubleshooting

### Plugin Not Found

```bash
frame-master plugin info nonexistent-plugin
# Error: Plugin "nonexistent-plugin" not found
# Use 'frame-master plugin list' to see installed plugins
```

**Solution:** Check installed plugins with `frame-master plugin list`

### Validation Errors

```bash
frame-master plugin validate
# Error: my-plugin: requires Bun >=2.0.0, but 1.2.0 is installed
```

**Solution:** Update Bun or adjust plugin requirements

### Port Already in Use

```bash
frame-master dev
# Error: EADDRINUSE: address already in use
```

**Solution:** Change port in `frame-master.config.ts` or kill the process using the port

```bash
# Find process using port 3000
lsof -i :3000
# Kill process
kill -9 <PID>
```

## Help

Get help for any command:

```bash
frame-master --help
frame-master plugin --help
frame-master plugin create --help
```

## Version

Check Frame-Master version:

```bash
frame-master --version
```

## License

MIT
