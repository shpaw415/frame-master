#!/usr/bin/env bun
import { program } from "commander";
import { version } from "../package.json";
import { join } from "path";
import pluginCommand from "./plugin";
import { getConfig, InitConfig } from "../src/server/config";
import { testCommand } from "./testing";
import chalk from "chalk";

type CommandOptions = {
  install?: string;
  uninstall?: string;
  list?: boolean;
  search?: string;
};

const ensureNodeEnv = () => {
  if (process.env.NODE_ENV === undefined) {
    console.error(
      [
        "\n" +
          chalk.bold.red(
            "┌─────────────────────────────────────────────────────────┐"
          ),
        chalk.bold.red("│") +
          chalk.bold.white(
            "  ⚠️  NODE_ENV is not set                              "
          ) +
          chalk.bold.red("   │"),
        chalk.bold.red(
          "├─────────────────────────────────────────────────────────┤"
        ),
        chalk.bold.red("│") +
          "  " +
          chalk.yellow("Please set NODE_ENV before running the server:      ") +
          chalk.bold.red("   │"),
        chalk.bold.red("│") +
          "                                                         " +
          chalk.bold.red("│"),
        chalk.bold.red("│") +
          "  " +
          chalk.gray("Option 1: Inline with command                       ") +
          chalk.bold.red("   │"),
        chalk.bold.red("│") +
          "  " +
          chalk.cyan("  $ NODE_ENV=development bun run dev                 ") +
          chalk.bold.red("  │"),
        chalk.bold.red("│") +
          "  " +
          chalk.cyan("  $ NODE_ENV=production bun run start                ") +
          chalk.bold.red("  │"),
        chalk.bold.red("│") +
          "                                                         " +
          chalk.bold.red("│"),
        chalk.bold.red("│") +
          "  " +
          chalk.gray("Option 2: Add to .env file                          ") +
          chalk.bold.red("   │"),
        chalk.bold.red("│") +
          "  " +
          chalk.cyan("  NODE_ENV=development                               ") +
          chalk.bold.red("  │"),
        chalk.bold.red(
          "└─────────────────────────────────────────────────────────┘"
        ) + "\n",
      ].join("\n")
    );
    process.exit(1);
  } else if (
    process.env.NODE_ENV !== "development" &&
    process.env.NODE_ENV !== "production"
  ) {
    console.error(
      [
        "\n" +
          chalk.bold.red(
            "┌───────────────────────────────────────────────────────────────┐"
          ),
        chalk.bold.red("│") +
          chalk.bold.white("  ⚠️  NODE_ENV is set to an invalid value") +
          chalk.bold.red("                       │"),
        chalk.bold.red(
          "├───────────────────────────────────────────────────────────────┤"
        ),
        chalk.bold.red("│") +
          "  " +
          chalk.yellow(
            "Please set NODE_ENV to either 'development' or 'production'"
          ) +
          chalk.bold.red("  │"),
        chalk.bold.red(
          "└───────────────────────────────────────────────────────────────┘"
        ) + "\n",
      ].join("\n")
    );
    process.exit(1);
  }
};

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
  .version(version);

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
  .command("create <name>")
  .description("Create a new frame-master project")
  .option("-t, --type <type>", "Type of project to create", "minimal")
  .addHelpText("after", `\n  avalable type: [ minimal ]`)
  .action(async (name: string, { type }: { type: "minimal" }) => {
    const createProject = (await import("./create")).default;
    await createProject({ name, type });
  });

program.addCommand(pluginCommand);
program.addCommand(testCommand);

program.parse();
