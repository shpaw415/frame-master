import type { FrameMasterConfig } from "frame-master/server/types";
import ReactToHtml from "frame-master-plugin-react-to-html";
import ApplyReact from "frame-master-plugin-apply-react/plugin";
import TailwindPlugin from "frame-master-plugin-tailwind";

export default {
  HTTPServer: {
    port: 3001,
  },
  plugins: [
    ReactToHtml({
      shellPath: "src/shell.tsx",
      srcDir: "src/pages",
    }),

    ApplyReact({
      clientShellPath: "src/client-wrapper.tsx",
      route: "src/pages",
      style: "nextjs",
    }),
    TailwindPlugin({
      inputFile: "static/tailwind.css",
      outputFile: "static/style.css",
    }),
    {
      name: "static-assets",
      version: "1.0.0",
      build: {
        buildConfig: {
          naming: {
            asset: "[dir]/[name].[ext]",
          },
        },
      },
    },
  ],
} satisfies FrameMasterConfig;
