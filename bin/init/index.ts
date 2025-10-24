import packageJson from "../../package.json";
import { join } from "path";
import Paths from "../../src/paths";
import { cpSync } from "fs";
import { webToken } from "@shpaw415/webtoken";

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
    setEnvFile(),
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

async function setEnvFile() {
  const envFile = Bun.file(join("./.env"));
  const envFileText = (await envFile.exists()) ? await envFile.text() : "";

  const modifiedText = [
    envFileText,
    !envFileText.includes("WEB_TOKEN_IV=") &&
      `WEB_TOKEN_IV=${webToken.generateSecureIV()}`,
    !envFileText.includes("WEB_TOKEN_SECRET=") &&
      `WEB_TOKEN_SECRET=${webToken.generateSecureSecret()}`,
  ]
    .filter((e) => e != undefined && e != null)
    .join("\n")
    .trim();

  if (modifiedText !== envFileText) {
    return envFile.write(modifiedText);
  }
}

export default init;
