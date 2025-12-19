"server-only";
import { join } from "path";

export default {
  configFile: "frame-master.config.ts",
  pathToConfigDir: join(process.cwd(), ".frame-master"),
};
