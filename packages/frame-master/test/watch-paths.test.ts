import { describe, expect, test } from "bun:test";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { FileChangeCallback } from "../src/plugins/types";
import { resolveFileChangePaths } from "../src/server/watch";

const root = resolve("/workspace/apply-react");

describe("resolveFileChangePaths", () => {
	test("relative watch dir nested file", () => {
		const resolved = resolveFileChangePaths("src/pages", "index.tsx", root);
		expect(resolved).not.toBeNull();
		expect(resolved?.filePath).toBe("index.tsx");
		expect(resolved?.projectRootPath).toBe("src/pages/index.tsx");
		expect(isAbsolute(resolved?.absolutePath ?? "")).toBe(true);
		expect(resolved?.absolutePath).toBe(resolve(root, "src/pages/index.tsx"));
	});

	test("./src and src/ match src", () => {
		const a = resolveFileChangePaths("src", "index.tsx", root);
		const b = resolveFileChangePaths("./src", "index.tsx", root);
		const c = resolveFileChangePaths("src/", "index.tsx", root);
		expect(a?.projectRootPath).toBe("src/index.tsx");
		expect(b?.projectRootPath).toBe(a?.projectRootPath);
		expect(c?.projectRootPath).toBe(a?.projectRootPath);
		expect(b?.absolutePath).toBe(a?.absolutePath);
		expect(c?.absolutePath).toBe(a?.absolutePath);
	});

	test("absolute watch dir inside project root", () => {
		const resolved = resolveFileChangePaths(
			resolve(root, "src/pages"),
			"index.tsx",
			root,
		);
		expect(resolved?.projectRootPath).toBe("src/pages/index.tsx");
		expect(resolved?.absolutePath).toBe(resolve(root, "src/pages/index.tsx"));
	});

	test("absolute watch dir outside project root", () => {
		const outside = resolve("/other/project/src");
		const resolved = resolveFileChangePaths(outside, "a.ts", root);
		expect(resolved).not.toBeNull();
		expect(resolved?.projectRootPath.startsWith("../")).toBe(true);
		expect(isAbsolute(resolved?.absolutePath ?? "")).toBe(true);
		expect(resolved?.absolutePath).toBe(resolve(outside, "a.ts"));
	});

	test("watch . uses a cwd-relative path without ./ prefix", () => {
		const resolved = resolveFileChangePaths(".", "foo.ts", root);
		expect(resolved?.projectRootPath).toBe("foo.ts");
		expect(resolved?.absolutePath).toBe(resolve(root, "foo.ts"));
	});

	test("projectRootPath is posix-separated", () => {
		const resolved = resolveFileChangePaths("src/pages", "index.tsx", root);
		expect(resolved?.projectRootPath.includes("\\")).toBe(false);
	});

	test("preserves dynamic route, spaces, and unicode filenames", () => {
		expect(
			resolveFileChangePaths("src/pages", "[id].tsx", root)?.filePath,
		).toBe("[id].tsx");
		expect(
			resolveFileChangePaths("src/pages", "My File.tsx", root)?.projectRootPath,
		).toBe("src/pages/My File.tsx");
		expect(
			resolveFileChangePaths("src/pages", "café.tsx", root)?.filePath,
		).toBe("café.tsx");
	});

	test("skips null, empty, . and .. filenames", () => {
		expect(resolveFileChangePaths("src", null, root)).toBeNull();
		expect(resolveFileChangePaths("src", "", root)).toBeNull();
		expect(resolveFileChangePaths("src", "   ", root)).toBeNull();
		expect(resolveFileChangePaths("src", ".", root)).toBeNull();
		expect(resolveFileChangePaths("src", "..", root)).toBeNull();
	});

	test("relative watch dir third argument matches previous join() value", () => {
		const watchPath = "src/pages";
		const filename = "index.tsx";
		const resolved = resolveFileChangePaths(watchPath, filename, root);
		expect(resolved?.projectRootPath).toBe(
			join(watchPath, filename).replaceAll("\\", "/"),
		);
		expect(resolved?.projectRootPath).toBe(
			relative(root, resolve(root, watchPath, filename)).replaceAll("\\", "/"),
		);
	});

	test("absolutePath is always absolute", () => {
		const cases = [
			resolveFileChangePaths("src", "a.ts", root),
			resolveFileChangePaths(resolve(root, "src"), "a.ts", root),
			resolveFileChangePaths(".", "a.ts", root),
			resolveFileChangePaths(
				resolve("/outside/src"),
				"a.ts",
				root,
			),
		];
		for (const resolved of cases) {
			expect(isAbsolute(resolved?.absolutePath ?? "")).toBe(true);
		}
	});

	test("file watch uses the file path when filename is missing", () => {
		const file = resolve(root, "src/foo.ts");
		const resolved = resolveFileChangePaths(file, null, root, {
			watchTargetIsFile: true,
		});
		expect(resolved?.filePath).toBe("foo.ts");
		expect(resolved?.projectRootPath).toBe("src/foo.ts");
		expect(resolved?.absolutePath).toBe(file);
	});

	test("empty relative path becomes .", () => {
		const resolved = resolveFileChangePaths(root, null, root, {
			watchTargetIsFile: true,
		});
		expect(resolved?.projectRootPath).toBe(".");
		expect(resolved?.absolutePath).toBe(root);
	});

	test("3-arg FileChangeCallback remains assignable", () => {
		const callback: FileChangeCallback = (_event, _file, _projectRootPath) => {};
		expect(typeof callback).toBe("function");
	});
});
