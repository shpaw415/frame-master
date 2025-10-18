import packageJson from "../../package.json";
import { join } from "path";
import Paths from "@/paths";
import { cpSync } from "fs";

export const PATH_TO_FRAME_MASTER = join(
  process.cwd(),
  "node_modules",
  packageJson.name
) as `<cwd>/node_modules/frame-master`;

export const PATH_TO_DEFAULT_CONFIG_FILE = join(
  PATH_TO_FRAME_MASTER,
  "bin",
  "init",
  "config.default.ts"
) as `<cwd>/config.default.ts`;

async function init() {
  await Promise.all([copyConfigFileToProject(), copyBunfigToProject()]);
  copyDotFrameMasterDirToProject();
  console.log("frame-master has been initialized in your project.");
}

function copyConfigFileToProject() {
  const defaultConfigFile = Bun.file(PATH_TO_DEFAULT_CONFIG_FILE);
  const targetPath = join(process.cwd(), Paths.configFile);
  return Bun.file(targetPath).write(defaultConfigFile);
}

function copyDotFrameMasterDirToProject() {
  const targetDirPath = join(process.cwd(), ".frame-master");
  cpSync(join(PATH_TO_FRAME_MASTER, ".frame-master"), targetDirPath, {
    recursive: true,
  });
}

function copyBunfigToProject() {
  const bunfigFile = Bun.file(
    join(PATH_TO_FRAME_MASTER, "bin", "init", "bunfig.txt")
  );
  const targetPath = join(process.cwd(), "bunfig.toml");
  return Bun.file(targetPath).write(bunfigFile);
}

export default init;
