import packageJson from "../../package.json";
import { join } from "path";
import Paths from "../../src/paths";
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
  await Promise.all([
    copyConfigFileToProject(),
    copyBunfigToProject(),
    addScriptsToPackageJson(),
  ]);
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
    join(PATH_TO_FRAME_MASTER, "bin", "init", "bunfig.toml")
  );
  const targetPath = join(process.cwd(), "bunfig.toml");
  return Bun.file(targetPath).write(bunfigFile);
}

async function addScriptsToPackageJson() {
  const packageJsonPath = join(process.cwd(), "package.json");
  const packageJsonFile = Bun.file(packageJsonPath);
  const packageJsonText = await packageJsonFile.text();
  const packageJson = JSON.parse(packageJsonText);

  packageJson.scripts ??= {};
  packageJson.scripts["dev"] =
    "NODE_ENV=development bun --hot frame-master dev";
  packageJson.scripts["start"] = "NODE_ENV=production bun frame-master start";

  return packageJsonFile.write(JSON.stringify(packageJson, null, 2));
}

export default init;
