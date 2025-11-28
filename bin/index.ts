#!/usr/bin/env bun
import { program } from "commander";
import { version } from "../package.json";
import { join } from "path";
import pluginCommand from "./plugin";
import { getConfig, InitConfig } from "../src/server/config";
import { testCommand } from "./testing";
import { buildCommand } from "./build";
import chalk from "chalk";
import { ensureNodeEnv } from "./share";
import ExtendCli from "./extend-cli";
import type { CreateProjectProps } from "./create";

function LogServerInfo() {
  const config = getConfig();
  if (!config) throw new Error("Configuration not loaded");
  const protocol = config.HTTPServer.tls ? "https" : "http";
  const hostname = config.HTTPServer.hostname || "localhost";
  const port = config.HTTPServer.port;
  const url = `${protocol}://${hostname}:${port}`;

  console.log(
    [
      "\n" + chalk.bold.cyan("┌─────────────────────────────────────────┐"),
      chalk.bold.cyan("│") +
        chalk.bold.white("  🚀 Frame Master Server Running       ") +
        chalk.bold.cyan("  │"),
      chalk.bold.cyan("├─────────────────────────────────────────┤"),
      chalk.bold.cyan("│") +
        "  " +
        chalk.gray("Local:   ") +
        chalk.bold.green(url.padEnd(30)) +
        chalk.bold.cyan("│"),
      chalk.bold.cyan("│") +
        "  " +
        chalk.gray("Mode:    ") +
        chalk.bold.yellow((process.env.NODE_ENV || "development").padEnd(30)) +
        chalk.bold.cyan("│"),
      chalk.bold.cyan("└─────────────────────────────────────────┘") + "\n",
    ].join("\n")
  );
}

const importServerStart = () =>
  import(join(process.cwd(), ".frame-master", "server.ts"));

program
  .name("frame-master")
  .description("CLI tool to manage frame-master plugins and server")
  .version(version)
  .option("-v, --verbose", "Enable verbose logging")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.verbose) {
      process.env.FRAME_MASTER_VERBOSE = "true";
    }
  });

/*
program
  .option("-i, --install <plugin>", "Install a plugin")
  .option("-u, --uninstall <plugin>", "Uninstall a plugin")
  .option("-l, --list", "List all installed plugins")
  .option("-s, --search <keyword>", "Search for plugins by keyword");
*/

program
  .command("dev")
  .description("Start the development server")
  .action(async () => {
    ensureNodeEnv();
    await InitConfig();
    await importServerStart();
    LogServerInfo();
  });

program
  .command("start")
  .description("Start the production server")
  .action(async () => {
    ensureNodeEnv();
    await InitConfig();
    await importServerStart();
    LogServerInfo();
  });

program
  .command("init")
  .description("Initialize frame-master in the current project")
  .action(async () => {
    const initFrameMaster = (await import("./init")).default;
    await initFrameMaster();
  });

program
  .command("create [name]")
  .description("Create a new frame-master project")
  .option("-t, --type <type>", "Type of project to create")
  .option("--template <template>", "Template to use (e.g. name@version)")
  .addHelpText("after", `\n  avalable type: [ minimal ]`)
  .action(async (name: string | undefined, options: CreateProjectProps) => {
    const createProject = (await import("./create")).default;
    await createProject({ name, ...options });
  });

program.addCommand(pluginCommand);
program.addCommand(testCommand);
program.addCommand(buildCommand);
program.addCommand(ExtendCli);

await program.parseAsync().catch((err) => {
  console.error("Error executing command:", err);
  process.exit(1);
});
