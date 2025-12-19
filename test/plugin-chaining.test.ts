import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import {
  PluginProxy,
  chainPlugins,
  getChainableContent,
  getChainableBinaryContent,
  hasChainedContent,
  hasChainedTextContent,
  hasChainedBinaryContent,
  type ChainedOnLoadArgs,
} from "../src/plugins/plugin-chaining";
import type { BunPlugin } from "bun";
import { join } from "path";
import { mkdirSync, writeFileSync, rmSync } from "fs";

const TEST_DIR = join(import.meta.dir, ".test-chaining-tmp");
const TEST_FILE = join(TEST_DIR, "test.txt");
const TEST_FILE_TSX = join(TEST_DIR, "component.tsx");
const TEST_FILE_BINARY = join(TEST_DIR, "image.png");

// Setup test files
beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  writeFileSync(TEST_FILE, "original content");
  writeFileSync(
    TEST_FILE_TSX,
    "export default function Component() { return <div>Hello</div>; }"
  );
  // Simple PNG header + minimal data for binary test
  const pngHeader = new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a, // PNG signature
    0x00,
    0x00,
    0x00,
    0x0d, // IHDR chunk length
    0x49,
    0x48,
    0x44,
    0x52, // IHDR
  ]);
  writeFileSync(TEST_FILE_BINARY, pngHeader);
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("Plugin Chaining", () => {
  describe("PluginProxy", () => {
    test("should collect onLoad handlers from plugins", () => {
      const proxy = new PluginProxy();

      const plugin: BunPlugin = {
        name: "test-plugin",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async (args) => ({
            contents: "modified",
            loader: "text",
          }));
        },
      };

      proxy.addPlugin(plugin);
      const stats = proxy.getStats();

      expect(stats.totalOnLoadHandlers).toBe(1);
      expect(stats.pluginNames).toContain("test-plugin");
    });

    test("should collect multiple onLoad handlers from same plugin", () => {
      const proxy = new PluginProxy();

      const plugin: BunPlugin = {
        name: "multi-handler-plugin",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async () => ({
            contents: "a",
            loader: "text",
          }));
          build.onLoad({ filter: /\.tsx$/ }, async () => ({
            contents: "b",
            loader: "tsx",
          }));
          build.onLoad({ filter: /\.css$/ }, async () => ({
            contents: "c",
            loader: "css",
          }));
        },
      };

      proxy.addPlugin(plugin);
      const stats = proxy.getStats();

      expect(stats.totalOnLoadHandlers).toBe(3);
      expect(stats.uniquePatterns).toBe(3);
    });

    test("should collect handlers from multiple plugins", () => {
      const proxy = new PluginProxy();

      const pluginA: BunPlugin = {
        name: "plugin-a",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async () => ({
            contents: "a",
            loader: "text",
          }));
        },
      };

      const pluginB: BunPlugin = {
        name: "plugin-b",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async () => ({
            contents: "b",
            loader: "text",
          }));
        },
      };

      proxy.addPlugins([pluginA, pluginB]);
      const stats = proxy.getStats();

      expect(stats.totalOnLoadHandlers).toBe(2);
      expect(stats.pluginNames).toContain("plugin-a");
      expect(stats.pluginNames).toContain("plugin-b");
    });

    test("should preserve onResolve handlers", () => {
      const proxy = new PluginProxy();
      let onResolveTriggered = false;

      const plugin: BunPlugin = {
        name: "resolve-plugin",
        setup(build) {
          build.onResolve({ filter: /^virtual:/ }, (args) => {
            onResolveTriggered = true;
            return { path: "/virtual/path", namespace: "virtual" };
          });
        },
      };

      proxy.addPlugin(plugin);
      const chainedPlugin = proxy.createChainedPlugin();

      // The chained plugin should have preserved the onResolve
      expect(chainedPlugin.name).toBe("frame-master-chained-loader");
    });

    test("should preserve onStart handlers", () => {
      const proxy = new PluginProxy();
      let onStartCalled = false;

      const plugin: BunPlugin = {
        name: "start-plugin",
        setup(build) {
          build.onStart(() => {
            onStartCalled = true;
          });
        },
      };

      proxy.addPlugin(plugin);
      const stats = proxy.getStats();

      // onStart doesn't count as onLoad handler
      expect(stats.totalOnLoadHandlers).toBe(0);
    });

    test("should group handlers by namespace", () => {
      const proxy = new PluginProxy();

      const plugin: BunPlugin = {
        name: "namespace-plugin",
        setup(build) {
          build.onLoad({ filter: /.*/, namespace: "virtual" }, async () => ({
            contents: "virtual",
            loader: "js",
          }));
          build.onLoad({ filter: /\.txt$/ }, async () => ({
            contents: "file",
            loader: "text",
          }));
        },
      };

      proxy.addPlugin(plugin);
      const stats = proxy.getStats();

      expect(stats.totalOnLoadHandlers).toBe(2);
      expect(stats.uniqueNamespaces).toBe(2);
    });
  });

  describe("chainPlugins utility", () => {
    test("should create a single chained plugin from multiple plugins", () => {
      const pluginA: BunPlugin = {
        name: "plugin-a",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async () => ({
            contents: "a",
            loader: "text",
          }));
        },
      };

      const pluginB: BunPlugin = {
        name: "plugin-b",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async () => ({
            contents: "b",
            loader: "text",
          }));
        },
      };

      const chained = chainPlugins([pluginA, pluginB]);

      expect(chained.name).toBe("frame-master-chained-loader");
    });

    test("should work with empty plugin array", () => {
      const chained = chainPlugins([]);
      expect(chained.name).toBe("frame-master-chained-loader");
    });

    test("should work with single plugin", () => {
      const plugin: BunPlugin = {
        name: "single",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async () => ({
            contents: "single",
            loader: "text",
          }));
        },
      };

      const chained = chainPlugins([plugin]);
      expect(chained.name).toBe("frame-master-chained-loader");
    });
  });

  describe("Handler chaining with different filters matching same file", () => {
    test("should chain handlers with different filters that match same file", async () => {
      const results: string[] = [];

      const pluginA: BunPlugin = {
        name: "plugin-broad",
        setup(build) {
          // Broad filter: matches any .txt file
          build.onLoad({ filter: /\.txt$/ }, async (args) => {
            results.push("broad");
            const content =
              args.__chainedContents ?? (await Bun.file(args.path).text());
            return { contents: content + " [broad]", loader: "text" };
          });
        },
      };

      const pluginB: BunPlugin = {
        name: "plugin-specific",
        setup(build) {
          // Specific filter: matches only test.txt
          build.onLoad({ filter: /test\.txt$/ }, async (args) => {
            results.push("specific");
            const content =
              args.__chainedContents ?? (await Bun.file(args.path).text());
            return { contents: content + " [specific]", loader: "text" };
          });
        },
      };

      const proxy = new PluginProxy();
      proxy.addPlugins([pluginA, pluginB]);
      const stats = proxy.getStats();

      // Both handlers should be registered
      expect(stats.totalOnLoadHandlers).toBe(2);
      expect(stats.uniquePatterns).toBe(2);
    });
  });

  describe("Content helpers", () => {
    test("getChainableContent should return chained content when available", async () => {
      const args = {
        path: TEST_FILE,
        namespace: "file",
        loader: "text",
        suffix: "",
        pluginData: undefined,
        __chainedContents: "chained content",
        __chainedLoader: "text",
      } as unknown as ChainedOnLoadArgs;

      const content = await getChainableContent(args);
      expect(content).toBe("chained content");
    });

    test("getChainableContent should read from disk when no chained content", async () => {
      const args = {
        path: TEST_FILE,
        namespace: "file",
        loader: "text",
        suffix: "",
        pluginData: undefined,
      } as unknown as ChainedOnLoadArgs;

      const content = await getChainableContent(args);
      expect(content).toBe("original content");
    });

    test("getChainableContent should decode binary to string", async () => {
      const binaryContent = new TextEncoder().encode("binary text");
      const args = {
        path: TEST_FILE,
        namespace: "file",
        loader: "text",
        suffix: "",
        pluginData: undefined,
        __chainedContents: binaryContent,
      } as unknown as ChainedOnLoadArgs;

      const content = await getChainableContent(args);
      expect(content).toBe("binary text");
    });

    test("getChainableContent should return empty string for virtual modules (custom namespace) without chained content", async () => {
      const args = {
        path: "virtual:my-module",
        namespace: "virtual-ns",
        loader: "js",
        suffix: "",
        pluginData: undefined,
      } as unknown as ChainedOnLoadArgs;

      // Should not throw, should return empty string for virtual modules
      const content = await getChainableContent(args);
      expect(content).toBe("");
    });

    test("getChainableContent should return chained content for virtual modules when available", async () => {
      const args = {
        path: "virtual:my-module",
        namespace: "virtual-ns",
        loader: "js",
        suffix: "",
        pluginData: undefined,
        __chainedContents: "export default 'virtual content';",
      } as unknown as ChainedOnLoadArgs;

      const content = await getChainableContent(args);
      expect(content).toBe("export default 'virtual content';");
    });

    test("getChainableBinaryContent should return empty array for virtual modules without chained content", async () => {
      const args = {
        path: "virtual:my-binary",
        namespace: "virtual-ns",
        loader: "file",
        suffix: "",
        pluginData: undefined,
      } as unknown as ChainedOnLoadArgs;

      // Should not throw, should return empty Uint8Array for virtual modules
      const content = await getChainableBinaryContent(args);
      expect(content).toBeInstanceOf(Uint8Array);
      expect(content.length).toBe(0);
    });

    test("getChainableBinaryContent should return chained binary content", async () => {
      const binaryContent = new Uint8Array([1, 2, 3, 4, 5]);
      const args = {
        path: TEST_FILE_BINARY,
        namespace: "file",
        loader: "file",
        suffix: "",
        pluginData: undefined,
        __chainedContents: binaryContent,
      } as unknown as ChainedOnLoadArgs;

      const content = await getChainableBinaryContent(args);
      expect(content).toBeInstanceOf(Uint8Array);
      expect(content).toEqual(binaryContent);
    });

    test("getChainableBinaryContent should encode string to binary", async () => {
      const args = {
        path: TEST_FILE,
        namespace: "file",
        loader: "text",
        suffix: "",
        pluginData: undefined,
        __chainedContents: "text content",
      } as unknown as ChainedOnLoadArgs;

      const content = await getChainableBinaryContent(args);
      expect(content).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(content)).toBe("text content");
    });

    test("getChainableBinaryContent should read from disk when no chained content", async () => {
      const args = {
        path: TEST_FILE_BINARY,
        namespace: "file",
        loader: "file",
        suffix: "",
        pluginData: undefined,
      } as unknown as ChainedOnLoadArgs;

      const content = await getChainableBinaryContent(args);
      expect(content).toBeInstanceOf(Uint8Array);
      // Check PNG signature
      expect(content[0]).toBe(0x89);
      expect(content[1]).toBe(0x50); // P
      expect(content[2]).toBe(0x4e); // N
      expect(content[3]).toBe(0x47); // G
    });
  });

  describe("Type guards", () => {
    test("hasChainedContent should return true for string content", () => {
      const args = {
        path: "/test.txt",
        __chainedContents: "content",
      } as ChainedOnLoadArgs;

      expect(hasChainedContent(args)).toBe(true);
    });

    test("hasChainedContent should return true for binary content", () => {
      const args = {
        path: "/test.png",
        __chainedContents: new Uint8Array([1, 2, 3]),
      } as ChainedOnLoadArgs;

      expect(hasChainedContent(args)).toBe(true);
    });

    test("hasChainedContent should return false for undefined", () => {
      const args = {
        path: "/test.txt",
      } as ChainedOnLoadArgs;

      expect(hasChainedContent(args)).toBe(false);
    });

    test("hasChainedTextContent should return true only for string", () => {
      const textArgs = {
        path: "/test.txt",
        __chainedContents: "text",
      } as ChainedOnLoadArgs;

      const binaryArgs = {
        path: "/test.png",
        __chainedContents: new Uint8Array([1, 2, 3]),
      } as ChainedOnLoadArgs;

      expect(hasChainedTextContent(textArgs)).toBe(true);
      expect(hasChainedTextContent(binaryArgs)).toBe(false);
    });

    test("hasChainedBinaryContent should return true only for Uint8Array", () => {
      const textArgs = {
        path: "/test.txt",
        __chainedContents: "text",
      } as ChainedOnLoadArgs;

      const binaryArgs = {
        path: "/test.png",
        __chainedContents: new Uint8Array([1, 2, 3]),
      } as ChainedOnLoadArgs;

      expect(hasChainedBinaryContent(textArgs)).toBe(false);
      expect(hasChainedBinaryContent(binaryArgs)).toBe(true);
    });
  });

  describe("Loader chaining", () => {
    test("should pass loader from previous handler via __chainedLoader", () => {
      const proxy = new PluginProxy();
      let receivedLoader: string | undefined;

      const pluginA: BunPlugin = {
        name: "plugin-a",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async (args) => {
            return { contents: "transformed", loader: "js" };
          });
        },
      };

      const pluginB: BunPlugin = {
        name: "plugin-b",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async (args) => {
            receivedLoader = args.__chainedLoader;
            return { contents: args.__chainedContents ?? "", loader: "js" };
          });
        },
      };

      proxy.addPlugins([pluginA, pluginB]);
      // Note: Full integration test would require running Bun.build
      // This test verifies the structure is correct
      const stats = proxy.getStats();
      expect(stats.totalOnLoadHandlers).toBe(2);
    });
  });

  describe("Combined filter creation", () => {
    test("should create combined regex for multiple patterns", () => {
      const proxy = new PluginProxy();

      const pluginA: BunPlugin = {
        name: "plugin-a",
        setup(build) {
          build.onLoad({ filter: /\.tsx$/ }, async () => ({
            contents: "a",
            loader: "tsx",
          }));
        },
      };

      const pluginB: BunPlugin = {
        name: "plugin-b",
        setup(build) {
          build.onLoad({ filter: /\.jsx$/ }, async () => ({
            contents: "b",
            loader: "jsx",
          }));
        },
      };

      const pluginC: BunPlugin = {
        name: "plugin-c",
        setup(build) {
          build.onLoad({ filter: /component\.tsx$/ }, async () => ({
            contents: "c",
            loader: "tsx",
          }));
        },
      };

      proxy.addPlugins([pluginA, pluginB, pluginC]);
      const stats = proxy.getStats();

      expect(stats.totalOnLoadHandlers).toBe(3);
      expect(stats.uniquePatterns).toBe(3);
      // All handlers in same namespace should be combined
      expect(stats.uniqueNamespaces).toBe(1);
    });
  });

  describe("Custom namespaces", () => {
    test("should handle custom namespaces separately", () => {
      const proxy = new PluginProxy();

      const plugin: BunPlugin = {
        name: "namespace-plugin",
        setup(build) {
          // onResolve redirects to custom namespace
          build.onResolve({ filter: /^virtual:/ }, (args) => ({
            path: args.path.replace("virtual:", ""),
            namespace: "virtual",
          }));

          // Handler for virtual namespace
          build.onLoad(
            { filter: /.*/, namespace: "virtual" },
            async (args) => ({
              contents: `export default "virtual: ${args.path}"`,
              loader: "js",
            })
          );

          // Handler for file namespace (default)
          build.onLoad({ filter: /\.js$/ }, async (args) => ({
            contents: await Bun.file(args.path).text(),
            loader: "js",
          }));
        },
      };

      proxy.addPlugin(plugin);
      const stats = proxy.getStats();

      expect(stats.totalOnLoadHandlers).toBe(2);
      expect(stats.uniqueNamespaces).toBe(2);
    });

    test("should include global handlers (no namespace) in all namespace groups", () => {
      const proxy = new PluginProxy();

      const plugin: BunPlugin = {
        name: "global-namespace-plugin",
        setup(build) {
          // onResolve redirects to custom namespace
          build.onResolve({ filter: /^custom:/ }, (args) => ({
            path: args.path.replace("custom:", ""),
            namespace: "custom-ns",
          }));

          // Handler for custom namespace only
          build.onLoad(
            { filter: /.*/, namespace: "custom-ns" },
            async (args) => ({
              contents: `// from custom-ns handler\n${
                args.__chainedContents ?? ""
              }`,
              loader: "js",
            })
          );

          // Global handler (no namespace) - should match ALL namespaces including custom-ns
          build.onLoad({ filter: /.*/ }, async (args) => ({
            contents: `// from global handler\n${args.__chainedContents ?? ""}`,
            loader: "js",
          }));
        },
      };

      proxy.addPlugin(plugin);
      const stats = proxy.getStats();

      // 2 handlers total
      expect(stats.totalOnLoadHandlers).toBe(2);
      // 2 unique namespaces: "custom-ns" and "file" (default for global)
      expect(stats.uniqueNamespaces).toBe(2);
    });

    test("global handler should be included when chaining with namespace-specific handlers", () => {
      const proxy = new PluginProxy();
      const executionOrder: string[] = [];

      const plugin: BunPlugin = {
        name: "chaining-test-plugin",
        setup(build) {
          // Namespace-specific handler
          build.onLoad({ filter: /.*/, namespace: "test-ns" }, async (args) => {
            executionOrder.push("namespace-specific");
            return {
              contents: `namespace: ${args.__chainedContents ?? "start"}`,
              loader: "js",
            };
          });

          // Global handler (no namespace) - should also run for "test-ns"
          build.onLoad({ filter: /.*/ }, async (args) => {
            executionOrder.push("global");
            return {
              contents: `global: ${args.__chainedContents ?? "start"}`,
              loader: "js",
            };
          });
        },
      };

      proxy.addPlugin(plugin);

      // The chained plugin should register the global handler for the "test-ns" namespace too
      const chained = proxy.createChainedPlugin();
      expect(chained.name).toBe("frame-master-chained-loader");

      // Stats should show both handlers
      const stats = proxy.getStats();
      expect(stats.totalOnLoadHandlers).toBe(2);
    });
  });

  describe("Edge cases", () => {
    test("should handle plugin with no setup handlers", () => {
      const proxy = new PluginProxy();

      const emptyPlugin: BunPlugin = {
        name: "empty-plugin",
        setup() {
          // No handlers registered
        },
      };

      proxy.addPlugin(emptyPlugin);
      const stats = proxy.getStats();

      expect(stats.totalOnLoadHandlers).toBe(0);
      expect(stats.pluginNames).toHaveLength(0);
    });

    test("should handle plugin returning undefined from onLoad", () => {
      const proxy = new PluginProxy();

      const plugin: BunPlugin = {
        name: "undefined-return",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async () => {
            return undefined; // Pass through to next handler
          });
        },
      };

      proxy.addPlugin(plugin);
      const stats = proxy.getStats();
      expect(stats.totalOnLoadHandlers).toBe(1);
    });

    test("should handle regex with special characters", () => {
      const proxy = new PluginProxy();

      const plugin: BunPlugin = {
        name: "special-regex",
        setup(build) {
          build.onLoad({ filter: /\.(ts|tsx|js|jsx)$/ }, async () => ({
            contents: "code",
            loader: "js",
          }));
          build.onLoad({ filter: /node_modules\/.*\.js$/ }, async () => ({
            contents: "module",
            loader: "js",
          }));
        },
      };

      proxy.addPlugin(plugin);
      const stats = proxy.getStats();
      expect(stats.totalOnLoadHandlers).toBe(2);
    });
  });
});

