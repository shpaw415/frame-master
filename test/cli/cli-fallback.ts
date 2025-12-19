import { argv } from "bun";
import { fallbackText, fallbackSelect } from "../../bin/share";

type actionList =
  | "text"
  | "select"
  | "text-validate-throw"
  | "text-validate-retry";

function onAction(action: actionList, fn: () => any) {
  if (!argv.includes(`--${action}`)) return;
  fn();
  process.exit(0);
}

onAction("text", () => {
  const result = fallbackText({
    message: "This is a fallback text prompt message.",
    placeholder: "Enter something...",
    defaultValue: "my-project",
  });
  console.log("Result:", result);
});

onAction("text-validate-throw", () => {
  const res = fallbackText({
    message: "This is a fallback text prompt message with validation.",
    validate: (input) => {
      if (!input || input.length < 5) {
        return new Error("Input must be at least 5 characters long.");
      }
      return undefined;
    },
  });
  console.log("Result:", res);
});
onAction("text-validate-retry", () => {
  const res = fallbackText({
    message: "This is a fallback text prompt message with validation.",
    validate: (input) => {
      if (!input || input.length < 5) {
        return "Input must be at least 5 characters long.";
      }
    },
  });
  console.log("Result:", res);
});

onAction("select", () => {
  const result = fallbackSelect({
    initialValue: "option1",
    maxItems: 5,
    message: "This is a fallback select prompt message.",
    options: [
      { label: "Option 1", value: "option1", hint: "The first option" },
      { label: "Option 2", value: "option2", hint: "The second option" },
      { label: "Option 3", value: "option3", hint: "The third option" },
    ],
  });
  console.log("Result:", result);
});
