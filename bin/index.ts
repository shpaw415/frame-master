import { program } from "commander";
import { version } from "../package.json";
import { join } from "path";

type CommandOptions = {
  install?: string;
  uninstall?: string;
  list?: boolean;
  search?: string;
};

const config = async () => (await import("@/server/config")).default;

const importServerStart = () =>
  import(join(process.cwd(), ".frame-master", "server.ts"));

program
  .name("frame-master")
  .description("CLI tool to manage frame-master plugins and server")
  .version(version);

program
  .option("-i, --install <plugin>", "Install a plugin")
  .option("-u, --uninstall <plugin>", "Uninstall a plugin")
  .option("-l, --list", "List all installed plugins")
  .option("-s, --search <keyword>", "Search for plugins by keyword");

program
  .command("dev")
  .description("Start the development server")
  .action(async () => {
    process.env.NODE_ENV = "development";
    console.log(
      `Dev server running at http://localhost:${
        (await config()).HTTPServer.port
      }`
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

program.parse();
