import { describe, expect, test } from "bun:test";
import type {
	BuildTraceBuild,
	BuildTraceBuildSummary,
	BuildTraceSession,
	BuildTraceSnapshot,
} from "../src/build/debug-trace";
import {
	applyDebugMessage,
	createInitialDebugUIState,
	getSelectedBuild,
	getSelectedFile,
	getSelectedStep,
	getSnapshotKey,
	hydrateDebugUIState,
	selectBuild,
	storeSnapshot,
	upsertBuild,
} from "../src/debug/state";
import type { DebugRegistryEntry } from "../src/debug/types";

function buildSummary(id: string, sequence: number): BuildTraceBuildSummary {
	return {
		id,
		sequence,
		status: "success",
		startedAt: 1000 + sequence,
		completedAt: 1005 + sequence,
		durationMs: 5,
		entrypoints: ["src/index.ts"],
		fileCount: 1,
		stepCount: 1,
		outputCount: 1,
	};
}

function buildDetails(id: string, sequence: number): BuildTraceBuild {
	const summary = buildSummary(id, sequence);
	const snapshot: BuildTraceSnapshot = {
		id: `${id}-snapshot`,
		kind: "text",
		size: 12,
		hash: `${id}-hash`,
		text: `console.log("${id}");`,
	};
	return {
		...summary,
		files: [
			{
				id: `${id}-file`,
				path: `src/${id}.ts`,
				initialLoader: "ts",
				finalLoader: "ts",
				initialSnapshotId: snapshot.id,
				finalSnapshotId: snapshot.id,
				initialSize: snapshot.size,
				finalSize: snapshot.size,
				initialHash: snapshot.hash,
				finalHash: snapshot.hash,
				steps: [
					{
						id: `${id}-step`,
						kind: "onLoad",
						pluginName: "trace-plugin",
						path: `src/${id}.ts`,
						order: 1,
						loaderBefore: "ts",
						loaderAfter: "ts",
						sizeBefore: snapshot.size,
						sizeAfter: snapshot.size,
						hashBefore: snapshot.hash,
						hashAfter: snapshot.hash,
						beforeSnapshotId: snapshot.id,
						afterSnapshotId: snapshot.id,
						durationMs: 2.5,
						startedAt: 1000,
						completedAt: 1002,
					},
				],
			},
		],
		snapshots: {
			[snapshot.id]: snapshot,
		},
	};
}

const session: BuildTraceSession = {
	id: "session-1",
	startedAt: 1000,
	options: { watch: true },
	builds: [],
	buildList: [],
};

const registry: DebugRegistryEntry[] = [
	{
		name: "trace-plugin",
		version: "1.0.0",
		priority: 10,
		dependencies: [],
		metrics: {
			interventions: 3,
			onLoadMs: 12,
			finallyMs: 0,
			totalMs: 12,
			fileCount: 1,
			buildCount: 1,
			loaders: ["ts"],
		},
	},
];

describe("debug UI state", () => {
	test("hydrates with the newest build selected", () => {
		const state = hydrateDebugUIState(createInitialDebugUIState(), {
			session,
			buildList: [buildSummary("build-1", 1), buildSummary("build-2", 2)],
			registry,
		});

		expect(state.selectedBuildId).toBe("build-2");
		expect(state.registry).toHaveLength(1);
	});

	test("keeps an explicit build selection across build list updates", () => {
		let state = hydrateDebugUIState(createInitialDebugUIState(), {
			session,
			buildList: [buildSummary("build-1", 1), buildSummary("build-2", 2)],
			registry,
		});
		state = selectBuild(state, "build-1");
		state = applyDebugMessage(state, {
			type: "build-list-updated",
			data: [
				buildSummary("build-3", 3),
				buildSummary("build-2", 2),
				buildSummary("build-1", 1),
			],
		});

		expect(state.selectedBuildId).toBe("build-1");
	});

	test("merges live step events into a selectable streaming build", () => {
		const state = applyDebugMessage(createInitialDebugUIState(), {
			type: "step-appended",
			data: {
				buildId: "build-live",
				file: {
					id: "file-live",
					path: "src/live.ts",
					finalLoader: "ts",
					finalSize: 42,
				},
				step: {
					id: "step-live",
					kind: "onLoad",
					pluginName: "trace-plugin",
					order: 1,
					loaderBefore: "ts",
					loaderAfter: "ts",
					sizeBefore: 21,
					sizeAfter: 42,
					durationMs: 1.2,
					beforeSnapshotId: "snap-before",
					afterSnapshotId: "snap-after",
				},
			},
		});

		expect(getSelectedBuild(state)?.id).toBe("build-live");
		expect(getSelectedFile(state)?.id).toBe("file-live");
		expect(getSelectedStep(state)?.id).toBe("step-live");
	});

	test("stores snapshots for diff lookups after build details load", () => {
		let state = upsertBuild(
			createInitialDebugUIState(),
			buildDetails("build-9", 9),
		);
		const snapshot = buildDetails("build-9", 9).snapshots["build-9-snapshot"];
		state = storeSnapshot(state, "build-9", snapshot as BuildTraceSnapshot);

		expect(
			state.snapshots[getSnapshotKey("build-9", snapshot?.id as string)]?.text,
		).toContain("build-9");
	});
});
