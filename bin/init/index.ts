import packageJson from "../../package.json";
import { join } from "path";
import Paths from "@/paths";

export const PATH_TO_FRAME_MASTER = join(
  process.cwd(),
  "node_modules",
  packageJson.name
);
export const PATH_TO_DEFAULT_CONFIG_FILE = join(
  PATH_TO_FRAME_MASTER,
  "config.default.ts"
);

async function init() {
  copyConfigFileToProject();
}

function copyConfigFileToProject() {
  const defaultConfigFile = Bun.file(PATH_TO_DEFAULT_CONFIG_FILE);
  const targetPath = join(process.cwd(), Paths.configFile);
  return Bun.file(targetPath).write(defaultConfigFile);
}

export default init;