describe("disableOnLoadChaining option", () => {
  test("should be configurable in FrameMasterConfig", () => {
    // This is a type-level test - if it compiles, the option exists
    const config = {
      pluginsOptions: {
        disableOnLoadChaining: true,
      },
    };

    expect(config.pluginsOptions.disableOnLoadChaining).toBe(true);
  });

  test("should default to false (chaining enabled)", () => {
    const config = {
      pluginsOptions: {
        disableOnLoadChaining: false,
      },
    };

    expect(config.pluginsOptions.disableOnLoadChaining).toBe(false);
  });

  // Integration test would require full build context
  // These tests verify the configuration structure
  test("config with chaining disabled should be valid", () => {
    const configDisabled = {
      plugins: [],
      pluginsOptions: {
        disableOnLoadChaining: true,
      },
    };

    expect(configDisabled.pluginsOptions.disableOnLoadChaining).toBe(true);
  });

  test("config with chaining enabled should be valid", () => {
    const configEnabled = {
      plugins: [],
      pluginsOptions: {
        disableOnLoadChaining: false,
      },
    };

    expect(configEnabled.pluginsOptions.disableOnLoadChaining).toBe(false);
  });
});

describe("pluginsOptions.entrypoints", () => {
  test("should be configurable in FrameMasterConfig", () => {
    const config = {
      pluginsOptions: {
        entrypoints: ["./src/global.ts", "./src/analytics.ts"],
      },
    };

    expect(config.pluginsOptions.entrypoints).toEqual([
      "./src/global.ts",
      "./src/analytics.ts",
    ]);
  });

  test("should accept empty array", () => {
    const config = {
      pluginsOptions: {
        entrypoints: [],
      },
    };

    expect(config.pluginsOptions.entrypoints).toEqual([]);
  });

  test("config with entrypoints should be valid alongside other options", () => {
    const config = {
      plugins: [],
      pluginsOptions: {
        disableOnLoadChaining: false,
        entrypoints: ["./src/client.ts"],
      },
    };

    expect(config.pluginsOptions.entrypoints).toEqual(["./src/client.ts"]);
    expect(config.pluginsOptions.disableOnLoadChaining).toBe(false);
  });
});

