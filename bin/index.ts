import { program } from "commander";
import { version } from "../package.json";
import { join } from "path";

type CommandOptions = {
    install?: string;
    uninstall?: string;
    list?: boolean;
    search?: string;
    action?: string;
};

program
    .name("frame-master")
    .description("CLI tool to manage frame-master plugins and server")
    .version(version)

program.option("-i, --install <plugin>", "Install a plugin")
    .option("-u, --uninstall <plugin>", "Uninstall a plugin")
    .option("-l, --list", "List all installed plugins")
    .option("-s, --search <keyword>", "Search for plugins by keyword")
    .argument("<action>", "Run the server dev or start");

program.parse();

const options = program.opts<CommandOptions>();


if (options.action === "dev") {
    await import(join(process.cwd(), ".frame-master", "server.ts"));
}