import { InitPluginLoader } from "frame-master/plugins";
import { loadConfig } from "./config";
import { InitBuilder } from "frame-master/build";

// Load configuration and Core Plugins before starting the server
export async function InitAll() {
  await loadConfig();
  InitPluginLoader();
  await InitBuilder();
}
