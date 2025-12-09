import { describe, it, expect, beforeEach } from "bun:test";
import {
  FilePool,
  wrapPluginForPool,
  getPooledContents,
  type PooledOnLoadResult,
} from "../src/plugins/file-pool";
import type { BunPlugin } from "bun";

describe("FilePool", () => {
  let pool: FilePool;

  beforeEach(() => {
    pool = new FilePool();
  });

  describe("register", () => {
    it("should register handlers to the pool", () => {
      const handler = async () => ({ contents: "test", loader: "ts" as const });

      pool.register("test-plugin", 0, { filter: /\.ts$/ }, handler);

      expect(pool.size).toBe(1);
    });

    it("should register multiple handlers", () => {
      const handler1 = async () => ({
        contents: "test1",
        loader: "ts" as const,
      });
      const handler2 = async () => ({
        contents: "test2",
        loader: "ts" as const,
      });

      pool.register("plugin-a", 0, { filter: /\.ts$/ }, handler1);
      pool.register("plugin-b", 1, { filter: /\.tsx$/ }, handler2);

      expect(pool.size).toBe(2);
    });
  });

  describe("groupCount", () => {
    it("should group handlers by namespace, not by filter", () => {
      const handler = async () => ({ contents: "test", loader: "ts" as const });

      // Different filters but same namespace (default) - should be in same group
      pool.register("plugin-a", 0, { filter: /\.ts$/ }, handler);
      pool.register("plugin-b", 1, { filter: /\.tsx$/ }, handler);
      pool.register("plugin-c", 2, { filter: /index\.tsx$/ }, handler);

      // All in default namespace = 1 group
      expect(pool.groupCount).toBe(1);
    });

    it("should create separate groups for different namespaces", () => {
      const handler = async () => ({ contents: "test", loader: "ts" as const });

      pool.register(
        "plugin-a",
        0,
        { filter: /\.ts$/, namespace: "ns1" },
        handler
      );
      pool.register(
        "plugin-b",
        1,
        { filter: /\.ts$/, namespace: "ns2" },
        handler
      );
      pool.register("plugin-c", 2, { filter: /\.ts$/ }, handler); // default namespace

      expect(pool.groupCount).toBe(3);
    });
  });

  describe("testMatchingHandlers", () => {
    it("should match handlers based on file path", () => {
      const handler = async () => ({ contents: "test", loader: "ts" as const });

      pool.register("plugin-tsx", 0, { filter: /\.tsx$/ }, handler);
      pool.register("plugin-index", 1, { filter: /index\.tsx$/ }, handler);
      pool.register("plugin-ts", 2, { filter: /\.ts$/ }, handler);

      // index.tsx should match both .tsx and index.tsx handlers
      const indexMatches = pool.testMatchingHandlers("src/index.tsx");
      expect(indexMatches.length).toBe(2);
      expect(indexMatches[0]?.pluginName).toBe("plugin-tsx");
      expect(indexMatches[1]?.pluginName).toBe("plugin-index");

      // Button.tsx should only match .tsx handler
      const buttonMatches = pool.testMatchingHandlers("src/Button.tsx");
      expect(buttonMatches.length).toBe(1);
      expect(buttonMatches[0]?.pluginName).toBe("plugin-tsx");

      // utils.ts should only match .ts handler
      const utilsMatches = pool.testMatchingHandlers("src/utils.ts");
      expect(utilsMatches.length).toBe(1);
      expect(utilsMatches[0]?.pluginName).toBe("plugin-ts");
    });

    it("should respect namespace when matching", () => {
      const handler = async () => ({ contents: "test", loader: "ts" as const });

      pool.register("plugin-default", 0, { filter: /\.tsx$/ }, handler);
      pool.register(
        "plugin-virtual",
        1,
        { filter: /\.tsx$/, namespace: "virtual" },
        handler
      );

      // Default namespace
      const defaultMatches = pool.testMatchingHandlers("index.tsx", undefined);
      expect(defaultMatches.length).toBe(1);
      expect(defaultMatches[0]?.pluginName).toBe("plugin-default");

      // Virtual namespace
      const virtualMatches = pool.testMatchingHandlers("index.tsx", "virtual");
      expect(virtualMatches.length).toBe(1);
      expect(virtualMatches[0]?.pluginName).toBe("plugin-virtual");
    });

    it("should order matching handlers by priority", () => {
      const handler = async () => ({ contents: "test", loader: "ts" as const });

      pool.register("plugin-low-priority", 10, { filter: /\.tsx$/ }, handler);
      pool.register(
        "plugin-high-priority",
        0,
        { filter: /index\.tsx$/ },
        handler
      );
      pool.register("plugin-mid-priority", 5, { filter: /\.tsx$/ }, handler);

      const matches = pool.testMatchingHandlers("index.tsx");
      expect(matches.length).toBe(3);
      // Should be ordered by priority (0, 5, 10)
      expect(matches[0]?.pluginName).toBe("plugin-high-priority");
      expect(matches[1]?.pluginName).toBe("plugin-mid-priority");
      expect(matches[2]?.pluginName).toBe("plugin-low-priority");
    });
  });

  describe("getDebugInfo", () => {
    it("should return debug information about handlers", () => {
      const handler = async () => ({ contents: "test", loader: "ts" as const });

      pool.register("plugin-a", 0, { filter: /\.ts$/ }, handler);
      pool.register("plugin-b", 5, { filter: /\.tsx$/ }, handler);

      const info = pool.getDebugInfo();

      expect(info.totalHandlers).toBe(2);
      expect(info.namespaceGroups.length).toBe(1); // Both in default namespace
      expect(info.namespaceGroups[0]?.handlers.length).toBe(2);
      // Verify priority ordering
      expect(info.namespaceGroups[0]?.handlers[0]?.pluginName).toBe("plugin-a");
      expect(info.namespaceGroups[0]?.handlers[1]?.pluginName).toBe("plugin-b");
      // Verify combined filter includes both
      expect(info.namespaceGroups[0]?.combinedFilter).toContain("\\.ts");
      expect(info.namespaceGroups[0]?.combinedFilter).toContain("\\.tsx");
    });
  });

  describe("wrapPluginForPool", () => {
    it("should capture onLoad handlers from a BunPlugin", () => {
      const testPlugin: BunPlugin = {
        name: "test-bun-plugin",
        setup(build) {
          build.onLoad({ filter: /\.custom$/ }, async (args) => {
            const contents = await Bun.file(args.path).text();
            return { contents: contents + "// modified", loader: "ts" };
          });
        },
      };

      wrapPluginForPool(pool, "test-plugin", 0, testPlugin);

      expect(pool.size).toBe(1);
    });

    it("should capture multiple onLoad handlers from a plugin", () => {
      const testPlugin: BunPlugin = {
        name: "multi-handler-plugin",
        setup(build) {
          build.onLoad({ filter: /\.ts$/ }, async () => ({
            contents: "ts",
            loader: "ts" as const,
          }));
          build.onLoad({ filter: /\.tsx$/ }, async () => ({
            contents: "tsx",
            loader: "tsx" as const,
          }));
        },
      };

      wrapPluginForPool(pool, "test-plugin", 0, testPlugin);

      expect(pool.size).toBe(2);
    });
  });

  describe("createUnifiedPlugin", () => {
    it("should create a unified plugin with setup function", () => {
      const handler = async () => ({ contents: "test", loader: "ts" as const });
      pool.register("test-plugin", 0, { filter: /\.ts$/ }, handler);

      const unified = pool.createUnifiedPlugin("unified-test");

      expect(unified.name).toBe("unified-test");
      expect(typeof unified.setup).toBe("function");
    });
  });

  describe("clear", () => {
    it("should clear all handlers", () => {
      const handler = async () => ({ contents: "test", loader: "ts" as const });
      pool.register("test-plugin", 0, { filter: /\.ts$/ }, handler);

      expect(pool.size).toBe(1);

      pool.clear();

      expect(pool.size).toBe(0);
    });
  });
});

