import { join } from "path";
import Paths from "../../src/paths";
import { cpSync, existsSync } from "fs";
import { webToken } from "@shpaw415/webtoken";

export const PATH_TO_DEFAULT_CONFIG_FILE = join(
  import.meta.dir,
  "config.default.ts"
) as `<frame-master-path>/bin/init/config.default.ts`;

async function init() {
  await Promise.all([
    copyConfigFileToProject(),
    copyBunfigToProject(),
    addScriptsToPackageJson(),
    setEnvFile(),
    InitTsConfig(),
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
  cpSync(join(import.meta.dir, "..", "..", ".frame-master"), targetDirPath, {
    recursive: true,
  });
}

async function copyBunfigToProject() {
  const bunfigFile = Bun.file(join(import.meta.dir, "bunfig.default"));

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

const DEFAULT_TS_CONFIG = {
  compilerOptions: {
    // Environment setup & latest features
    lib: ["ESNext", "DOM", "DOM.Iterable"],
    target: "ESNext",
    module: "Preserve",
    moduleDetection: "force",
    jsx: "react-jsx",
    allowJs: true,

    // Bundler mode
    moduleResolution: "bundler",
    allowImportingTsExtensions: true,
    verbatimModuleSyntax: true,
    noEmit: true,

    // Best practices
    strict: true,
    skipLibCheck: true,
    noFallthroughCasesInSwitch: true,
    noUncheckedIndexedAccess: true,
    noImplicitOverride: true,

    // Some stricter flags (disabled by default)
    noUnusedLocals: false,
    noUnusedParameters: false,
    noPropertyAccessFromIndexSignature: false,
  },
};

const CUSTOM_D_TS_PATH = ".frame-master/frame-master-custom-type.d.ts";

const TS_CONFIG_WITH_CUSTOM_TYPE = {
  ...DEFAULT_TS_CONFIG,
  include: ["**/*", CUSTOM_D_TS_PATH],
};

async function InitTsConfig() {
  const projectTsConfigFile = Bun.file(join(process.cwd(), "tsconfig.json"));

  if (!(await projectTsConfigFile.exists()))
    return projectTsConfigFile.write(
      JSON.stringify(TS_CONFIG_WITH_CUSTOM_TYPE, null, 2)
    );

  let tsconfig: { include?: Array<string> } = {};
  let modified = false;
  try {
    tsconfig = JSON.parse(await projectTsConfigFile.text());
  } catch (e) {
    console.warn(
      `tsconfig.json is not a valid JSON file. Skipping tsconfig initialisation.`
    );
    return;
  }
  if (typeof tsconfig.include === "undefined") {
    tsconfig.include = ["**/*", CUSTOM_D_TS_PATH];
    modified = true;
  } else if (!tsconfig.include.includes(CUSTOM_D_TS_PATH)) {
    tsconfig.include = [...tsconfig.include, CUSTOM_D_TS_PATH];
    modified = true;
  }

  if (modified) {
    return projectTsConfigFile.write(JSON.stringify(tsconfig, null, 2));
  }
}

async function setEnvFile() {
  const envFile = Bun.file(join("./.env"));
  const envFileText = (await envFile.exists()) ? await envFile.text() : "";

  const modifiedText = [
    ...envFileText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
    !envFileText.includes("WEB_TOKEN_IV=") &&
      `WEB_TOKEN_IV=${webToken.generateSecureIV()}`,
    !envFileText.includes("WEB_TOKEN_SECRET=") &&
      `WEB_TOKEN_SECRET=${webToken.generateSecureSecret()}`,
  ]
    .filter((e) => e != undefined && e != null && e !== false && e.length > 0)
    .join("\n")
    .trim();

  if (modifiedText !== envFileText) {
    return envFile.write(modifiedText);
  }
}

export default init;
