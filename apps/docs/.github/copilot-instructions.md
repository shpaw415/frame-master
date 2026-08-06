# cloudflare-nextjs

Orientation guide for AI coding agents working on this project.

## Project Overview

A React application deployed to **Cloudflare Pages**, orchestrated by the [Frame Master](https://github.com/shpaw415/frame-master) metaframework.

The goal of this template is to bring a **Next.js-like developer experience to Cloudflare Pages** — filesystem routing, nested layouts, server-side rendering, server actions, and client-accessible environment variables — while staying on the Cloudflare edge runtime. More Next.js-equivalent features will be added over time.

This template extends the base `cloudflare-base` template with two additional capabilities:

1. **Dynamic server-side rendering** for individual pages via [`frame-master-plugin-cloudflare-pages-dynamic-ssr`](https://github.com/shpaw415/frame-master-plugin-cloudflare-pages-dynamic-ssr) — pages marked with `"use dynamic"` are rendered server-side by a Cloudflare Pages Function, cached in KV or the Cache API, and hydrated on the client.
2. **Type-safe server actions** via [`frame-master-plugin-cloudflare-pages-functions-action`](https://github.com/shpaw415/frame-master-plugin-cloudflare-pages-functions-action) — server-side functions in `src/actions/` that are compiled into Cloudflare Pages Functions and callable from the client as regular async functions with full TypeScript type-safety.

**Stack:**
- **Runtime / package manager:** Bun 1.3+
- **UI:** React 19
- **Styling:** Tailwind CSS 4
- **Deployment target:** Cloudflare Pages
- **Language:** TypeScript (strict mode)

The framework is plugin-based. All build behavior — SSR, hydration, Tailwind compilation, image optimization, SEO, sitemap, server actions, dynamic SSR — is driven by plugins registered in `frame-master.config.ts`.

---

## Key Commands

```bash
# Copy .env.exemple to .env and set WRANGLER_PORT (default: 8787) before running dev.
bun dev              # Start Frame Master dev server (http://localhost:3000) — proxies to Wrangler
bun run build        # Production build → .frame-master/build
bun run build:dev    # Dev-mode build  → .frame-master/build
bun frame-master init  # First-time initialization (run once after clone)
```

> **Dev requires Wrangler running in a separate terminal:**
> ```bash
> bunx wrangler pages dev .frame-master/build --port 8787
> ```
> Frame Master's dev server proxies all requests to Wrangler so Cloudflare bindings (KV, D1, R2, etc.) and Pages Functions are available during development. The port must match `WRANGLER_PORT` in `.env`.

---

## Filesystem Routing

Pages live in `src/pages/`. The filename/directory path maps directly to the URL route. No route registration is needed.

| File | URL |
|---|---|
| `src/pages/index.tsx` | `/` |
| `src/pages/about.tsx` | `/about` |
| `src/pages/sub/index.tsx` | `/sub` |
| `src/pages/sub/settings.tsx` | `/sub/settings` |

**Rules:**
- Every page file must `export default` a React component.
- New page files are auto-detected — no changes to `frame-master.config.ts` required.
- **Adding a new route during dev requires a manual restart of `bun dev`** to make it navigable. The file watcher handles code changes to existing routes, not new route discovery.
- `bun run build` always picks up all routes automatically.

---

## Layouts

Place a `layout.tsx` file in a page directory to wrap its pages with a shared UI shell (nav, footer, etc.).

```
src/pages/layout.tsx          ← root layout (outermost wrapper)
  src/pages/index.tsx         ← rendered inside root layout
  src/pages/sub/layout.tsx    ← rendered inside root layout
    src/pages/sub/index.tsx   ← rendered inside both layouts (nested)
```

- The **root layout** (`src/pages/layout.tsx`) wraps all its sibling pages and all sub-directories.
- A **sub-directory layout** wraps its own pages, but the parent layout **still wraps it** — layouts nest, they do not replace each other.
- `layout.tsx` must accept and render `children`:

```tsx
export default function Layout({ children }: { children: React.JSX.Element }) {
  return <div>{children}</div>;
}
```

---

## Core Files & Responsibilities

| File | Purpose |
|---|---|
| `src/shell.tsx` | HTML document shell (`<html>`, `<head>`, `<body>`). Modify for global `<head>` changes (stylesheets, fonts, viewport). |
| `src/client-shell.tsx` | Client-side only wrapper. Contains `RouterHost` + `SSRPropsProvider` for SPA navigation and dynamic SSR hydration. **Never remove `RouterHost` or `SSRPropsProvider`** — they power client-side routing and SSR prop delivery. |
| `src/common.ts` | Shared app-wide constants (e.g. `APP_DATA.projectName`). Referenced in `shell.tsx` for the page title. |
| `src/action-utils/page-wrapper.tsx` | SSR HTML wrapper used by the dynamic SSR middleware. Combines `shell.tsx` with `NextJsStyleLayoutSetup` for nested layout support during server rendering. |
| `src/actions/_middleware.ts` | Cloudflare Pages middleware for dynamic SSR routes. Initialises the KV cache provider and the `parser.jsx` wrapper. **Required for dynamic SSR to work.** |
| `site.config.ts` | SEO metadata, Open Graph, Twitter card, sitemap base URL. **Primary file to update when customizing a new project.** |
| `frame-master.config.ts` | Plugin registration and configuration. Rarely needs changes unless adding/removing plugins or changing plugin options. |
| `wrangler.jsonc` | Cloudflare Pages deployment config. Update `name` and add/configure KV namespaces. |
| `.env` | Local env vars. Must set `WRANGLER_PORT` to the port Wrangler dev server listens on. Copy from `.env.exemple`. |

---

## TypeScript Path Aliases

Short import aliases are pre-configured in `tsconfig.json`. Always prefer these over deep relative or package paths:

| Alias | Resolves to | Example |
|---|---|---|
| `@images/*` | `images/*` | `import Logo from "@images/logo.png"` |
| `@static/*` | `static/*` | `import Icon from "@static/icon.svg"` |
| `@components/*` | `src/components/*` | `import Loading from "@components/loading"` |
| `@api/*` | `src/actions/api/*` | `import { GET } from "@api/hello"` |
| `@next/ssr` | `frame-master-plugin-cloudflare-pages-dynamic-ssr/server` | `import { createLoader } from "@next/ssr"` |
| `@next/ssr/hooks` | `frame-master-plugin-cloudflare-pages-dynamic-ssr/client/hooks` | `import { useLoader } from "@next/ssr/hooks"` |
| `@next/ssr/revalidate` | `frame-master-plugin-cloudflare-pages-dynamic-ssr/utils/revalidate` | `import { revalidate } from "@next/ssr/revalidate"` |
| `@next/action/context` | `frame-master-plugin-cloudflare-pages-functions-action/context` | `import { getContext } from "@next/action/context"` |
| `@next/client` | `frame-master-plugin-apply-react/utils` | `import { ThrowNotFound } from "@next/client"` |

---

## Plugin Overview

Plugins are registered in `frame-master.config.ts`. The following plugins are active:

| Plugin | What it does |
|---|---|
| `ReactToHtml` | SSR/SSG: renders pages to HTML using `src/shell.tsx` as the document wrapper. `srcDir` points to the pages directory. |
| `ApplyReact` (`style: "nextjs"`) | Client-side hydration and full SPA navigation. `RouterHost` in `src/client-shell.tsx` is the client router. |
| `TailwindPlugin` | Compiles `static/tailwind.css` → `static/style.css` on build/dev. |
| `imageOptimizer` | Converts originals in `images/` to WebP at configurable sizes (default: 320, 720, 1280) and writes results to `optimized/`. Sizes are set via the `sizes` array in `frame-master.config.ts`. Tracks state in `optimized/manifest.json`. |
| `SVGLoader` | Allows importing `.svg` files as React components. |
| `AssetsToBuild` | Copies `optimized/`, `static/favicon.ico`, `assets/`, and `robots.txt` into the build directory. |
| `SEOPlugin` | Injects `<meta>` tags defined in `site.config.ts` into every page's `<head>`. |
| `AutoSiteMap` | Generates `sitemap.xml` from the built HTML pages using `siteUrl` from `site.config.ts`. |
| `ServeFromBuild` | Serves `.frame-master/build` during development. |
| `EnvInHTML` | Injects build-time environment variables into the static HTML output. |
| `CFActionPlugin` (inside `buildUnifier`) | Compiles `src/actions/` into Cloudflare Pages Functions. Enables type-safe server actions callable from the client. |
| `SSRPlugin` (inside `buildUnifier`) | Scans `src/pages/` for `"use dynamic"` pages and generates Cloudflare Pages Function handlers compiled by `CFActionPlugin`. |
| `buildUnifier` | Orchestrates `CFActionPlugin` and `SSRPlugin` so their build outputs are unified into a single Cloudflare Pages Functions bundle. |
| `proxy-to-wrangler` (inline plugin) | During dev, forwards all requests from the Frame Master dev server to Wrangler so Cloudflare bindings and Functions are live. |

---

## Images

Source images go in `images/`. The `imageOptimizer` plugin processes them into `optimized/` as WebP at responsive sizes.

**Import:**
```tsx
import Logo from "@images/logo.png";
```

The `@images/*` path alias maps to `images/*` (defined in `tsconfig.json`). Types are provided by `frame-master-plugin-image-optimizer/types` (declared in `tsconfig.json` under `types`).

**Usage:**
```tsx
<img src={Logo.src(720)} alt="Logo" />
```

`Logo.src(size)` returns the URL of the **exact** variant for that size. Valid sizes are whatever is configured in the `sizes` array of `imageOptimizer` in `frame-master.config.ts` (defaults: **320**, **720**, **1280**). You can add or replace those values there. Requesting a size not present in the manifest will fail at runtime.

**Do not edit `optimized/` or `optimized/manifest.json` manually.** They are generated by the plugin.

---

## SVGs

Place SVGs in `static/`. The `SVGLoader` plugin transforms them into importable React components:

```tsx
import Icon from "@static/icon.svg";

export default function Page() {
  return <Icon className="w-6 h-6" />;
}
```

The `@static/*` alias maps to `static/*` (defined in `tsconfig.json`).

---

## Tailwind / Styling

- **Edit:** `static/tailwind.css` — add custom CSS, `@import`, or Tailwind directives here. The entry point already contains `@import "tailwindcss"`.
- **Do not edit:** `static/style.css` — this is the compiled output, automatically regenerated by `TailwindPlugin` on every build.

---

## SEO & Sitemap

All SEO configuration lives in `site.config.ts`:

```ts
export default {
  siteUrl: "https://yoursite.com",  // used by AutoSiteMap
  SEO: {
    title: "...",
    description: "...",
    keywords: [...],
    openGraph: { ... },
    twitter: { ... },
    robots: "index, follow",
    customTags: ['<meta name="..." content="...">'],
  },
} satisfies SiteConfigType;
```

Update `site.config.ts` when customizing a new project — this is the only file that needs to change for basic SEO and sitemap setup.

---

## Loading & Not-Found Pages

### File resolution (per-route override)

The `ApplyReact` plugin resolves `loading.tsx` and `404.tsx` by walking up from the current page's directory:

1. **Same directory** as the page being rendered — e.g. `src/pages/sub/loading.tsx` for `/sub/*` routes.
2. **Fallback** — `src/components/loading.tsx` and `src/components/404.tsx` are the global defaults used when no sibling file is found.

This means you can drop a `loading.tsx` or `404.tsx` next to any group of pages to override the default for just that route segment.

### Triggering the loading state

Navigating between pages (client-side SPA transitions) automatically renders the nearest `loading.tsx` while the next page loads.

### Triggering the not-found page

Call `ThrowNotFound()` inside any page component to render the nearest `404.tsx`:

```tsx
import { ThrowNotFound } from "frame-master-plugin-apply-react/utils";

export default function Page() {
  const data = getData();
  if (!data) ThrowNotFound();
  // ...
}
```

### Default components

| File | Role |
|---|---|
| `src/components/loading.tsx` | Global loading fallback |
| `src/components/404.tsx` | Global not-found fallback |

---

## Dynamic SSR Pages

Pages marked with `"use dynamic"` are rendered server-side by a Cloudflare Pages Function, cached in KV, and hydrated on the client. This is powered by [`frame-master-plugin-cloudflare-pages-dynamic-ssr`](https://github.com/shpaw415/frame-master-plugin-cloudflare-pages-dynamic-ssr).

### The `"use dynamic"` directive

Add `"use dynamic"` as the **first line** of any page file to mark it as a dynamic SSR page:

```tsx
// src/pages/users/[id].tsx
"use dynamic";
// rest of the file...
```

A dynamic page file may export three things:

| Export | Required | Description |
|---|---|---|
| `export default` | ✅ | The React component rendered server-side |
| `export const loader_<name>` | ✗ | A data loader whose result is available via `useLoader()` |
| `export const ssr_configs` | ✗ | Per-page cache configuration (TTL, etc.) |

### `createLoader` — server-side data fetching

```tsx
import {
  createLoader,
  type PluginEventContext,
} from "frame-master-plugin-cloudflare-pages-dynamic-ssr/server";

export const loader_user = createLoader({
  name: "user",          // unique name within the page file
  async callback(ctx: PluginEventContext<Env, "id", unknown>) {
    // ctx.params.id  — dynamic route param
    // ctx.env        — Cloudflare bindings (KV, D1, R2, …)
    // ctx.request    — incoming Request
    return { id: ctx.params.id, name: `User #${ctx.params.id}` };
  },
});
```

The callback **never reaches the browser**. At build time the plugin replaces the full `createLoader(...)` expression in the client bundle with a lightweight metadata stub.

### `createPageConfig` — cache TTL

```tsx
import { createPageConfig } from "frame-master-plugin-cloudflare-pages-dynamic-ssr/server";

export const ssr_configs = createPageConfig({
  callback(_ctx) {
    return { ttl: 60 }; // seconds; default is 86400 (24 h)
  },
});
```

### `useLoader` — reading loader data in components

```tsx
import { useLoader } from "frame-master-plugin-cloudflare-pages-dynamic-ssr/client/hooks";

export default function UserPage() {
  const user = useLoader(loader_user); // T | null

  if (!user) return null;
  return <h1>{user.name}</h1>;
}
```

- During SSR: reads from the request context.
- On first client load: reads from `window.__PROVIDER_PROPS__` injected by the server.
- On client-side navigation: `SSRPropsProvider` re-fetches only the props (not the full HTML).
- Returns `null` until data is available.

### `revalidate` — on-demand cache invalidation

```tsx
import { revalidate } from "frame-master-plugin-cloudflare-pages-dynamic-ssr/revalidate";

// Inside a server action or Pages Function:
await revalidate("/users/123", ctx);
```

Deletes the cached HTML and props for the given pathname so the next request re-renders.

### Store providers

The cache backend is configured in `src/actions/_middleware.ts`:

| Provider | Import | Notes |
|---|---|---|
| `KVProvider` (default) | `…/provider/store/kv` | Persistent; requires `kv_namespaces` in `wrangler.jsonc` |
| `CacheProvider` | `…/provider/store/cache` | Cloudflare Cache API; no binding needed; may be evicted |
| `createStoreProvider` | `…/provider/utils` | Custom backend (D1, R2, external API, etc.) |

### Request lifecycle

```
Browser request → Cloudflare Pages Function (generated handler)
  │
  ├─ Cache hit  → return cached HTML / props immediately
  │
  └─ Cache miss
       ├─ Run all loader_* callbacks server-side
       ├─ Render the default export component to HTML
       ├─ Inject loader results as window.__PROVIDER_PROPS__ in <head>
       ├─ Store HTML + props in KV with the configured TTL
       └─ Return the full HTML response
```

### Demo page

`src/pages/users/[id].tsx` is a working example — it shows `"use dynamic"`, `createLoader`, `createPageConfig`, and `useLoader` in action.

---

## Server Actions

Files inside `src/actions/` are compiled into Cloudflare Pages Functions by [`frame-master-plugin-cloudflare-pages-functions-action`](https://github.com/shpaw415/frame-master-plugin-cloudflare-pages-functions-action). They can be **imported and called directly from client code** as regular async functions — the plugin handles serialisation and routing transparently.

### File-based routing

Actions follow Next.js-style file-based routing:

```
src/actions/
├── _middleware.ts        ← Cloudflare Pages middleware (dynamic SSR setup)
└── api/
    ├── hello.ts          → /api/hello
    └── health.ts         → /api/health (uses "no-action" directive)
```

### Creating an action

```ts
// src/actions/api/hello.ts
import { getContext } from "frame-master-plugin-cloudflare-pages-functions-action/context";

export async function GET() {
  const ctx = getContext<Env, never, never>(arguments);
  // ctx.env    — Cloudflare bindings
  // ctx.request — incoming Request
  return "Hello from Server";
}

export async function POST(userId: string, data: { name: string }) {
  const ctx = getContext<Env, never, never>(arguments);
  await ctx.env.KV.put(`user:${userId}`, JSON.stringify(data));
  return { success: true } as const;
}
```

Supported HTTP methods: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`.

### Calling an action from the client

```tsx
import { GET as getHello, POST as updateUser } from "src/actions/api/hello";

const message = await getHello();          // fully type-safe
const result  = await updateUser("42", { name: "Alice" });
```

No fetch URL, no JSON.stringify — the plugin generates the client stub automatically.

### Supported data types

| Type | Direction |
|---|---|
| JSON (objects, primitives) | both ways |
| `File` / `File[]` | client → server |
| `FormData` | client → server |
| `File` / `Blob` | server → client |

### Bypassing the plugin (`"no-action"` directive)

Use `"no-action"` as the first line to expose a file as a plain Cloudflare Pages Function without any plugin wrapping:

```ts
"no action";

export function onRequestGet(ctx) {
  return new Response("OK");
}
```

### `getContext` helper

```ts
import { getContext } from "frame-master-plugin-cloudflare-pages-functions-action/context";

export async function POST(arg1: string) {
  const ctx = getContext<Env, Params, Data>(arguments);
  // ctx.env.KV, ctx.env.DB, ctx.request, ctx.data, …
}
```

`getContext` must receive the special `arguments` object — this is how the plugin injects the Cloudflare `EventContext` at runtime.

---

## Client-Side Environment Variables

The `EnvInHTML` plugin (`frame-master-plugin-env-in-html`) injects build-time environment variables into each HTML page so they are available as `process.env` in the browser.

### What is exposed

| Variable | Condition |
|---|---|
| Any variable prefixed with `PUBLIC_` | Always injected (e.g. `PUBLIC_API_URL`) |
| `NODE_ENV` | Always injected |

Variables are serialised into a `<script>` tag in `<head>` at build time — **variables without the `PUBLIC_` prefix (other than `NODE_ENV`) are never injected**.

### Usage

```bash
# .env
PUBLIC_API_URL=https://api.example.com
```

```ts
// anywhere in src/
console.log(process.env.PUBLIC_API_URL); // "https://api.example.com"
console.log(process.env.NODE_ENV);       // "development" | "production"
```

---

## Do Not Edit (Generated Paths)

| Path | Generated by |
|---|---|
| `static/style.css` | `TailwindPlugin` |
| `optimized/` | `imageOptimizer` |
| `optimized/manifest.json` | `imageOptimizer` |
| `.frame-master/` | Frame Master core (build output, type declarations, preload) |
| `functions/` | `CFActionPlugin` / `SSRPlugin` (Cloudflare Pages Functions bundle) |

---

## Deployment (Cloudflare Pages)

1. Update `wrangler.jsonc` → set `name` to your project name.
2. Update `wrangler.jsonc` → replace `<kv-binding-id>` in `kv_namespaces` with your real KV namespace ID (create one in the Cloudflare dashboard if needed).
3. Update `site.config.ts` → set `siteUrl` to your production URL.
4. Build output directory: `.frame-master/build`
5. Build command: `bun run build`

For Cloudflare Dashboard setup:
- **Framework preset:** None / Custom
- **Build command:** `bun run build`
- **Build output directory:** `.frame-master/build`
