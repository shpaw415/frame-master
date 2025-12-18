import chalk from "chalk";
import {
  text as _text,
  select as _select,
  type TextOptions,
  type SelectOptions,
} from "@clack/prompts";
import { platform } from "node:os";

export const BASE_URL = "https://frame-master.com";

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

export function onVerbose(callback: (() => void | Promise<void>) | string) {
  if (process.env.FRAME_MASTER_VERBOSE !== "true") return;
  if (typeof callback === "string") {
    console.log(callback);
    return;
  }
  return callback();
}

const S = {
  info: chalk.blue("ℹ"),
  success: chalk.green("✔"),
  question: chalk.cyan("?"),
  error: chalk.red("✖"),
  pointer: chalk.gray("›"),
};

export function fallbackText(opt: TextOptions): string | symbol {
  // 1. Clearer header with a question symbol
  console.log(`\n${S.question} ${chalk.bold(opt.message)}`);

  const placeholder = opt.placeholder ? chalk.dim(`(${opt.placeholder})`) : "";
  const res = prompt(`${S.pointer} ${placeholder} `, opt.defaultValue);

  if (!res) {
    return opt.defaultValue ?? Symbol("no-input");
  }

  if (opt.validate) {
    const validated = opt.validate(res);
    if (typeof validated === "undefined") {
      return res;
    } else if (typeof validated === "string") {
      // 2. Styled error message with padding
      console.log(`  ${S.error} ${chalk.red.italic(validated)}\n`);
      return fallbackText(opt);
    } else if (validated instanceof Error) {
      throw validated;
    }
  }
  return res;
}

export function fallbackSelect<Value>(
  opt: SelectOptions<Value>
): Promise<symbol | Value> {
  // 1. Header with bolding
  console.log(`\n${S.question} ${chalk.bold(opt.message)}`);

  // 2. Styled options list
  opt.options.forEach((o, idx) => {
    const num = chalk.cyan(`${idx + 1}.`);
    const label = chalk.white(o.label);
    const hint = o.hint ? chalk.dim(` (${o.hint})`) : "";
    console.log(`   ${num} ${label}${hint}`);
  });

  console.log(chalk.dim(`  (Enter the number of your choice)`));

  const foundInitalOption = opt.initialValue
    ? opt.options.find(({ value }) => value === opt.initialValue)
    : null;

  if (!foundInitalOption && opt.initialValue !== undefined) {
    throw new Error("Initial value does not match any option values.");
  }

  const res = prompt(
    ` ${S.pointer} `,
    opt.initialValue
      ? String(
          opt.options.findIndex(({ value }) => value === opt.initialValue) + 1
        )
      : undefined
  );

  return Promise.resolve(
    res === undefined
      ? opt.initialValue ?? Symbol("no-selection")
      : opt.options[Number(res) - 1]?.value ?? Symbol("no-selection")
  );
}

export const { text, select } = { text: fallbackText, select: fallbackSelect };
