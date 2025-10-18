import type { FrameMasterConfig } from "frame-master/server/types";

export default {
  HTTPServer: {
    port: 3000,
  },
  DevServer: {
    port: 3001,
  },
  plugins: [],
} satisfies FrameMasterConfig;
