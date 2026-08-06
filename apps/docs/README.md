# Frame Master Template: cloudflare-nextjs

A full-featured React starter template for [Cloudflare Pages](https://pages.cloudflare.com/), orchestrated by [Frame Master](https://github.com/shpaw415/frame-master).

## Why this template?

The goal of `cloudflare-nextjs` is to bring a **Next.js-like developer experience to Cloudflare Pages** — filesystem routing, nested layouts, server-side rendering, server actions, and client-accessible environment variables — while staying on the Cloudflare edge runtime instead of Node.js. More Next.js-equivalent features will be added over time to move towards a full parity experience on Cloudflare.

This template extends the base `cloudflare-base` template with **dynamic server-side rendering** and **type-safe server actions** powered by two Frame Master plugins.

![Frame Master Template](https://img.shields.io/badge/Frame%20Master-Template-blueviolet)
![React](https://img.shields.io/badge/React-19-blue)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8)
![Cloudflare Pages](https://img.shields.io/badge/Cloudflare-Pages-orange)
![Bun](https://img.shields.io/badge/Bun-1.3+-black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)

---

## ✨ Features

### Base capabilities

- **React 19** — latest React for building interactive UIs
- **Tailwind CSS 4** — utility-first styling compiled per-build
- **Cloudflare Pages** — edge deployment with global low latency
- **Frame Master** — plugin-based build orchestration
- **Bun 1.3+** — fast runtime and package manager
- **TypeScript (strict)** — full type safety end-to-end
- **Image Optimization** — automatic WebP conversion at responsive sizes
- **SVG as React components** — import `.svg` files directly
- **SEO + Sitemap** — meta tags, Open Graph, Twitter card, auto-generated `sitemap.xml`
- **SPA navigation** — client-side routing with loading and 404 fallbacks

### Extended capabilities (this template)

- **Dynamic SSR** — mark any page with `"use dynamic"` to render it server-side via a Cloudflare Pages Function, cache the result in KV, and hydrate on the client ([`frame-master-plugin-cloudflare-pages-dynamic-ssr`](https://github.com/shpaw415/frame-master-plugin-cloudflare-pages-dynamic-ssr))
- **Type-safe server actions** — write server functions in `src/actions/` and call them from the client as ordinary async functions with full TypeScript types ([`frame-master-plugin-cloudflare-pages-functions-action`](https://github.com/shpaw415/frame-master-plugin-cloudflare-pages-functions-action))

---

## 🛠️ Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.3 or later
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (required for KV namespaces and Wrangler dev)

### Installation

```bash
git clone <your-repo-url>
cd <your-project-directory>
bun install
bun frame-master init
```

### Configure environment

Copy `.env.exemple` to `.env` and set the Wrangler port:

```bash
cp .env.exemple .env
# .env contains:
#   NODE_ENV=development
#   WRANGLER_PORT=8787
```

### Development

Start the Frame Master dev server (http://localhost:3000):

```bash
bun dev
```

> Adding a **new page file** during dev requires restarting `bun dev` to register the new route. Code changes to existing files are picked up automatically.

### Production build

```bash
bun run build
```

Output: `.frame-master/build`

---

## 📂 Project Structure

```
.
├── src/
│   ├── pages/                    # Filesystem-routed pages
│   │   ├── index.tsx             # / (home)
│   │   ├── layout.tsx            # Root layout (wraps all pages)
│   │   ├── sub/                  # /sub/* routes
│   │   └── users/
│   │       └── [id].tsx          # /users/:id — dynamic SSR demo
│   ├── actions/                  # Server actions → Cloudflare Pages Functions
│   │   ├── _middleware.ts        # KV cache + SSR middleware
│   │   └── api/
│   │       ├── hello.ts          # GET /api/hello
│   │       └── health.ts         # GET /api/health (plain function)
│   ├── action-utils/
│   │   └── page-wrapper.tsx      # SSR HTML shell with layout support
│   ├── components/
│   │   ├── loading.tsx           # Global loading fallback
│   │   └── 404.tsx               # Global not-found fallback
│   ├── shell.tsx                 # HTML document shell (<html>, <head>, <body>)
│   ├── client-shell.tsx          # Client-side router + SSRPropsProvider
│   └── common.ts                 # Shared app constants
├── images/                       # Source images (processed → optimized/)
├── optimized/                    # Generated WebP images (do not edit)
├── static/
│   ├── tailwind.css              # Tailwind entry point (edit this)
│   └── style.css                 # Compiled CSS output (do not edit)
├── assets/                       # Static assets copied to build
├── site.config.ts                # SEO / sitemap configuration
├── frame-master.config.ts        # Plugin registration
├── wrangler.jsonc                # Cloudflare Pages deployment config
├── .env                          # Local env vars (WRANGLER_PORT)
└── tsconfig.json
```

---

## 📄 TypeScript Path Aliases

Short import aliases are pre-configured in `tsconfig.json` for the most common paths:

| Alias                  | Resolves to                                                         | Example use                                         |
| ---------------------- | ------------------------------------------------------------------- | --------------------------------------------------- |
| `@images/*`            | `images/*`                                                          | `import Logo from "@images/logo.png"`               |
| `@static/*`            | `static/*`                                                          | `import Icon from "@static/icon.svg"`               |
| `@components/*`        | `src/components/*`                                                  | `import Loading from "@components/loading"`         |
| `@api/*`               | `src/actions/api/*`                                                 | `import { GET } from "@api/hello"`                  |
| `@next/ssr`            | `frame-master-plugin-cloudflare-pages-dynamic-ssr/server`           | `import { createLoader } from "@next/ssr"`          |
| `@next/ssr/hooks`      | `frame-master-plugin-cloudflare-pages-dynamic-ssr/client/hooks`     | `import { useLoader } from "@next/ssr/hooks"`       |
| `@next/ssr/revalidate` | `frame-master-plugin-cloudflare-pages-dynamic-ssr/utils/revalidate` | `import { revalidate } from "@next/ssr/revalidate"` |
| `@next/action/context` | `frame-master-plugin-cloudflare-pages-functions-action/context`     | `import { getContext } from "@next/action/context"` |
| `@next/client`         | `frame-master-plugin-apply-react/utils`                             | `import { ThrowNotFound } from "@next/client"`      |

---

## 📄 Filesystem Routing

Pages in `src/pages/` map directly to URL routes — no registration needed.

| File                       | URL          |
| -------------------------- | ------------ |
| `src/pages/index.tsx`      | `/`          |
| `src/pages/about.tsx`      | `/about`     |
| `src/pages/sub/index.tsx`  | `/sub`       |
| `src/pages/users/[id].tsx` | `/users/:id` |

Every page file must `export default` a React component.

### Layouts

Place a `layout.tsx` in any directory to wrap its pages with shared UI (nav, footer, etc.). Layouts nest — a page inherits all ancestor layouts.

```tsx
// src/pages/layout.tsx
export default function Layout({ children }: { children: React.JSX.Element }) {
  return <div>{children}</div>;
}
```

---

## � Loading & Not-Found Pages

### Resolution order

The `ApplyReact` plugin resolves `loading.tsx` and `404.tsx` by looking in the **same directory** as the current page first, then falling back to `src/components/`:

1. **Sibling file** — e.g. `src/pages/sub/loading.tsx` is used for all `/sub/*` routes.
2. **Global fallback** — `src/components/loading.tsx` and `src/components/404.tsx` are used when no sibling file is found.

Drop a `loading.tsx` or `404.tsx` next to any group of pages to override the default for just that route segment.

### Triggering the loading state

Client-side SPA navigation automatically renders the nearest `loading.tsx` while the next page loads.

### Triggering the not-found page

Call `ThrowNotFound()` inside any page component to render the nearest `404.tsx`:

```tsx
import { ThrowNotFound } from "@next/client";

export default function Page() {
  const data = getData();
  if (!data) ThrowNotFound();
  // ...
}
```

### Global defaults

| File                         | Role                      |
| ---------------------------- | ------------------------- |
| `src/components/loading.tsx` | Global loading fallback   |
| `src/components/404.tsx`     | Global not-found fallback |

---

## �🖥️ Dynamic SSR Pages

Pages marked with `"use dynamic"` are rendered server-side by a Cloudflare Pages Function, cached in Cloudflare KV, and hydrated on the client.

> **Demo:** [`src/pages/users/[id].tsx`](src/pages/users/[id].tsx)

### 1. Mark the page

```tsx
// src/pages/users/[id].tsx
"use dynamic";
```

### 2. Define server-side loaders

```tsx
import {
  createLoader,
  createPageConfig,
  type PluginEventContext,
} from "@next/ssr";

// Cache this page for 60 seconds
export const ssr_configs = createPageConfig({
  callback(_ctx) {
    return { ttl: 60 };
  },
});

// Server-side data — never sent to the browser as code
export const loader_user = createLoader({
  name: "user",
  async callback(ctx: PluginEventContext<Env, "id", unknown>) {
    // ctx.params.id — dynamic route param
    // ctx.env       — Cloudflare bindings (KV, D1, R2, …)
    return { id: ctx.params.id, name: `User #${ctx.params.id}` };
  },
});
```

### 3. Read loader data in the component

```tsx
import { useLoader } from "@next/ssr/hooks";

export default function UserPage() {
  const user = useLoader(loader_user); // T | null

  if (!user) return null;
  return <h1>{user.name}</h1>;
}
```

`useLoader` returns `null` until data is available. On first load it reads from `window.__PROVIDER_PROPS__` injected by the server; on client-side navigation it re-fetches only the props — not the full HTML.

### Cache invalidation

```ts
import { revalidate } from "@next/ssr/revalidate";

// Inside a server action:
await revalidate("/users/123", ctx);
```

### Store providers

Configure the cache backend in `src/actions/_middleware.ts`:

| Provider               | Notes                                                     |
| ---------------------- | --------------------------------------------------------- |
| `KVProvider` (default) | Persistent. Requires `kv_namespaces` in `wrangler.jsonc`. |
| `CacheProvider`        | Cloudflare Cache API. No binding needed; may be evicted.  |
| `D1Provider`           | Cloudflare D1 Database Provider                           |
| `createStoreProvider`  | Custom backend (D1, R2, external API, etc.).              |

---

## ⚡ Server Actions

Files in `src/actions/` compile into Cloudflare Pages Functions and can be **imported and called from client code as regular async functions** — fully type-safe, no `fetch` URLs needed.

> **Demo:** [`src/actions/api/hello.ts`](src/actions/api/hello.ts) → `GET /api/hello`

### Create an action

```ts
// src/actions/api/hello.ts
import { getContext } from "@next/action/context";

export async function GET() {
  const ctx = getContext<Env, never, never>(arguments);
  return "Hello from the server!";
}

export async function POST(userId: string, data: { name: string }) {
  const ctx = getContext<Env, never, never>(arguments);
  await ctx.env.KV.put(`user:${userId}`, JSON.stringify(data));
  return { success: true } as const;
}
```

Supported methods: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`.

### Call from the client

```tsx
import { GET as getHello, POST as updateUser } from "@api/hello";

const message = await getHello();
const result = await updateUser("42", { name: "Alice" });
// result.success is typed as `true`
```

### Supported data types

| Type                       | Direction       |
| -------------------------- | --------------- |
| JSON (objects, primitives) | both ways       |
| `File` / `File[]`          | client → server |
| `FormData`                 | client → server |
| `File` / `Blob`            | server → client |

### Bypass the plugin (`"no-action"`)

Expose a file as a plain Cloudflare Pages Function without any plugin wrapping:

```ts
// src/actions/api/health.ts
"no action";

export function onRequestGet() {
  return new Response("OK");
}
```

### `getContext` helper

```ts
import { getContext } from "@next/action/context";

export async function POST(arg1: string) {
  const ctx = getContext<Env, Params, Data>(arguments);
  // ctx.env.KV, ctx.env.DB, ctx.request, ctx.data, …
}
```

`getContext` **must** receive the special `arguments` object — this is how the plugin injects the Cloudflare `EventContext` at runtime.

---

## 🎨 Styling

Edit `static/tailwind.css` — this is the Tailwind CSS entry point. Do **not** edit `static/style.css` (compiled output).

---

## 🌐 Client-Side Environment Variables

The `frame-master-plugin-env-in-html` plugin injects build-time environment variables into each HTML page so they are available as `process.env` in the browser.

### What is exposed

| Variable                             | Condition                                            |
| ------------------------------------ | ---------------------------------------------------- |
| Any variable prefixed with `PUBLIC_` | Always injected (e.g. `PUBLIC_API_URL`)              |
| `NODE_ENV`                           | Always injected (set by the `dev` / `build` scripts) |

> Variables are serialised into a `<script>` tag in `<head>` at build time.

### Usage

Define variables in `.env` (prefixed with `PUBLIC_`) and read them anywhere in client code:

```bash
# .env
PUBLIC_API_URL=https://api.example.com
```

```tsx
// anywhere in src/
console.log(process.env.PUBLIC_API_URL); // "https://api.example.com"
console.log(process.env.NODE_ENV); // "development" | "production"
```

> Variables **without** the `PUBLIC_` prefix (other than `NODE_ENV`) are **never** injected — they stay server-side only.

---

## 🖼️ Images

Place source images in `images/`. The build plugin converts them to WebP at responsive sizes (320, 720, 1280 by default) and writes results to `optimized/`.

```tsx
import Logo from "@images/logo.png";

<img src={Logo.src(720)} alt="Logo" />;
```

Do not edit `optimized/` or `optimized/manifest.json` manually.

---

## 🔷 SVGs

import SVG's as React components:

```tsx
import Icon from "./icon.svg";

<Icon className="w-6 h-6" />;
```

---

## 🔍 SEO & Sitemap

All SEO metadata lives in `site.config.ts`:

```ts
export default {
  siteUrl: "https://yoursite.com",
  SEO: {
    title: "My App",
    description: "...",
    keywords: ["react", "cloudflare"],
    openGraph: { ... },
    twitter: { ... },
    robots: "index, follow",
  },
} satisfies SiteConfigType;
```

`sitemap.xml` is generated automatically from the built HTML pages using `siteUrl`.

---

## ☁️ Deployment

### 1. Configure `wrangler.jsonc`

```jsonc
{
  "name": "your-project-name", // ← set this
  "kv_namespaces": [
    {
      "binding": "DYNAMIC_PAGE_KV",
      "id": "<your-kv-namespace-id>" // ← replace with real KV namespace ID
    }
  ]
}
```

Create a KV namespace in the [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **KV** if you don't have one.

### 2. Update `site.config.ts`

Set `siteUrl` to your production domain.

### 3. Deploy via Cloudflare Dashboard

1. Push to a GitHub repository.
2. In the Cloudflare Dashboard go to **Pages** → **Create a project** → **Connect to Git**.
3. Select your repository and set:
   - **Framework preset**: None / Custom
   - **Build command**: `bun i --production && NODE_ENV=production bun run build`
   - **Build output directory**: `.frame-master/build`
4. Add the `DYNAMIC_PAGE_KV` KV namespace binding under **Settings → Functions → KV namespace bindings**.
5. Click **Save and Deploy**.

---

## 🚫 Do Not Edit (Generated)

| Path                      | Generated by               |
| ------------------------- | -------------------------- |
| `static/style.css`        | TailwindPlugin             |
| `optimized/`              | imageOptimizer             |
| `optimized/manifest.json` | imageOptimizer             |
| `.frame-master/`          | Frame Master core          |
| `functions/`              | CFActionPlugin / SSRPlugin |

---

## 📄 License

MIT
