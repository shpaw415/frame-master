import { directiveToolSingleton } from "./plugins";
import type { masterRequest } from "./server/request-manager";

export { directiveToolSingleton as directiveManager };

type RouteCallback = (master: masterRequest) => void | Promise<void>;
type MethodKeys =
  | "POST"
  | "GET"
  | "DELETE"
  | "PUT"
  | "PATCH"
  | "OPTIONS"
  | "HEAD";

/**
 * to use on router plugin
 * @example
 * router: {
 *   request: (master) =>
 *      onRoute(master, {
 *          "/api/some_route": {
 *              POST: (master) => { ... },
 *              GET: (master) => { ... }
 *         },
 *         "/api/another_route": (master) => { ... }
 *    })
 * }
 * */
export function onRoute(
  master: masterRequest,
  routes: Record<
    string,
    RouteCallback | Partial<Record<MethodKeys, RouteCallback>>
  >
) {
  const currentRoute = routes[master.URL.pathname];

  if (typeof currentRoute == "function") {
    return currentRoute(master);
  } else if (currentRoute) {
    return currentRoute[master.request.method as MethodKeys]?.(master);
  }
}

export function join(...parts: string[]) {
  return parts
    .map((part, index) => {
      // Normalize backslashes to forward slashes
      part = part.replace(/\\/g, "/");

      if (index === 0) {
        // First part: remove trailing slashes only
        return part.replace(/\/+$/g, "");
      } else if (index === parts.length - 1) {
        // Last part: remove leading slashes only (preserve filenames like index.js)
        return part.replace(/^\/+/g, "");
      } else {
        // Middle parts: remove both leading and trailing slashes
        return part.replace(/^\/+|\/+$/g, "");
      }
    })
    .filter((part) => part.length > 0)
    .join("/");
}

/**
 * Creates a RegExp for filtering files in Bun.build plugins based on path and extensions.
 *
 * **Public API** - Use this helper to create file filters for Bun plugins in your build config.
 *
 * Useful for creating filter patterns in Bun plugins to match specific files by directory
 * and file extension. The generated regex escapes special characters in paths and creates
 * an extension matcher with OR logic.
 *
 * @param options - Configuration for the regex pattern
 * @param options.path - Array of path segments to match (e.g., ["src", "components"])
 * @param options.ext - Array of file extensions without dots (e.g., ["ts", "tsx", "js"])
 *
 * @returns RegExp that matches files in the specified path with any of the given extensions
 *
 * @example
 * // Match TypeScript files in src/components
 * const filter = pluginRegex({
 *   path: ["src", "components"],
 *   ext: ["ts", "tsx"]
 * });
 * // Matches: src/components/Button.tsx, src/components/utils/helper.ts
 * // Doesn't match: src/pages/index.tsx, src/components/style.css
 *
 * @example
 * // Use in a Bun.build plugin
 * const plugin: BunPlugin = {
 *   name: "my-plugin",
 *   setup(build) {
 *     const filter = pluginRegex({
 *       path: ["src", "server"],
 *       ext: ["ts", "js"]
 *     });
 *
 *     build.onLoad({ filter }, async (args) => {
 *       // Handle server-side files
 *       return { contents: "...", loader: "ts" };
 *     });
 *   }
 * };
 *
 * @example
 * // Match all CSS/SCSS in styles directory
 * const styleFilter = pluginRegex({
 *   path: ["src", "styles"],
 *   ext: ["css", "scss", "sass"]
 * });
 */
export function pluginRegex({ path, ext }: { path: string[]; ext: string[] }) {
  return new RegExp(
    `^${escapeRegExp(join(...path))}.*\\.(${ext.map(escapeRegExp).join("|")})$`
  );
}
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
