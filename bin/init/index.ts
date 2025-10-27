import packageJson from "../../package.json";
import { join } from "path";
import Paths from "../../src/paths";
import { cpSync, existsSync } from "fs";
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
) as `<frame-master-path>/config.default.ts`;

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

async function copyConfigFileToProject() {
  const defaultConfigFile = Bun.file(PATH_TO_DEFAULT_CONFIG_FILE);
  const targetPath = join(process.cwd(), Paths.configFile);
  const targetFile = Bun.file(targetPath);
  if (await targetFile.exists()) {
    console.warn(`${Paths.configFile} already exists. Skipping copy.`);
    return;
  }
  return targetFile.write(await defaultConfigFile.text());
}

function copyDotFrameMasterDirToProject() {
  const targetDirPath = join(process.cwd(), ".frame-master");
  if (existsSync(targetDirPath)) {
    console.warn(`.frame-master directory already exists. Skipping copy.`);
    return;
  }
  cpSync(join(PATH_TO_FRAME_MASTER, ".frame-master"), targetDirPath, {
    recursive: true,
  });
}

async function copyBunfigToProject() {
  const bunfigFile = Bun.file(
    join(PATH_TO_FRAME_MASTER, "bin", "init", "bunfig.toml")
  );

  const targetPath = join(process.cwd(), "bunfig.toml");
  const targetFile = Bun.file(targetPath);
  if (await targetFile.exists()) {
    console.warn(`bunfig.toml already exists. Skipping copy.`);
    return;
  }
  return Bun.file(targetPath).write(await bunfigFile.text());
}

async function addScriptsToPackageJson() {
  const packageJsonPath = join(process.cwd(), "package.json");
  const packageJsonFile = Bun.file(packageJsonPath);
  const packageJsonText = await packageJsonFile.text();
  const packageJson = JSON.parse(packageJsonText);

  packageJson.scripts ??= {};
  if (packageJson.scripts["dev"]) {
    console.warn(
      `"dev" script already exists in package.json. Skipping addition.`
    );
  } else
    packageJson.scripts["dev"] =
      "NODE_ENV=development bun --hot frame-master dev";
  if (packageJson.scripts["start"]) {
    console.warn(
      `"start" script already exists in package.json. Skipping addition.`
    );
  } else
    packageJson.scripts["start"] = "NODE_ENV=production bun frame-master start";

  return packageJsonFile.write(JSON.stringify(packageJson, null, 2));
}

async function setEnvFile() {
  const envFile = Bun.file(join("./.env"));
  const envFileText = (await envFile.exists()) ? await envFile.text() : "";

  const modifiedText = [
    ...envFileText.split("\n"),
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
