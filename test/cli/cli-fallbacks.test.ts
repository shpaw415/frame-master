import { describe, test, expect } from "bun:test";

const RUN_CLIFALLBACKS_PATH = ["bun", "./test/cli/cli-fallback.ts"];

describe("fallbackText function works correctly", () => {
  test("should ask for text input using fallbackText", async () => {
    const proc = Bun.spawn({
      cmd: [...RUN_CLIFALLBACKS_PATH, "--text"],
      cwd: process.cwd(),
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    proc.stdin.write("test-project\n");
    await proc.exited;
    const err = await new Response(proc.stderr).text();
    const out = await new Response(proc.stdout).text();
    expect(err).toBe("");
    expect(out).toContain("This is a fallback text prompt message.");
    expect(out).toContain("Result: test-project");
  });
  test("should return default value when no input is given in fallbackText", async () => {
    const proc = Bun.spawn({
      cmd: [...RUN_CLIFALLBACKS_PATH, "--text"],
      cwd: process.cwd(),
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    proc.stdin.write("\n");
    await proc.exited;
    const err = await new Response(proc.stderr).text();
    const out = await new Response(proc.stdout).text();
    expect(err).toBe("");
    expect(out).toContain("This is a fallback text prompt message.");
    expect(out).toContain("Result: my-project");
  });
  test("should throw error on validation failure in fallbackText", async () => {
    const proc = Bun.spawn({
      cmd: [...RUN_CLIFALLBACKS_PATH, "--text-validate-throw"],
      cwd: process.cwd(),
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    proc.stdin.write("abc\n");
    await proc.exited;
    const err = await new Response(proc.stderr).text();
    const out = await new Response(proc.stdout).text();
    expect(err).toContain("Input must be at least 5 characters long.");
    expect(out).toContain(
      "This is a fallback text prompt message with validation."
    );
  });
  test("should retry on validation failure in fallbackText", async () => {
    const proc = Bun.spawn({
      cmd: [...RUN_CLIFALLBACKS_PATH, "--text-validate-retry"],
      cwd: process.cwd(),
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    proc.stdin.write("abc\nvalidInput\n");
    await proc.exited;
    const err = await new Response(proc.stderr).text();
    const out = await new Response(proc.stdout).text();
    expect(err).not.toContain("Input must be at least 5 characters long.");
    expect(out).toContain(
      "This is a fallback text prompt message with validation."
    );
    expect(out).toContain("Result: validInput");
  });
});

describe("fallbackSelect function works correctly", () => {
  test("should select an option using fallbackSelect", async () => {
    const proc = Bun.spawn({
      cmd: [...RUN_CLIFALLBACKS_PATH, "--select"],
      cwd: process.cwd(),
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    proc.stdin.write("2\n");
    await proc.exited;
    const err = await new Response(proc.stderr).text();
    const out = await new Response(proc.stdout).text();
    expect(err).toBe("");
    expect(out).toContain("This is a fallback select prompt message.");
    expect(out).toContain("Result: option2");
  });
  test("should return initial value when no input is given in fallbackSelect", async () => {
    const proc = Bun.spawn({
      cmd: [...RUN_CLIFALLBACKS_PATH, "--select"],
      cwd: process.cwd(),
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    proc.stdin.write("\n");
    await proc.exited;
    const err = await new Response(proc.stderr).text();
    const out = await new Response(proc.stdout).text();
    expect(err).toBe("");
    expect(out).toContain("This is a fallback select prompt message.");
    expect(out).toContain("Result: option1");
  });
});