describe("getPooledContents", () => {
  it("should return pooled contents when available", async () => {
    const args = {
      path: "/test/file.ts",
      pooled: {
        contents: "pooled content",
        loader: "tsx",
      },
    } as any;

    const result = await getPooledContents(args);

    expect(result.contents).toBe("pooled content");
    expect(result.loader).toBe("tsx");
  });
});

describe("preventChaining", () => {
  let pool: FilePool;

  beforeEach(() => {
    pool = new FilePool();
  });

  it("should stop chain when handler returns preventChaining: true", async () => {
    const executionOrder: string[] = [];

    // Handler 1 (priority 0) - runs first, returns preventChaining
    pool.register(
      "plugin-first",
      0,
      { filter: /\.tsx$/ },
      async (): Promise<PooledOnLoadResult> => {
        executionOrder.push("first");
        return {
          contents: "stopped here",
          loader: "tsx",
          preventChaining: true,
        };
      }
    );

    // Handler 2 (priority 1) - should NOT run
    pool.register(
      "plugin-second",
      1,
      { filter: /\.tsx$/ },
      async (): Promise<PooledOnLoadResult> => {
        executionOrder.push("second");
        return { contents: "from second", loader: "tsx" };
      }
    );

    // Handler 3 (priority 2) - should NOT run
    pool.register(
      "plugin-third",
      2,
      { filter: /\.tsx$/ },
      async (): Promise<PooledOnLoadResult> => {
        executionOrder.push("third");
        return { contents: "from third", loader: "tsx" };
      }
    );

    // Create unified plugin and simulate execution
    const unified = pool.createUnifiedPlugin("test-pool");

    // Mock build object to capture the onLoad handler
    let capturedHandler: any;
    const mockBuild = {
      onLoad: (_opts: any, handler: any) => {
        capturedHandler = handler;
      },
    };

    unified.setup(mockBuild as any);

    // Execute the captured handler
    const result = await capturedHandler({ path: "test.tsx" });

    // Only first handler should have run
    expect(executionOrder).toEqual(["first"]);
    expect(result.contents).toBe("stopped here");
  });

  it("should continue chain when preventChaining is false or undefined", async () => {
    const executionOrder: string[] = [];

    pool.register(
      "plugin-first",
      0,
      { filter: /\.tsx$/ },
      async (): Promise<PooledOnLoadResult> => {
        executionOrder.push("first");
        return {
          contents: "from first",
          loader: "tsx",
          preventChaining: false,
        };
      }
    );

    pool.register(
      "plugin-second",
      1,
      { filter: /\.tsx$/ },
      async (): Promise<PooledOnLoadResult> => {
        executionOrder.push("second");
        return { contents: "from second", loader: "tsx" }; // no preventChaining
      }
    );

    pool.register(
      "plugin-third",
      2,
      { filter: /\.tsx$/ },
      async (): Promise<PooledOnLoadResult> => {
        executionOrder.push("third");
        return { contents: "from third", loader: "tsx" };
      }
    );

    const unified = pool.createUnifiedPlugin("test-pool");

    let capturedHandler: any;
    const mockBuild = {
      onLoad: (_opts: any, handler: any) => {
        capturedHandler = handler;
      },
    };

    unified.setup(mockBuild as any);
    const result = await capturedHandler({ path: "test.tsx" });

    // All handlers should have run
    expect(executionOrder).toEqual(["first", "second", "third"]);
    expect(result.contents).toBe("from third");
  });

  it("should stop chain in the middle", async () => {
    const executionOrder: string[] = [];

    pool.register(
      "plugin-first",
      0,
      { filter: /\.tsx$/ },
      async (): Promise<PooledOnLoadResult> => {
        executionOrder.push("first");
        return { contents: "from first", loader: "tsx" };
      }
    );

    pool.register(
      "plugin-second",
      1,
      { filter: /\.tsx$/ },
      async (): Promise<PooledOnLoadResult> => {
        executionOrder.push("second");
        return {
          contents: "stopped at second",
          loader: "html",
          preventChaining: true,
        };
      }
    );

    pool.register(
      "plugin-third",
      2,
      { filter: /\.tsx$/ },
      async (): Promise<PooledOnLoadResult> => {
        executionOrder.push("third");
        return { contents: "from third", loader: "tsx" };
      }
    );

    const unified = pool.createUnifiedPlugin("test-pool");

    let capturedHandler: any;
    const mockBuild = {
      onLoad: (_opts: any, handler: any) => {
        capturedHandler = handler;
      },
    };

    unified.setup(mockBuild as any);
    const result = await capturedHandler({ path: "test.tsx" });

    // First and second should run, third should NOT
    expect(executionOrder).toEqual(["first", "second"]);
    expect(result.contents).toBe("stopped at second");
    expect(result.loader).toBe("html");
  });
});
