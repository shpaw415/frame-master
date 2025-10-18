import type { FrameMasterConfig } from "./src/server/type";

const config: FrameMasterConfig = {
  HTTPServer: {
    port: 3000,
  },
  plugins: [],
  DevServer: {
    port: 3001,
  },
};

export default config;
