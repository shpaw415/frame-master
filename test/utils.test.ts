import { describe, expect, test } from "bun:test";
import { pluginRegex } from "../src/utils";

describe("utils tests", () => {
  test("pluginRegex creates correct regex", () => {
    const regex = pluginRegex({
      path: ["src", "components"],
      ext: ["ts", "tsx"],
    });

    [
      "src/components/Button.tsx",
      "src/components/utils/helper.ts",
      "src/components/index.ts",
    ].map((path) => {
      expect(regex.test(path)).toBe(true);
    });

    [
      "src/pages/index.tsx",
      "src/components/style.css",
      "src/components/subdir/image.png",
      "src/components2/Button.tsx",
    ].map((path) => {
      expect(regex.test(path)).toBe(false);
    });
  });
});
