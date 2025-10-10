import { createPlugin } from "@/plugins/utils";
import { join } from "path";
const cssRoute = [
    "/frame-master-error.css",
    "/frame-master-not-found.css",
] as const;

const cssFilesPath = new Map<string, typeof cssRoute[number]>();
for (const route of cssRoute) {
    cssFilesPath.set(
        route,
        join(import.meta.dir, route.replace(/^\//, "")) as typeof route
    );
}

export const frameMasterDefaultCSSPlugin = createPlugin({
    name: "frame-master-default-css",
    priority: 0,
    router: {
        request(req) {
            if (!(req.URL.pathname in cssRoute)) return;

            req.setResponse(Bun.file(cssFilesPath.get(req.URL.pathname)!), {
                headers: {
                    "Content-Type": "text/css",
                },
            }).sendNow();
        },
    },
});

