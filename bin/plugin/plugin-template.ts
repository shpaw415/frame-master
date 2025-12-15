import type { FrameMasterPlugin } from "frame-master/plugin/types";
import { name, version } from "./package.json";

/**
 * __PluginName__ - Frame-Master Plugin
 *
 * Description: Add your plugin description here
 */
export default function __CleanPluginName__(): FrameMasterPlugin {
  return {
    name,
    version,
    priority: 100, // Lower number = higher priority

    router: {
      // Called before request processing
      before_request: async (master) => {
        // Initialize context, set global values, etc.
        // Example: master.setContext({ myData: "value" });
      },

      // Called during request processing
      request: async (master) => {
        // Handle the request and set response
        // Example:
        // if (master.URL.pathname === "/my-route") {
        //   master.setResponse("Hello from __PluginName__!", {
        //     headers: { "Content-Type": "text/plain" }
        //   });
        //   master.sendNow(); // Skip other plugins
        // }
      },

      // Called after response is created
      after_request: async (master) => {
        // Modify response headers, set cookies, etc.
        // Example: master.response?.headers.set("X-Custom-Header", "value");
      },

      // Rewrite HTML content
      html_rewrite: {
        initContext: (req) => {
          return {}; // Return context for html_rewrite
        },
        rewrite: async (rewriter, master, context) => {
          // Modify HTML using HTMLRewriter
          // Example:
          // rewriter.on("head", {
          //   element(el) {
          //     el.append("<script>console.log('Injected!');</script>", { html: true });
          //   }
          // });
        },
        after: async (html, master, context) => {
          // Process final HTML string
        },
      },
    },

    // Server lifecycle hooks
    serverStart: {
      main: async () => {
        console.log("__PluginName__ initialized");
      },
      dev_main: async () => {
        console.log("__PluginName__ running in development mode");
      },
    },

    // Plugin requirements
    requirement: {
      frameMasterVersion: "^1.0.0",
      bunVersion: ">=1.2.0",
      // frameMasterPlugins: {
      //   "some-required-plugin": "^1.0.0"
      // }
    },
  };
}
