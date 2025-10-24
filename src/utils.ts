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
