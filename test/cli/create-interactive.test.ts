import { describe, test, expect, mock, beforeAll, afterAll } from "bun:test";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync, mkdirSync, rmSync } from "fs";

// Mock prompts
mock.module("prompts", () => {
  return {
    default: async (questions: any) => {
      if (questions.name === "name") {
        return { name: "interactive-project" };
      }
      if (questions.name === "type") {
        return { type: "minimal" };
      }
      return {};
    },
  };
});

// Mock Bun.$
const originalBunShell = Bun.$;
// @ts-ignore
Bun.$ = () =>
  ({
    cwd: () => Promise.resolve() as any,
  } as any);

const TEST_DIR = join(tmpdir(), `frame-master-interactive-test-${Date.now()}`);

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterAll(() => {
  // Restore Bun.$
  // @ts-ignore
  Bun.$ = originalBunShell;
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe("Create Project Interactive", () => {
  test("should prompt for name and type when not provided", async () => {
    const projectName = "interactive-project";
    const projectPath = join(TEST_DIR, projectName);

    // Import the module dynamically to ensure mocks are applied
    const CreateProject = (await import("../../bin/create/index")).default;

    const originalCwd = process.cwd();
    process.chdir(TEST_DIR);

    try {
      // Call with empty name to trigger prompts
      // @ts-ignore
      await CreateProject({ type: "minimal" });
    } finally {
      process.chdir(originalCwd);
    }

    // Verify directory creation (it should exist because we are not mocking fs.mkdirSync completely)
    expect(existsSync(projectPath)).toBe(true);
  });
});
