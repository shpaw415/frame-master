import { createPlugin } from "@/plugins/utils";
import { renderToString } from "react-dom/server";
import NotFound from "./not-found";
import type { PluginOptions } from "@/plugins/types";


const options = {
    HTMLRewrite: {}
} satisfies PluginOptions;


export const FrameMasterNotFoundFallback = createPlugin<typeof options>({
    name: "frame-master-not-found-fallback",
    requirement: {
        frameMasterPlugins: {
            "frame-master-default-css": "*"
        }
    },
    priority: -Infinity,
    router: {
        request(req) {
            if (req.isResponseSetted() || !req.isAskingHTML) return;
            req.setResponse(renderToString(NotFound()), {
                status: 404,
                headers: {
                    "Content-Type": "text/html",
                },
            })
        },
    },
});