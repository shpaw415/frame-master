import { FrameMasterNotFoundFallback } from "frame-master/plugin/default/fallbacks";
import { frameMasterDefaultCSSPlugin } from "frame-master/plugin/default/css";

import type { FrameMasterConfig } from "../src/server/type";

const config: FrameMasterConfig = {
    HTTPServer: {
        port: 3000,
    },
    plugins: [
        FrameMasterNotFoundFallback,
        frameMasterDefaultCSSPlugin
    ],
    DevServer: {
        port: 3001,
    }
};

export default config;