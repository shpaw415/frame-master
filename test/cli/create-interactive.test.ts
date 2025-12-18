import { describe, test, expect, mock, beforeAll, afterAll } from "bun:test";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync, mkdirSync, rmSync } from "fs";

// Mock Bun.$
const originalBunShell = Bun.$;
// @ts-ignore
Bun.$ = () =>
  ({
    cwd: () => Promise.resolve() as any,
  } as any);

const TEST_DIR = join(tmpdir(), `frame-master-interactive-test-${Date.now()}`);
const FRAME_MASTER_CLI_PATH = join(__dirname, "../../bin/index.ts");

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

    const proc = Bun.spawn({
      cmd: ["bun", FRAME_MASTER_CLI_PATH, "create", "--type", "minimal"],
      cwd: TEST_DIR,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    // Simulate user input
    const inputs = [`${projectName}\n`];

    proc.stdin.write(inputs.join(""));

    await proc.exited;

    const out = Bun.stripANSI(await new Response(proc.stdout).text());

    expect(out).toContain(
      `Successfully created minimal Frame Master project: interactive-project`
    );

    // Verify directory creation (it should exist because we are not mocking fs.mkdirSync completely)
    expect(existsSync(projectPath)).toBe(true);
  });
});
