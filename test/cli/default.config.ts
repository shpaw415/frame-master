import type { FrameMasterConfig } from "frame-master/server/types";

export default {
  HTTPServer: {
    port: 3000,
  },
  plugins: [
    {
      name: "test-plugin",
      version: "1.0.0",
      build: {
        buildConfig: {
          entrypoints: ["{{TEST_PROJECT_ENTRYPOINT}}"],
        },
      },
    },
  ],
} satisfies FrameMasterConfig;
