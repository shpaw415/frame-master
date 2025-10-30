#!/usr/bin/env bun
import { program } from "commander";
import { version } from "../package.json";
import { join } from "path";
import pluginCommand from "./plugin";
import { getConfig } from "../src/server/config";
import { InitAll } from "frame-master/server/init";

type CommandOptions = {
  install?: string;
  uninstall?: string;
  list?: boolean;
  search?: string;
};

await InitAll();
const config = getConfig();

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
    process.env.NODE_ENV = "development";
    console.log(
      `Dev server running at http://localhost:${config!.HTTPServer.port}`
    );
    await importServerStart();
  });

program
  .command("start")
  .description("Start the production server")
  .action(async () => {
    process.env.NODE_ENV = "production";
    console.log("Starting production server...");
    await importServerStart();
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

program.parse();
