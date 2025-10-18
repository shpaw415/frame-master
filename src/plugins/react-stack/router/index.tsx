import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

type RouteContextType = {
  currentRoute: routeSetType;
  setRoute: (route: string, searchParams: Record<string, string>) => void;
  previous: () => void;
  next: () => void;
};

type routeSetType = {
  pathname: string;
  searchParams: URLSearchParams;
};

export const RouterContext = createContext<RouteContextType>(null as any);

export function useRouter() {
  return useContext(RouterContext);
}

export function RouterProvider({
  children,
  defaultRoute,
}: {
  children: React.ReactNode;
  defaultRoute: routeSetType;
}) {
  const historyStack = useRef<(routeSetType & { current: boolean })[]>([
    {
      ...defaultRoute,
      current: true,
    },
  ]);

  const [currentRoute, setRoute] = useState<routeSetType>(defaultRoute);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState<React.ReactNode>(children);

  const setRouteWithParams = useCallback(
    (route: string, searchParams: Record<string, string>) => {
      const url = new URL(route, window.location.origin);
      Object.entries(searchParams).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
      setRoute({ pathname: url.pathname, searchParams: url.searchParams });
    },
    []
  );

  useEffect(() => {
    // Store original history methods
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    // Override pushState to use router navigation
    window.history.pushState = function (
      state: any,
      title: string,
      url?: string | URL | null
    ) {
      if (url) {
        const urlObj = new URL(url, window.location.origin);
        const searchParamsObj: Record<string, string> = {};
        urlObj.searchParams.forEach((value, key) => {
          searchParamsObj[key] = value;
        });

        // Use router navigation instead of browser navigation
        setRouteWithParams(urlObj.pathname, searchParamsObj);

        // Update browser URL without triggering navigation
        originalPushState.call(this, state, title, url);
      }
    };

    // Override replaceState to use router navigation
    window.history.replaceState = function (
      state: any,
      title: string,
      url?: string | URL | null
    ) {
      if (url) {
        const urlObj = new URL(url, window.location.origin);
        const searchParamsObj: Record<string, string> = {};
        urlObj.searchParams.forEach((value, key) => {
          searchParamsObj[key] = value;
        });

        // Use router navigation instead of browser navigation
        setRouteWithParams(urlObj.pathname, searchParamsObj);

        // Update browser URL without triggering navigation
        originalReplaceState.call(this, state, title, url);
      }
    };

    // Handle popstate events (back/forward buttons)
    const handlePopState = (event: PopStateEvent) => {
      event.preventDefault();
      const url = new URL(window.location.href);
      const searchParamsObj: Record<string, string> = {};
      url.searchParams.forEach((value, key) => {
        searchParamsObj[key] = value;
      });

      setRouteWithParams(url.pathname, searchParamsObj);
    };

    // Override link click behavior
    const handleLinkClick = (event: Event) => {
      const target = event.target as HTMLElement;
      const link = target.closest("a");

      if (link && link.href && !link.target && !event.defaultPrevented) {
        const url = new URL(link.href);

        // Only intercept same-origin links
        if (url.origin === window.location.origin) {
          event.preventDefault();

          const searchParamsObj: Record<string, string> = {};
          url.searchParams.forEach((value, key) => {
            searchParamsObj[key] = value;
          });

          // Use router navigation
          setRouteWithParams(url.pathname, searchParamsObj);

          // Update browser history
          window.history.pushState(null, "", link.href);
        }
      }
    };

    // Add event listeners
    window.addEventListener("popstate", handlePopState);
    document.addEventListener("click", handleLinkClick);

    // Cleanup function
    return () => {
      // Restore original methods
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;

      // Remove event listeners
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("click", handleLinkClick);
    };
  }, [setRouteWithParams]);

  const previous = useCallback(() => {
    if (historyStack.current.length > 1) {
      const prevIndex =
        historyStack.current.findIndex((item) => item.current) - 1;
      if (prevIndex < 0) return;
      const { current, ...prev } = historyStack.current[prevIndex]!;
      historyStack.current[prevIndex]!.current = true;
      historyStack.current[prevIndex + 1]!.current = false;
      setRouteWithParams(prev.pathname, Object.fromEntries(prev.searchParams));
      return;
    }
  }, []);

  const next = useCallback(() => {
    if (historyStack.current.length > 1) {
      const nextIndex =
        historyStack.current.findIndex((item) => item.current) + 1;
      if (nextIndex >= historyStack.current.length) return;
      const { current, ...next } = historyStack.current[nextIndex]!;
      historyStack.current[nextIndex]!.current = true;
      historyStack.current[nextIndex - 1]!.current = false;
      setRouteWithParams(next.pathname, Object.fromEntries(next.searchParams));
      return;
    }
  }, []);

  const fetchPage = useCallback(
    async (route: routeSetType, params: unknown[]) => {
      const reactPluginSpecificsearchParams = new URLSearchParams();
      reactPluginSpecificsearchParams.set("client_navigation", "true");
      const Page = (await import(
        route.pathname +
          "?" +
          route.searchParams.toString() +
          "&" +
          reactPluginSpecificsearchParams.toString()
      )) as {
        default: (
          ...params: Array<unknown>
        ) => React.ReactNode | Promise<React.ReactNode>;
      };

      setCurrentPage(await Page.default(...params));
    },
    []
  );

  return (
    <RouterContext.Provider
      value={{ currentRoute, setRoute: setRouteWithParams, previous, next }}
    >
      {isLoading && <div>Loading...</div>}
      {!isLoading && children}
    </RouterContext.Provider>
  );
}
