import chalk from "chalk";

// Re-export from utils for CLI internal use
export { isVerbose, isBuildMode, onVerbose } from "../src/utils";

export const ensureNodeEnv = () => {
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
          chalk.cyan("  $ NODE_ENV=development frame-master start          ") +
          chalk.bold.red("  │"),
        chalk.bold.red("│") +
          "  " +
          chalk.cyan("  $ NODE_ENV=production frame-master start           ") +
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
