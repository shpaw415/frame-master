import {
  describe,
  test,
  expect,
  mock,
  beforeAll,
  afterAll,
  afterEach,
} from "bun:test";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync, mkdirSync, rmSync } from "fs";
import { c } from "tar";

const TEST_DIR = join(tmpdir(), `frame-master-template-test-${Date.now()}`);
let tarFilePath: string;
beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterAll(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

afterEach(() => {
  Bun.file(tarFilePath)
    .delete()
    .catch(() => {
      console.log("No temp tar file to delete");
    });
});

describe("Create Project from Template", () => {
  test("should resolve template from API and download", async () => {
    const templateName = "cloudflare-react-tailwind";
    const projectName = "test-template-project";
    const projectPath = join(TEST_DIR, projectName);

    // Mock fetch
    const originalFetch = global.fetch;
    const mockFetch = mock(async (url: string | Request | URL) => {
      const urlStr = url.toString();

      // Mock Template API
      if (urlStr.includes("/api/templates/")) {
        return new Response(
          JSON.stringify({
            githubRepoUrl: "https://github.com/shpaw415/frame-master-templates",
          }),
          { status: 200 }
        );
      }

      // Mock GitHub Releases API
      if (urlStr.includes("api.github.com/repos")) {
        return new Response(
          JSON.stringify([
            {
              tag_name: "1.0.0",
              tarball_url: "https://example.com/template.tar.gz",
            },
          ]),
          { status: 200 }
        );
      }

      // Mock Tarball Download
      if (urlStr === "https://example.com/template.tar.gz") {
        tarFilePath = join(tmpdir(), `template-${Date.now()}.tar.gz`);
        const tarFile = await c({ gzip: true, file: tarFilePath }, [
          join(__dirname, "mock-template-dir"),
        ]).then(() => Bun.file(tarFilePath));
        return new Response(tarFile, { status: 200 });
      }

      return new Response("Not Found", { status: 404 });
    });
    global.fetch = mockFetch as any;

    // Import the module dynamically to ensure mocks are applied
    const CreateProject = (await import("../../bin/create")).default;

    // Run the function
    // We need to change cwd temporarily or pass absolute path
    // The CreateProject function uses process.cwd() joined with name
    // So we should change process.cwd() to TEST_DIR
    const originalCwd = process.cwd();
    process.chdir(TEST_DIR);

    try {
      await CreateProject({
        name: projectName,
        type: "template",
        template: templateName,
      });
    } finally {
      process.chdir(originalCwd);
      global.fetch = originalFetch;
    }

    // Verify fetch calls
    expect(mockFetch).toHaveBeenCalled();
    const calls = mockFetch.mock.calls;
    const apiCall = calls.find((call) =>
      call[0].toString().includes("/api/templates/")
    );
    expect(apiCall).toBeDefined();

    // Verify directory creation (it should exist because we are not mocking fs.mkdirSync completely, just letting it run in temp dir)
    expect(existsSync(projectPath)).toBe(true);
  });

  test("should handle template not found", async () => {
    const templateName = "non-existent-template";
    const projectName = "test-fail-project";

    const originalFetch = global.fetch;
    const mockFetch = mock(async () => {
      return new Response("Not Found", {
        status: 404,
        statusText: "Not Found",
      });
    });
    global.fetch = mockFetch as any;

    // Mock process.exit to prevent test from exiting
    const originalExit = process.exit;
    const mockExit = mock((code?: number) => {
      throw new Error(`Process exited with code ${code}`);
    });
    // @ts-ignore
    process.exit = mockExit;

    const CreateProject = (await import("../../bin/create/index")).default;

    const originalCwd = process.cwd();
    process.chdir(TEST_DIR);

    try {
      await CreateProject({
        name: projectName,
        type: "minimal",
        template: templateName,
      });
    } catch (e: any) {
      expect(e.message).toContain("Process exited with code 1");
    } finally {
      process.chdir(originalCwd);
      global.fetch = originalFetch;
      process.exit = originalExit;
    }

    expect(mockFetch).toHaveBeenCalled();
  });
});
