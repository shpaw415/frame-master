import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { pluginRegex, isVerbose, isBuildMode, onVerbose } from "../src/utils";
import { join } from "path";

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
      join(process.cwd(), "src", "components", "Button.tsx"),
    ].map((path) => {
      expect(regex.test(path)).toBe(false);
    });
  });

  describe("isVerbose", () => {
    const originalVerbose = process.env.FRAME_MASTER_VERBOSE;

    afterEach(() => {
      if (originalVerbose === undefined) {
        delete process.env.FRAME_MASTER_VERBOSE;
      } else {
        process.env.FRAME_MASTER_VERBOSE = originalVerbose;
      }
    });

    test("returns true when FRAME_MASTER_VERBOSE is 'true'", () => {
      process.env.FRAME_MASTER_VERBOSE = "true";
      expect(isVerbose()).toBe(true);
    });

    test("returns false when FRAME_MASTER_VERBOSE is not set", () => {
      delete process.env.FRAME_MASTER_VERBOSE;
      expect(isVerbose()).toBe(false);
    });

    test("returns false when FRAME_MASTER_VERBOSE is 'false'", () => {
      process.env.FRAME_MASTER_VERBOSE = "false";
      expect(isVerbose()).toBe(false);
    });

    test("returns false when FRAME_MASTER_VERBOSE is any other value", () => {
      process.env.FRAME_MASTER_VERBOSE = "1";
      expect(isVerbose()).toBe(false);
    });
  });

  describe("isBuildMode", () => {
    const originalBuildMode = process.env.BUILD_MODE;

    afterEach(() => {
      if (originalBuildMode === undefined) {
        delete process.env.BUILD_MODE;
      } else {
        process.env.BUILD_MODE = originalBuildMode;
      }
    });

    test("returns true when BUILD_MODE is 'true'", () => {
      process.env.BUILD_MODE = "true";
      expect(isBuildMode()).toBe(true);
    });

    test("returns false when BUILD_MODE is not set", () => {
      delete process.env.BUILD_MODE;
      expect(isBuildMode()).toBe(false);
    });

    test("returns false when BUILD_MODE is 'false'", () => {
      process.env.BUILD_MODE = "false";
      expect(isBuildMode()).toBe(false);
    });
  });

  describe("onVerbose", () => {
    const originalVerbose = process.env.FRAME_MASTER_VERBOSE;

    afterEach(() => {
      if (originalVerbose === undefined) {
        delete process.env.FRAME_MASTER_VERBOSE;
      } else {
        process.env.FRAME_MASTER_VERBOSE = originalVerbose;
      }
    });

    test("executes callback when verbose is enabled", () => {
      process.env.FRAME_MASTER_VERBOSE = "true";
      let executed = false;
      onVerbose(() => {
        executed = true;
      });
      expect(executed).toBe(true);
    });

    test("does not execute callback when verbose is disabled", () => {
      delete process.env.FRAME_MASTER_VERBOSE;
      let executed = false;
      onVerbose(() => {
        executed = true;
      });
      expect(executed).toBe(false);
    });

    test("handles string argument when verbose is enabled", () => {
      process.env.FRAME_MASTER_VERBOSE = "true";
      // Just ensure it doesn't throw
      expect(() => onVerbose("test message")).not.toThrow();
    });

    test("handles string argument when verbose is disabled", () => {
      delete process.env.FRAME_MASTER_VERBOSE;
      expect(() => onVerbose("test message")).not.toThrow();
    });
  });
});
