import type { FrameMasterConfig } from "./type";
import { join } from "path";
import Paths from "../paths";

const config = (await import(join(process.cwd(), Paths.configFile)))
  .default as FrameMasterConfig;

if (config.HTTPServer.port == undefined) {
  config.HTTPServer.port = 3000;
}

export default config;
