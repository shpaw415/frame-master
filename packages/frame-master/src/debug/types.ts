import type { WatchEventType } from "frame-master/plugin/types";
import type {
	BuildTraceBuild,
	BuildTraceBuildSummary,
	BuildTraceSession,
	BuildTraceSnapshot,
	BuildTraceStepError,
} from "../build/debug-trace";

export type { BuildTraceStepError };

export type DebugStreamStep = {
	id: string;
	kind: string;
	pluginName?: string;
	order: number;
	loaderBefore?: Bun.Loader;
	loaderAfter?: Bun.Loader;
	sizeBefore: number;
	sizeAfter: number;
	durationMs?: number;
	beforeSnapshotId?: string;
	afterSnapshotId?: string;
	error?: BuildTraceStepError;
};

export type DebugStreamFile = {
	id: string;
	path: string;
	namespace?: string;
	finalLoader?: Bun.Loader;
	finalSize: number;
};

export type DebugPipeline = { id: string; label: string };

export type DebugRegistryDependency = {
	name: string;
	requiredVersion: string;
	installedVersion?: string;
	satisfied: boolean;
};

export type DebugRegistryMetrics = {
	interventions: number;
	onLoadMs: number;
	finallyMs: number;
	totalMs: number;
	fileCount: number;
	buildCount: number;
	loaders: string[];
};

export type DebugRegistryEntry = {
	name: string;
	version: string;
	priority: number;
	dependencies: DebugRegistryDependency[];
	metrics: DebugRegistryMetrics;
};

export type DebugBuildMessage =
	| { type: "session-init"; data: BuildTraceSession | null }
	| { type: "build-list-updated"; data: BuildTraceBuildSummary[] }
	| { type: "build-start"; data: BuildTraceBuildSummary }
	| { type: "build-complete"; data: BuildTraceBuildSummary }
	| { type: "build-error"; data: BuildTraceBuildSummary }
	| {
			type: "step-appended";
			data: {
				buildId: string;
				file: DebugStreamFile;
				step: DebugStreamStep;
			};
	  }
	| {
			type: "watcher-change";
			data: {
				eventType: WatchEventType;
				filePath: string;
				absolutePath: string;
			};
	  }
	| { type: "registry-updated"; data: DebugRegistryEntry[] }
	| { type: "build-details"; data: BuildTraceBuild | null }
	| {
			type: "step-snapshot";
			data: {
				buildId: string;
				snapshotId: string;
				snapshot: BuildTraceSnapshot | null;
			};
	  }
	| { type: "trace-saved"; data: { path: string } }
	| { type: "trace-export"; data: string }
	| { type: "server-error"; error: string };
