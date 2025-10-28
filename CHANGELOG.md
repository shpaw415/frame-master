# Frame-Master v1.1.0 - Recent Additions

## Security Headers Plugin

### Overview

Built-in security headers plugin that automatically adds essential HTTP security headers to protect your application from common web vulnerabilities.

### Quick Start

```typescript
import type { FrameMasterConfig } from "frame-master/server/types";
import securityHeaders from "frame-master/plugin/security-headers";

const config: FrameMasterConfig = {
  HTTPServer: { port: 3000 },
  plugins: [
    securityHeaders(), // Default: moderate preset
  ],
};

export default config;
```

### Features

- ✅ **MIME Type Sniffing Protection** - Prevents content type confusion attacks
- ✅ **Clickjacking Protection** - Blocks iframe embedding
- ✅ **XSS Protection** - Browser-level XSS filtering
- ✅ **Content Security Policy** - Controls resource loading
- ✅ **HSTS** - Forces HTTPS connections
- ✅ **Referrer Policy** - Controls referrer information
- ✅ **Permissions Policy** - Restricts browser features

### Presets

#### Strict (Production)

```typescript
securityHeaders({ preset: "strict" });
```

- Most secure, minimal permissions
- No inline scripts (except necessary for React styles)
- Best for production environments

#### Moderate (Default)

```typescript
securityHeaders({ preset: "moderate" });
```

- Balanced security and compatibility
- Allows inline scripts and eval
- Good for most applications

#### Relaxed (Development)

```typescript
securityHeaders({ preset: "relaxed" });
```

- Permissive policies
- Use only for local development

### Documentation

- Full docs: `docs/security-headers.md`
- Export: `frame-master/plugin/security-headers`

---

## Enhanced CLI Commands

### New Plugin Management Commands

#### List Plugins

```bash
frame-master plugin list
frame-master plugin list --verbose
```

Shows all installed plugins with optional detailed information.

#### Plugin Info

```bash
frame-master plugin info <plugin-name>
```

Displays comprehensive information about a specific plugin:

- Version and priority
- Features (hooks, lifecycle, websocket)
- Requirements and dependencies
- Directives

#### Validate Configuration

```bash
frame-master plugin validate
```

Validates your Frame-Master configuration:

- Checks for duplicate plugins
- Verifies version compatibility
- Validates plugin dependencies
- Detects priority conflicts

#### Create Plugin Template

```bash
frame-master plugin create my-plugin
frame-master plugin create my-plugin --dir ./plugins
```

Generates a complete plugin template with:

- `index.ts` - Implementation with all hooks
- `package.json` - Package configuration
- `README.md` - Documentation template

### Examples

**List all plugins with details:**

```bash
$ frame-master plugin list -v

📦 Installed Plugins:

1. frame-master-plugin-react-ssr v1.0.0
   Priority: 10
   Features: before_request, request, html_rewrite
   Has requirements

2. frame-master-security-headers v1.0.0
   Priority: 1000
   Features: after_request

Total: 2 plugins
```

**Validate configuration:**

```bash
$ frame-master plugin validate

🔍 Validating configuration...

✗ my-plugin: requires Frame-Master ^2.0.0, but 1.1.0 is installed
⚠ some-plugin: missing version field (recommended)

Found 1 error
Found 1 warning
```

**Get plugin info:**

```bash
$ frame-master plugin info frame-master-security-headers

📋 Plugin Information:

Name: frame-master-security-headers
Version: 1.0.0
Priority: 1000

Features:
  Router:
    ✓ after_request
```

### Documentation

- Full CLI docs: `docs/cli.md`

---

## What's Changed

### Added

- **Security Headers Plugin** - Built-in security headers with configurable presets
- **Plugin CLI Commands** - Comprehensive plugin management via CLI
  - `plugin list` - List installed plugins
  - `plugin info` - Show plugin details
  - `plugin validate` - Validate configuration
  - `plugin create` - Generate plugin templates

### Improved

- Plugin system exports now include `securityHeaders`
- Better error messages in plugin loader
- Enhanced type safety in CLI commands

### Documentation

- `docs/security-headers.md` - Complete security headers guide
- `docs/cli.md` - Comprehensive CLI reference
- Test coverage for security headers plugin

---

## Usage Examples

### Production-Ready Security

```typescript
import type { FrameMasterConfig } from "frame-master/server/types";
import reactSSR from "frame-master-plugin-react-ssr/plugin";
import securityHeaders from "frame-master/plugin/security-headers";

const config: FrameMasterConfig = {
  HTTPServer: {
    port: 3000,
    hostname: "0.0.0.0",
  },
  plugins: [
    reactSSR({
      pagesDir: "./src/pages",
    }),
    securityHeaders({
      preset: process.env.NODE_ENV === "production" ? "strict" : "moderate",
      hsts: {
        enabled: true,
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }),
  ],
};

export default config;
```

### Custom CSP Configuration

```typescript
securityHeaders({
  preset: "custom",
  contentSecurityPolicy: {
    enabled: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "https://cdn.example.com"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "https:"],
      "connect-src": ["'self'", "wss:", "https://api.example.com"],
    },
  },
});
```

### Development Workflow

```bash
# Validate your configuration
frame-master plugin validate

# List all plugins
frame-master plugin list -v

# Start development server
frame-master dev

# Check security headers
curl -I http://localhost:3000
```

---

## Migration Guide

### From Previous Versions

No breaking changes! Simply update to v1.1.0:

```bash
bun add frame-master@latest
```

### Adding Security Headers

Add to your existing config:

```typescript
import securityHeaders from "frame-master/plugin/security-headers";

const config: FrameMasterConfig = {
  HTTPServer: { port: 3000 },
  plugins: [
    // ... your existing plugins
    securityHeaders(), // Add security headers
  ],
};
```

---

## Testing

Run the security headers test suite:

```bash
bun test test/security-headers.test.ts
```

Tests cover:

- All security header presets (strict, moderate, relaxed)
- Custom header configuration
- Enabled/disabled states
- Header override behavior

---

## Next Steps

1. **Add security headers to your project:**

   ```bash
   # Update your frame-master.config.ts
   # Add: securityHeaders({ preset: "moderate" })
   ```

2. **Validate your plugin setup:**

   ```bash
   frame-master plugin validate
   ```

3. **Create custom plugins:**

   ```bash
   frame-master plugin create my-feature
   ```

4. **Check documentation:**
   - Security: `docs/security-headers.md`
   - CLI: `docs/cli.md`

---

## Feedback & Contributions

- Report issues: [GitHub Issues](https://github.com/shpaw415/frame-master/issues)
- Contribute: [Pull Requests](https://github.com/shpaw415/frame-master/pulls)
- Docs: [Documentation Site](https://your-docs-site.com)

---

**Version:** 1.1.0  
**License:** MIT  
**Runtime:** Bun.js >=1.2.0
