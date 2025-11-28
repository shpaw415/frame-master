#!/usr/bin/env bun
import { Command } from "commander";
import chalk from "chalk";
import { join } from "path";
import _packageJson_ from "../../package.json";
import { getConfig, InitConfig } from "../../src/server/config";
import { onVerbose } from "../share";

const pluginCommand = new Command("plugin");

pluginCommand.description("Manage Frame-Master plugins").addHelpText(
  "after",
  `
Examples:
  $ frame-master plugin list
  $ frame-master plugin info frame-master-plugin-react-ssr
  $ frame-master plugin validate
  $ frame-master plugin create my-custom-plugin
`
);

/**
 * List all installed plugins
 */
pluginCommand
  .command("list")
  .description("List all installed plugins")
  .action(async () => {
    const options = {
      verbose: process.env.FRAME_MASTER_VERBOSE === "true",
    };
    try {
      await InitConfig();
      const config = getConfig();
      const plugins = config!.plugins;

      if (plugins.length === 0) {
        console.log(chalk.yellow("No plugins installed"));
        return;
      }

      console.log(chalk.bold.blue("\n📦 Installed Plugins:\n"));

      plugins.forEach((plugin: any, index: number) => {
        console.log(
          chalk.green(`${index + 1}. ${plugin.name}`) +
            chalk.gray(` v${plugin.version}`)
        );

        if (options.verbose) {
          if (plugin.priority !== undefined) {
            console.log(chalk.gray(`   Priority: ${plugin.priority}`));
          }

          const features: string[] = [];
          if (plugin.router?.before_request) features.push("before_request");
          if (plugin.router?.request) features.push("request");
          if (plugin.router?.after_request) features.push("after_request");
          if (plugin.router?.html_rewrite) features.push("html_rewrite");
          if (plugin.serverStart) features.push("serverStart");
          if (plugin.websocket) features.push("websocket");
          if (plugin.fileSystemWatchDir) features.push("file watching");

          if (features.length > 0) {
            console.log(chalk.gray(`   Features: ${features.join(", ")}`));
          }

          if (plugin.requirement) {
            console.log(chalk.gray(`   Has requirements`));
          }
          console.log("");
        }
      });

      console.log(
        chalk.gray(
          `\nTotal: ${plugins.length} plugin${plugins.length === 1 ? "" : "s"}`
        )
      );
    } catch (error) {
      console.error(
        chalk.red("Error listing plugins:"),
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

/**
 * Show detailed information about a specific plugin
 */
pluginCommand
  .command("info <plugin-name>")
  .description("Show detailed information about a plugin")
  .action(async (pluginName: string) => {
    try {
      await InitConfig();
      const config = getConfig();
      const plugin = config!.plugins.find((p: any) => p.name === pluginName);

      if (!plugin) {
        console.log(chalk.red(`Plugin "${pluginName}" not found`));
        console.log(
          chalk.gray(
            "\nUse 'frame-master plugin list' to see installed plugins"
          )
        );
        process.exit(1);
      }

      console.log(chalk.bold.blue(`\n📋 Plugin Information:\n`));
      console.log(chalk.green("Name:"), plugin.name);
      console.log(chalk.green("Version:"), plugin.version);

      if (plugin.priority !== undefined) {
        console.log(chalk.green("Priority:"), plugin.priority);
      }

      console.log(chalk.green("\nFeatures:"));
      if (plugin.router) {
        console.log(chalk.gray("  Router:"));
        if (plugin.router.before_request)
          console.log(chalk.gray("    ✓ before_request"));
        if (plugin.router.request) console.log(chalk.gray("    ✓ request"));
        if (plugin.router.after_request)
          console.log(chalk.gray("    ✓ after_request"));
        if (plugin.router.html_rewrite)
          console.log(chalk.gray("    ✓ html_rewrite"));
      }

      if (plugin.serverStart) {
        console.log(chalk.gray("  Server Lifecycle:"));
        if (plugin.serverStart.main) console.log(chalk.gray("    ✓ main"));
        if (plugin.serverStart.dev_main)
          console.log(chalk.gray("    ✓ dev_main"));
      }

      if (plugin.build) {
        console.log(chalk.gray("  Build Lifecycle:"));
        if (plugin.build.buildConfig) {
          const configType =
            typeof plugin.build.buildConfig === "function"
              ? "dynamic"
              : "static";
          console.log(chalk.gray(`    ✓ buildConfig (${configType})`));
        }
        if (plugin.build.beforeBuild)
          console.log(chalk.gray("    ✓ beforeBuild"));
        if (plugin.build.afterBuild)
          console.log(chalk.gray("    ✓ afterBuild"));
      }

      if (plugin.websocket) {
        console.log(chalk.gray("  WebSocket:"));
        if (plugin.websocket.onOpen) console.log(chalk.gray("    ✓ onOpen"));
        if (plugin.websocket.onMessage)
          console.log(chalk.gray("    ✓ onMessage"));
        if (plugin.websocket.onClose) console.log(chalk.gray("    ✓ onClose"));
      }

      if (plugin.fileSystemWatchDir) {
        console.log(chalk.gray("  File System:"));
        console.log(
          chalk.gray(
            `    ✓ Watching ${plugin.fileSystemWatchDir.length} director${
              plugin.fileSystemWatchDir.length === 1 ? "y" : "ies"
            }`
          )
        );
      }

      if (plugin.requirement) {
        console.log(chalk.green("\nRequirements:"));
        if (plugin.requirement.frameMasterVersion) {
          console.log(
            chalk.gray(
              `  Frame-Master: ${plugin.requirement.frameMasterVersion}`
            )
          );
        }
        if (plugin.requirement.bunVersion) {
          console.log(chalk.gray(`  Bun: ${plugin.requirement.bunVersion}`));
        }
        if (plugin.requirement.frameMasterPlugins) {
          console.log(chalk.gray("  Required Plugins:"));
          Object.entries(plugin.requirement.frameMasterPlugins).forEach(
            ([name, version]) => {
              console.log(chalk.gray(`    - ${name}: ${version}`));
            }
          );
        }
      }

      if (plugin.directives) {
        console.log(chalk.green("\nDirectives:"));
        plugin.directives.forEach((directive: any) => {
          console.log(chalk.gray(`  - ${directive.name}`));
        });
      }

      console.log("");
    } catch (error) {
      console.error(
        chalk.red("Error getting plugin info:"),
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

/**
 * Validate the current configuration
 */
pluginCommand
  .command("validate")
  .description("Validate plugin configuration and requirements")
  .action(async () => {
    try {
      console.log(chalk.bold.blue("\n🔍 Validating configuration...\n"));
      await InitConfig();
      const config = getConfig();
      const plugins = config!.plugins;
      let errors = 0;
      let warnings = 0;

      // Check for duplicate plugin names
      const pluginNames = plugins.map((p: any) => p.name);
      const duplicates = pluginNames.filter(
        (name: any, index: number) => pluginNames.indexOf(name) !== index
      );

      if (duplicates.length > 0) {
        console.log(
          chalk.red(`✗ Duplicate plugins found: ${duplicates.join(", ")}`)
        );
        errors++;
      }

      // Validate plugin requirements
      for (const plugin of plugins) {
        if (plugin.requirement) {
          // Check Frame-Master version
          if (plugin.requirement.frameMasterVersion) {
            const frameMasterPkg = _packageJson_;
            const currentVersion = frameMasterPkg.version;

            if (
              !Bun.semver.satisfies(
                currentVersion,
                plugin.requirement.frameMasterVersion
              )
            ) {
              console.log(
                chalk.red(
                  `✗ ${plugin.name}: requires Frame-Master ${plugin.requirement.frameMasterVersion}, but ${currentVersion} is installed`
                )
              );
              errors++;
            }
          }

          // Check Bun version
          if (plugin.requirement.bunVersion) {
            if (
              !Bun.semver.satisfies(Bun.version, plugin.requirement.bunVersion)
            ) {
              console.log(
                chalk.red(
                  `✗ ${plugin.name}: requires Bun ${plugin.requirement.bunVersion}, but ${Bun.version} is installed`
                )
              );
              errors++;
            }
          }

          // Check required plugins
          if (plugin.requirement.frameMasterPlugins) {
            for (const [requiredName, requiredVersion] of Object.entries(
              plugin.requirement.frameMasterPlugins
            )) {
              const requiredPlugin = plugins.find(
                (p: any) => p.name === requiredName
              );

              if (!requiredPlugin) {
                console.log(
                  chalk.red(
                    `✗ ${plugin.name}: requires plugin "${requiredName}" which is not installed`
                  )
                );
                errors++;
              } else if (
                !Bun.semver.satisfies(
                  requiredPlugin.version,
                  requiredVersion as string
                )
              ) {
                console.log(
                  chalk.red(
                    `✗ ${plugin.name}: requires "${requiredName}" ${requiredVersion}, but ${requiredPlugin.version} is installed`
                  )
                );
                errors++;
              }
            }
          }
        }

        // Check for plugins without version
        if (!plugin.version) {
          console.log(
            chalk.yellow(
              `⚠ ${plugin.name}: missing version field (recommended)`
            )
          );
          warnings++;
        }
      }

      // Check for conflicting priorities
      const priorities = plugins
        .filter((p: any) => p.priority !== undefined)
        .map((p: any) => ({ name: p.name, priority: p.priority! }));

      const duplicatePriorities = priorities.filter(
        (p1: any, index: number) =>
          priorities.findIndex((p2: any) => p2.priority === p1.priority) !==
          index
      );

      if (duplicatePriorities.length > 0) {
        console.log(
          chalk.yellow(
            `⚠ Multiple plugins share the same priority: ${duplicatePriorities
              .map((p: any) => `${p.name} (${p.priority})`)
              .join(", ")}`
          )
        );
        warnings++;
      }

      console.log("");

      if (errors === 0 && warnings === 0) {
        console.log(chalk.green("✓ Configuration is valid!\n"));
      } else {
        if (errors > 0) {
          console.log(
            chalk.red(`Found ${errors} error${errors === 1 ? "" : "s"}`)
          );
        }
        if (warnings > 0) {
          console.log(
            chalk.yellow(
              `Found ${warnings} warning${warnings === 1 ? "" : "s"}`
            )
          );
        }
        console.log("");

        if (errors > 0) {
          process.exit(1);
        }
      }
    } catch (error) {
      console.error(
        chalk.red("Error validating configuration:"),
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

const formatTemplateFile = (fileContent: string, pluginName: string) =>
  fileContent
    .replaceAll(/__PluginName__/g, pluginName)
    .replaceAll(/__CleanPluginName__/g, pluginName.replace(/-/g, ""));

/**
 * Create a new plugin template
 */
pluginCommand
  .command("create <name>")
  .description("Create a new plugin template")
  .option("-d, --dir <directory>", "Output directory", "./")
  .action(async (name: string, options: { dir: string }) => {
    try {
      const pluginDir = join(options.dir, name);
      const pluginFileName = join(pluginDir, "index.ts");

      console.log(chalk.bold.blue(`\n📦 Creating plugin "${name}"...\n`));

      // Create plugin template
      onVerbose(() => console.log(chalk.gray("Reading plugin template...")));
      const template = await Bun.file(
        join(import.meta.dir, "plugin-template.ts")
      )
        .text()
        .then((content) => formatTemplateFile(content, name));

      // Write plugin file
      onVerbose(() => console.log(chalk.gray(`Writing ${pluginFileName}...`)));
      await Bun.write(pluginFileName, template);

      // Create package.json
      const packageJson = {
        name: name,
        version: "0.1.0",
        type: "module",
        main: "index.ts",
        peerDependencies: {
          "frame-master": `^${_packageJson_.version}`,
        },
      };

      onVerbose(() =>
        console.log(chalk.gray(`Writing ${join(pluginDir, "package.json")}...`))
      );
      await Bun.write(
        join(pluginDir, "package.json"),
        JSON.stringify(packageJson, null, 2)
      );

      // Create README
      onVerbose(() => console.log(chalk.gray("Reading README template...")));
      const readme = await Bun.file(join(import.meta.dir, "README.template.md"))
        .text()
        .then((content) => formatTemplateFile(content, name));

      onVerbose(() =>
        console.log(chalk.gray(`Writing ${join(pluginDir, "README.md")}...`))
      );
      await Bun.write(join(pluginDir, "README.md"), readme);

      console.log(chalk.green("✓ Plugin created successfully!\n"));
      console.log(chalk.gray("Files created:"));
      console.log(chalk.gray(`  ${pluginFileName}`));
      console.log(chalk.gray(`  ${join(pluginDir, "package.json")}`));
      console.log(chalk.gray(`  ${join(pluginDir, "README.md")}`));
      console.log("");
      console.log(chalk.blue("Next steps:"));
      console.log(chalk.gray(`  cd ${pluginDir}`));
      console.log(chalk.gray("  # Edit index.ts to implement your plugin"));
      console.log(
        chalk.gray("  # Add to your frame-master.config.ts when ready to use\n")
      );
    } catch (error) {
      console.error(
        chalk.red("Error creating plugin:"),
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

export default pluginCommand;