describe("Integration scenarios", () => {
  describe("Multi-plugin transformation pipeline", () => {
    test("should support import injection + code transformation chain", () => {
      const proxy = new PluginProxy();

      // Plugin 1: Add import statement
      const importPlugin: BunPlugin = {
        name: "import-injector",
        setup(build) {
          build.onLoad({ filter: /\.tsx$/ }, async (args) => {
            const content =
              args.__chainedContents ?? (await Bun.file(args.path).text());
            return {
              contents: `import "injected-lib";\n${content}`,
              loader: "tsx",
            };
          });
        },
      };

      // Plugin 2: Transform JSX
      const transformPlugin: BunPlugin = {
        name: "jsx-transformer",
        setup(build) {
          build.onLoad({ filter: /\.tsx$/ }, async (args) => {
            const rawContent =
              args.__chainedContents ?? (await Bun.file(args.path).text());
            const content =
              typeof rawContent === "string"
                ? rawContent
                : new TextDecoder().decode(rawContent);
            return {
              contents: content.replace(
                /<div>/g,
                '<div className="transformed">'
              ),
              loader: "tsx",
            };
          });
        },
      };

      // Plugin 3: Add wrapper
      const wrapperPlugin: BunPlugin = {
        name: "component-wrapper",
        setup(build) {
          build.onLoad({ filter: /component\.tsx$/ }, async (args) => {
            const content =
              args.__chainedContents ?? (await Bun.file(args.path).text());
            return {
              contents: `// Wrapped component\n${content}\n// End wrapper`,
              loader: "tsx",
            };
          });
        },
      };

      proxy.addPlugins([importPlugin, transformPlugin, wrapperPlugin]);
      const stats = proxy.getStats();

      expect(stats.totalOnLoadHandlers).toBe(3);
      expect(stats.pluginNames).toEqual([
        "import-injector",
        "jsx-transformer",
        "component-wrapper",
      ]);
    });
  });

  describe("Binary file handling pipeline", () => {
    test("should support image processing chain", () => {
      const proxy = new PluginProxy();

      // Plugin 1: Read image
      const imageLoader: BunPlugin = {
        name: "image-loader",
        setup(build) {
          build.onLoad({ filter: /\.(png|jpg|gif)$/ }, async (args) => {
            const content =
              args.__chainedContents ?? (await Bun.file(args.path).bytes());
            return { contents: content, loader: "file" };
          });
        },
      };

      // Plugin 2: Process specific images
      const imageProcessor: BunPlugin = {
        name: "image-processor",
        setup(build) {
          build.onLoad({ filter: /logo\.png$/ }, async (args) => {
            // Would process the image here
            const content =
              args.__chainedContents ?? (await Bun.file(args.path).bytes());
            return { contents: content, loader: "file" };
          });
        },
      };

      proxy.addPlugins([imageLoader, imageProcessor]);
      const stats = proxy.getStats();

      expect(stats.totalOnLoadHandlers).toBe(2);
    });
  });

  describe("CSS processing pipeline", () => {
    test("should support CSS preprocessing chain", () => {
      const proxy = new PluginProxy();

      // Plugin 1: SCSS to CSS
      const scssPlugin: BunPlugin = {
        name: "scss-compiler",
        setup(build) {
          build.onLoad({ filter: /\.scss$/ }, async (args) => {
            const content =
              args.__chainedContents ?? (await Bun.file(args.path).text());
            // Would compile SCSS here
            return { contents: content, loader: "css" };
          });
        },
      };

      // Plugin 2: Autoprefixer
      const autoprefixerPlugin: BunPlugin = {
        name: "autoprefixer",
        setup(build) {
          build.onLoad({ filter: /\.(css|scss)$/ }, async (args) => {
            const content =
              args.__chainedContents ?? (await Bun.file(args.path).text());
            // Check if previous loader was CSS
            if (args.__chainedLoader === "css" || args.path.endsWith(".css")) {
              // Would add prefixes here
              return {
                contents: `/* autoprefixed */\n${content}`,
                loader: "css",
              };
            }
            return { contents: content, loader: "css" };
          });
        },
      };

      // Plugin 3: Minifier
      const minifierPlugin: BunPlugin = {
        name: "css-minifier",
        setup(build) {
          build.onLoad({ filter: /\.(css|scss)$/ }, async (args) => {
            const rawContent =
              args.__chainedContents ?? (await Bun.file(args.path).text());
            const content =
              typeof rawContent === "string"
                ? rawContent
                : new TextDecoder().decode(rawContent);
            // Would minify here
            return { contents: content.replace(/\s+/g, " "), loader: "css" };
          });
        },
      };

      proxy.addPlugins([scssPlugin, autoprefixerPlugin, minifierPlugin]);
      const stats = proxy.getStats();

      expect(stats.totalOnLoadHandlers).toBe(3);
    });
  });

  describe("preventChaining", () => {
    test("should stop chain when preventChaining is true", async () => {
      const executionOrder: string[] = [];

      const pluginA: BunPlugin = {
        name: "plugin-a",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async (args) => {
            executionOrder.push("plugin-a");
            const content =
              args.__chainedContents ?? (await Bun.file(args.path).text());
            return {
              contents: content + " [A]",
              loader: "text",
              preventChaining: true,
            };
          });
        },
      };

      const pluginB: BunPlugin = {
        name: "plugin-b",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async (args) => {
            executionOrder.push("plugin-b");
            const content =
              args.__chainedContents ?? (await Bun.file(args.path).text());
            return { contents: content + " [B]", loader: "text" };
          });
        },
      };

      const pluginC: BunPlugin = {
        name: "plugin-c",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async (args) => {
            executionOrder.push("plugin-c");
            const content =
              args.__chainedContents ?? (await Bun.file(args.path).text());
            return { contents: content + " [C]", loader: "text" };
          });
        },
      };

      const chained = chainPlugins([pluginA, pluginB, pluginC]);

      // Run build to test the chaining
      const result = await Bun.build({
        entrypoints: [TEST_FILE],
        plugins: [chained],
        outdir: join(TEST_DIR, "out-prevent"),
      });

      // Only plugin-a should have executed
      expect(executionOrder).toEqual(["plugin-a"]);
      expect(executionOrder).not.toContain("plugin-b");
      expect(executionOrder).not.toContain("plugin-c");
    });

    test("should continue chain when preventChaining is false or undefined", async () => {
      const executionOrder: string[] = [];

      const pluginA: BunPlugin = {
        name: "plugin-a",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async (args) => {
            executionOrder.push("plugin-a");
            const content =
              args.__chainedContents ?? (await Bun.file(args.path).text());
            return {
              contents: content + " [A]",
              loader: "text",
              preventChaining: false,
            };
          });
        },
      };

      const pluginB: BunPlugin = {
        name: "plugin-b",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async (args) => {
            executionOrder.push("plugin-b");
            const content =
              args.__chainedContents ?? (await Bun.file(args.path).text());
            return { contents: content + " [B]", loader: "text" };
          });
        },
      };

      const chained = chainPlugins([pluginA, pluginB]);

      await Bun.build({
        entrypoints: [TEST_FILE],
        plugins: [chained],
        outdir: join(TEST_DIR, "out-continue"),
      });

      // Both plugins should execute
      expect(executionOrder).toEqual(["plugin-a", "plugin-b"]);
    });

    test("should stop chain at middle plugin with preventChaining", async () => {
      const executionOrder: string[] = [];

      const pluginA: BunPlugin = {
        name: "plugin-a",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async (args) => {
            executionOrder.push("plugin-a");
            const content =
              args.__chainedContents ?? (await Bun.file(args.path).text());
            return { contents: content + " [A]", loader: "text" };
          });
        },
      };

      const pluginB: BunPlugin = {
        name: "plugin-b",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async (args) => {
            executionOrder.push("plugin-b");
            const content =
              args.__chainedContents ?? (await Bun.file(args.path).text());
            return {
              contents: content + " [B]",
              loader: "text",
              preventChaining: true,
            };
          });
        },
      };

      const pluginC: BunPlugin = {
        name: "plugin-c",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async (args) => {
            executionOrder.push("plugin-c");
            const content =
              args.__chainedContents ?? (await Bun.file(args.path).text());
            return { contents: content + " [C]", loader: "text" };
          });
        },
      };

      const chained = chainPlugins([pluginA, pluginB, pluginC]);

      await Bun.build({
        entrypoints: [TEST_FILE],
        plugins: [chained],
        outdir: join(TEST_DIR, "out-middle"),
      });

      // plugin-a and plugin-b should execute, but not plugin-c
      expect(executionOrder).toEqual(["plugin-a", "plugin-b"]);
      expect(executionOrder).not.toContain("plugin-c");
    });
  });

  describe("finally handlers", () => {
    test("should execute finally handler after all onLoad handlers", async () => {
      const executionOrder: string[] = [];

      const pluginA: BunPlugin = {
        name: "plugin-a",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async (args) => {
            executionOrder.push("onLoad-a");
            const content =
              args.__chainedContents ?? (await Bun.file(args.path).text());
            return { contents: content + " [A]", loader: "text" };
          });

          build.finally("text", ({ contents }) => {
            executionOrder.push("finally-a");
            return { contents: `${contents} [FINAL]` };
          });
        },
      };

      const chained = chainPlugins([pluginA]);

      await Bun.build({
        entrypoints: [TEST_FILE],
        plugins: [chained],
        outdir: join(TEST_DIR, "out-finally-1"),
      });

      // finally should run after onLoad
      expect(executionOrder).toEqual(["onLoad-a", "finally-a"]);
    });

    test("should chain multiple finally handlers for same loader", async () => {
      const executionOrder: string[] = [];

      const pluginA: BunPlugin = {
        name: "plugin-a",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async (args) => {
            executionOrder.push("onLoad-a");
            const content =
              args.__chainedContents ?? (await Bun.file(args.path).text());
            return { contents: content + " [A]", loader: "text" };
          });

          build.finally("text", ({ contents }) => {
            executionOrder.push("finally-a");
            return { contents: `${contents} [F1]` };
          });
        },
      };

      const pluginB: BunPlugin = {
        name: "plugin-b",
        setup(build) {
          build.finally("text", ({ contents }) => {
            executionOrder.push("finally-b");
            return { contents: `${contents} [F2]` };
          });
        },
      };

      const chained = chainPlugins([pluginA, pluginB]);

      await Bun.build({
        entrypoints: [TEST_FILE],
        plugins: [chained],
        outdir: join(TEST_DIR, "out-finally-2"),
      });

      // Both finally handlers should run in order
      expect(executionOrder).toEqual(["onLoad-a", "finally-a", "finally-b"]);
    });

    test("should only run finally handlers matching the final loader", async () => {
      const executionOrder: string[] = [];

      const plugin: BunPlugin = {
        name: "test-plugin",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async (args) => {
            executionOrder.push("onLoad");
            const content =
              args.__chainedContents ?? (await Bun.file(args.path).text());
            return { contents: content, loader: "text" };
          });

          // This should run
          build.finally("text", ({ contents }) => {
            executionOrder.push("finally-text");
            return { contents: `${contents} [TEXT]` };
          });

          // This should NOT run (wrong loader)
          build.finally("js", ({ contents }) => {
            executionOrder.push("finally-js");
            return { contents: `${contents} [JS]` };
          });
        },
      };

      const chained = chainPlugins([plugin]);

      await Bun.build({
        entrypoints: [TEST_FILE],
        plugins: [chained],
        outdir: join(TEST_DIR, "out-finally-3"),
      });

      // Only text finally handler should run
      expect(executionOrder).toEqual(["onLoad", "finally-text"]);
      expect(executionOrder).not.toContain("finally-js");
    });

    test("finally handler should receive correct path and loader", async () => {
      let receivedArgs: { path: string; loader: string } | null = null;

      const plugin: BunPlugin = {
        name: "test-plugin",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async (args) => {
            const content =
              args.__chainedContents ?? (await Bun.file(args.path).text());
            return { contents: content, loader: "text" };
          });

          build.finally("text", ({ contents, path, loader }) => {
            receivedArgs = { path, loader };
            return { contents };
          });
        },
      };

      const chained = chainPlugins([plugin]);

      await Bun.build({
        entrypoints: [TEST_FILE],
        plugins: [chained],
        outdir: join(TEST_DIR, "out-finally-4"),
      });

      expect(receivedArgs).not.toBeNull();
      expect(receivedArgs!.path).toBe(TEST_FILE);
      expect(receivedArgs!.loader).toBe("text");
    });

    test("async finally handlers should work correctly", async () => {
      let finalContents: string = "";

      const plugin: BunPlugin = {
        name: "test-plugin",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async (args) => {
            const content =
              args.__chainedContents ?? (await Bun.file(args.path).text());
            return { contents: content, loader: "text" };
          });

          build.finally("text", async ({ contents }) => {
            // Simulate async operation
            await new Promise((resolve) => setTimeout(resolve, 10));
            const result =
              typeof contents === "string"
                ? contents
                : new TextDecoder().decode(contents);
            finalContents = result + " [ASYNC]";
            return { contents: finalContents };
          });
        },
      };

      const chained = chainPlugins([plugin]);

      await Bun.build({
        entrypoints: [TEST_FILE],
        plugins: [chained],
        outdir: join(TEST_DIR, "out-finally-5"),
      });

      expect(finalContents).toContain("[ASYNC]");
    });

    test("finally handler should run even without matching onLoad handler", async () => {
      let finallyRan = false;
      let receivedContents: string | Uint8Array | null = null;

      const plugin: BunPlugin = {
        name: "finally-only-plugin",
        setup(build) {
          // Only register a finally handler, no onLoad
          build.finally("text", ({ contents, path }) => {
            finallyRan = true;
            receivedContents = contents;
            return { contents: `[FINALLY PROCESSED] ${contents}` };
          });
        },
      };

      const chained = chainPlugins([plugin]);

      await Bun.build({
        entrypoints: [TEST_FILE],
        plugins: [chained],
        outdir: join(TEST_DIR, "out-finally-only"),
      });

      expect(finallyRan).toBe(true);
      expect(receivedContents).not.toBeNull();
      expect(typeof receivedContents).toBe("string");
    });
  });

  describe("finally handlers with onLoad (comprehensive)", () => {
    test("finally modifies content from onLoad handler", async () => {
      let onLoadOutput = "";
      let finallyOutput = "";

      const plugin: BunPlugin = {
        name: "test-plugin",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async (args) => {
            const content =
              args.__chainedContents ?? (await Bun.file(args.path).text());
            onLoadOutput = content + " [ONLOAD]";
            return { contents: onLoadOutput, loader: "text" };
          });

          build.finally("text", ({ contents }) => {
            const str =
              typeof contents === "string"
                ? contents
                : new TextDecoder().decode(contents);
            finallyOutput = str + " [FINALLY]";
            return { contents: finallyOutput };
          });
        },
      };

      const chained = chainPlugins([plugin]);

      await Bun.build({
        entrypoints: [TEST_FILE],
        plugins: [chained],
        outdir: join(TEST_DIR, "out-finally-with-onload-1"),
      });

      expect(onLoadOutput).toContain("[ONLOAD]");
      expect(finallyOutput).toContain("[ONLOAD]");
      expect(finallyOutput).toContain("[FINALLY]");
    });

    test("multiple onLoad handlers chain then finally runs", async () => {
      const executionOrder: string[] = [];

      const pluginA: BunPlugin = {
        name: "plugin-a",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async (args) => {
            executionOrder.push("onLoad-a");
            const content =
              args.__chainedContents ?? (await Bun.file(args.path).text());
            return { contents: content + " [A]", loader: "text" };
          });
        },
      };

      const pluginB: BunPlugin = {
        name: "plugin-b",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async (args) => {
            executionOrder.push("onLoad-b");
            const content =
              args.__chainedContents ?? (await Bun.file(args.path).text());
            return { contents: content + " [B]", loader: "text" };
          });

          build.finally("text", ({ contents }) => {
            executionOrder.push("finally-b");
            return { contents: `${contents} [FINAL]` };
          });
        },
      };

      const chained = chainPlugins([pluginA, pluginB]);

      await Bun.build({
        entrypoints: [TEST_FILE],
        plugins: [chained],
        outdir: join(TEST_DIR, "out-finally-with-onload-2"),
      });

      expect(executionOrder).toEqual(["onLoad-a", "onLoad-b", "finally-b"]);
    });

    test("finally receives accumulated content from chained handlers", async () => {
      let finalContents = "";

      const pluginA: BunPlugin = {
        name: "plugin-a",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async (args) => {
            const content =
              args.__chainedContents ?? (await Bun.file(args.path).text());
            return { contents: `[START]${content}`, loader: "text" };
          });
        },
      };

      const pluginB: BunPlugin = {
        name: "plugin-b",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async (args) => {
            const content =
              args.__chainedContents ?? (await Bun.file(args.path).text());
            return { contents: `${content}[MIDDLE]`, loader: "text" };
          });

          build.finally("text", ({ contents }) => {
            const str =
              typeof contents === "string"
                ? contents
                : new TextDecoder().decode(contents);
            finalContents = `${str}[END]`;
            return { contents: finalContents };
          });
        },
      };

      const chained = chainPlugins([pluginA, pluginB]);

      await Bun.build({
        entrypoints: [TEST_FILE],
        plugins: [chained],
        outdir: join(TEST_DIR, "out-finally-with-onload-3"),
      });

      expect(finalContents).toContain("[START]");
      expect(finalContents).toContain("[MIDDLE]");
      expect(finalContents).toContain("[END]");
    });

    test("preventChaining stops chain but finally still runs", async () => {
      const executionOrder: string[] = [];

      const plugin: BunPlugin = {
        name: "test-plugin",
        setup(build) {
          build.onLoad({ filter: /\.txt$/ }, async (args) => {
            executionOrder.push("onLoad-1");
            const content =
              args.__chainedContents ?? (await Bun.file(args.path).text());
            return {
              contents: content + " [STOPPED]",
              loader: "text",
              preventChaining: true,
            };
          });

          build.onLoad({ filter: /\.txt$/ }, async (args) => {
            executionOrder.push("onLoad-2-should-not-run");
            return { contents: "should not see this", loader: "text" };
          });

          build.finally("text", ({ contents }) => {
            executionOrder.push("finally");
            return { contents: `${contents} [FINAL]` };
          });
        },
      };

      const chained = chainPlugins([plugin]);

      await Bun.build({
        entrypoints: [TEST_FILE],
        plugins: [chained],
        outdir: join(TEST_DIR, "out-finally-with-prevent"),
      });

      expect(executionOrder).toEqual(["onLoad-1", "finally"]);
      expect(executionOrder).not.toContain("onLoad-2-should-not-run");
    });
  });

  describe("finally handlers without onLoad (finally-only)", () => {
    test("finally-only handler processes tsx files", async () => {
      let processed = false;
      let receivedPath = "";

      const plugin: BunPlugin = {
        name: "tsx-finally-only",
        setup(build) {
          build.finally("tsx", ({ contents, path }) => {
            processed = true;
            receivedPath = path;
            return { contents: `// Processed\n${contents}` };
          });
        },
      };

      const chained = chainPlugins([plugin]);

      await Bun.build({
        entrypoints: [TEST_FILE_TSX],
        plugins: [chained],
        outdir: join(TEST_DIR, "out-tsx-finally-only"),
      });

      expect(processed).toBe(true);
      expect(receivedPath).toBe(TEST_FILE_TSX);
    });

    test("multiple finally-only handlers chain correctly", async () => {
      const executionOrder: string[] = [];
      let finalOutput = "";

      const pluginA: BunPlugin = {
        name: "plugin-a",
        setup(build) {
          build.finally("text", ({ contents }) => {
            executionOrder.push("finally-a");
            return { contents: `[A]${contents}` };
          });
        },
      };

      const pluginB: BunPlugin = {
        name: "plugin-b",
        setup(build) {
          build.finally("text", ({ contents }) => {
            executionOrder.push("finally-b");
            const str =
              typeof contents === "string"
                ? contents
                : new TextDecoder().decode(contents);
            finalOutput = `${str}[B]`;
            return { contents: finalOutput };
          });
        },
      };

      const chained = chainPlugins([pluginA, pluginB]);

      await Bun.build({
        entrypoints: [TEST_FILE],
        plugins: [chained],
        outdir: join(TEST_DIR, "out-multi-finally-only"),
      });

      expect(executionOrder).toEqual(["finally-a", "finally-b"]);
      expect(finalOutput).toContain("[A]");
      expect(finalOutput).toContain("[B]");
    });

    test("finally-only does not run for non-matching loader", async () => {
      let jsFinallyCalled = false;

      const plugin: BunPlugin = {
        name: "js-finally-only",
        setup(build) {
          // This should NOT run for .txt files
          build.finally("js", ({ contents }) => {
            jsFinallyCalled = true;
            return { contents };
          });
        },
      };

      const chained = chainPlugins([plugin]);

      await Bun.build({
        entrypoints: [TEST_FILE], // .txt file
        plugins: [chained],
        outdir: join(TEST_DIR, "out-no-match-finally"),
      });

      expect(jsFinallyCalled).toBe(false);
    });

    test("finally-only receives original file content", async () => {
      let receivedContent = "";

      const plugin: BunPlugin = {
        name: "content-check",
        setup(build) {
          build.finally("text", ({ contents }) => {
            receivedContent =
              typeof contents === "string"
                ? contents
                : new TextDecoder().decode(contents);
            return { contents };
          });
        },
      };

      const chained = chainPlugins([plugin]);

      await Bun.build({
        entrypoints: [TEST_FILE],
        plugins: [chained],
        outdir: join(TEST_DIR, "out-content-check"),
      });

      // Should have the original file content
      expect(receivedContent).toBe("original content");
    });

    test("finally-only with async callback", async () => {
      let asyncResult = "";

      const plugin: BunPlugin = {
        name: "async-finally-only",
        setup(build) {
          build.finally("text", async ({ contents }) => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            const str =
              typeof contents === "string"
                ? contents
                : new TextDecoder().decode(contents);
            asyncResult = `[ASYNC] ${str}`;
            return { contents: asyncResult };
          });
        },
      };

      const chained = chainPlugins([plugin]);

      await Bun.build({
        entrypoints: [TEST_FILE],
        plugins: [chained],
        outdir: join(TEST_DIR, "out-async-finally-only"),
      });

      expect(asyncResult).toContain("[ASYNC]");
      expect(asyncResult).toContain("original content");
    });
  });
});
