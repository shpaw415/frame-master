import { Command } from "commander";
import { pluginLoader } from "frame-master/plugins";
import { ConfigFileNotFound } from "frame-master/server/config";
import { InitCLIPlugins } from "frame-master/server/init";

let configFileNotFound = false;

const command = new Command("extended-cli")
  .description("CLI extended by frame-master plugins")
  .action(async () => {
    if (configFileNotFound) {
      console.error(
        "Cannot extend CLI commands because the configuration file was not found."
      );
      process.exit(1);
    }
  });

await LoadCustomCLI(command);

async function LoadCustomCLI(command: Command) {
  try {
    await InitCLIPlugins();
  } catch (err) {
    if (err instanceof ConfigFileNotFound) {
      configFileNotFound = true;
      return;
    }
    console.warn("Failed to initialize CLI plugins:", err);
  }
  if (!pluginLoader) throw new Error("Plugin loader not initialized");
  const CLIplugins = pluginLoader.getPluginByName("cli");
  for (const plugin of CLIplugins) {
    try {
      plugin.pluginParent(command);
    } catch (err) {
      console.error(
        `Error loading CLI extensions from plugin ${plugin.name}:`,
        err
      );
      process.exit(1);
    }
  }
}

export default command;
