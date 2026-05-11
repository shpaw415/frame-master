import type {
	BuildTraceBuild,
	BuildTraceBuildSummary,
	BuildTraceSession,
	BuildTraceSnapshot,
} from "../build/debug-trace";
import type {
	DebugBuildMessage,
	DebugRegistryEntry,
	DebugStreamFile,
	DebugStreamStep,
} from "./types";

export type DebugLiveFile = DebugStreamFile & {
	steps: DebugStreamStep[];
};

export type DebugLiveBuild = {
	id: string;
	files: DebugLiveFile[];
};

export type DebugUIState = {
	session: BuildTraceSession | null;
	buildList: BuildTraceBuildSummary[];
	builds: Record<string, BuildTraceBuild>;
	liveBuilds: Record<string, DebugLiveBuild>;
	snapshots: Record<string, BuildTraceSnapshot>;
	registry: DebugRegistryEntry[];
	selectedBuildId: string | null;
	selectedFileId: string | null;
	selectedStepId: string | null;
	lastSavedTracePath: string | null;
	connection: "connecting" | "open" | "closed";
	watcherEvents: Array<{ eventType: string; filePath: string }>;
};

type BuildLike = BuildTraceBuild | DebugLiveBuild;
type FileLike = BuildLike["files"][number];
type StepLike = FileLike["steps"][number];

export function createInitialDebugUIState(): DebugUIState {
	return {
		session: null,
		buildList: [],
		builds: {},
		liveBuilds: {},
		snapshots: {},
		registry: [],
		selectedBuildId: null,
		selectedFileId: null,
		selectedStepId: null,
		lastSavedTracePath: null,
		connection: "connecting",
		watcherEvents: [],
	};
}

export function hydrateDebugUIState(
	state: DebugUIState,
	payload: {
		session: BuildTraceSession | null;
		buildList: BuildTraceBuildSummary[];
		registry: DebugRegistryEntry[];
	},
): DebugUIState {
	return syncSelection({
		...state,
		session: payload.session,
		buildList: sortBuildList(payload.buildList),
		registry: payload.registry,
	});
}

export function setConnectionState(
	state: DebugUIState,
	connection: DebugUIState["connection"],
): DebugUIState {
	return { ...state, connection };
}

export function upsertBuild(
	state: DebugUIState,
	build: BuildTraceBuild,
): DebugUIState {
	return syncSelection(
		{
			...state,
			builds: {
				...state.builds,
				[build.id]: build,
			},
			liveBuilds: omitLiveBuild(state.liveBuilds, build.id),
		},
		build.id,
	);
}

export function storeSnapshot(
	state: DebugUIState,
	buildId: string,
	snapshot: BuildTraceSnapshot,
): DebugUIState {
	return {
		...state,
		snapshots: {
			...state.snapshots,
			[getSnapshotKey(buildId, snapshot.id)]: snapshot,
		},
	};
}

export function selectBuild(
	state: DebugUIState,
	buildId: string,
): DebugUIState {
	return syncSelection(
		{
			...state,
			selectedBuildId: buildId,
			selectedFileId: null,
			selectedStepId: null,
		},
		buildId,
	);
}

export function selectStep(
	state: DebugUIState,
	fileId: string,
	stepId: string,
): DebugUIState {
	return {
		...state,
		selectedFileId: fileId,
		selectedStepId: stepId,
	};
}

export function applyDebugMessage(
	state: DebugUIState,
	message: DebugBuildMessage,
): DebugUIState {
	switch (message.type) {
		case "session-init":
			return syncSelection({
				...state,
				session: message.data,
			});
		case "build-list-updated":
			return syncSelection({
				...state,
				buildList: sortBuildList(message.data),
			});
		case "build-start":
		case "build-complete":
		case "build-error":
			return syncSelection(
				{
					...state,
					buildList: sortBuildList(
						upsertBuildSummary(state.buildList, message.data),
					),
				},
				message.data.id,
			);
		case "step-appended":
			return syncSelection(
				{
					...state,
					liveBuilds: {
						...state.liveBuilds,
						[message.data.buildId]: mergeLiveBuild(
							message.data.buildId,
							state.liveBuilds[message.data.buildId],
							message.data.file,
							message.data.step,
						),
					},
				},
				message.data.buildId,
			);
		case "registry-updated":
			return {
				...state,
				registry: message.data,
			};
		case "build-details":
			return message.data ? upsertBuild(state, message.data) : state;
		case "step-snapshot":
			return message.data.snapshot
				? storeSnapshot(state, message.data.buildId, message.data.snapshot)
				: state;
		case "trace-saved":
			return {
				...state,
				lastSavedTracePath: message.data.path,
			};
		case "watcher-change":
			return {
				...state,
				watcherEvents: [
					{
						eventType: message.data.eventType,
						filePath: message.data.filePath,
					},
					...state.watcherEvents,
				].slice(0, 6),
			};
		case "trace-export":
		case "server-error":
			return state;
	}
}

export function loadTraceFile(
	state: DebugUIState,
	session: BuildTraceSession,
): DebugUIState {
	// Flatten all per-build snapshots into the global snapshot map
	const snapshots: Record<string, BuildTraceSnapshot> = { ...state.snapshots };
	const builds: Record<string, BuildTraceBuild> = { ...state.builds };

	for (const build of session.builds) {
		builds[build.id] = build;
		for (const [snapshotId, snapshot] of Object.entries(build.snapshots)) {
			snapshots[getSnapshotKey(build.id, snapshotId)] = snapshot;
		}
	}

	const buildList = session.buildList.length
		? sortBuildList(session.buildList)
		: sortBuildList(session.builds.map((b) => cloneBuildSummaryFromBuild(b)));

	return syncSelection({
		...state,
		session,
		buildList,
		builds,
		snapshots,
		// Imported traces have no live data
		liveBuilds: {},
	});
}

function cloneBuildSummaryFromBuild(
	build: BuildTraceBuild,
): BuildTraceBuildSummary {
	return {
		id: build.id,
		sequence: build.sequence,
		status: build.status,
		startedAt: build.startedAt,
		completedAt: build.completedAt,
		durationMs: build.durationMs,
		entrypoints: [...build.entrypoints],
		fileCount: build.fileCount,
		stepCount: build.stepCount,
		outputCount: build.outputCount,
	};
}

export function getSelectedBuild(state: DebugUIState): BuildLike | null {
	if (!state.selectedBuildId) return null;
	return (
		state.builds[state.selectedBuildId] ??
		state.liveBuilds[state.selectedBuildId] ??
		null
	);
}

export function getSelectedFile(state: DebugUIState): FileLike | null {
	const build = getSelectedBuild(state);
	if (!build) return null;
	return (
		build.files.find((file) => file.id === state.selectedFileId) ??
		build.files[0] ??
		null
	);
}

export function getSelectedStep(state: DebugUIState): StepLike | null {
	const file = getSelectedFile(state);
	if (!file) return null;
	return (
		file.steps.find((step) => step.id === state.selectedStepId) ??
		file.steps[0] ??
		null
	);
}

export function getSnapshotKey(buildId: string, snapshotId: string) {
	return `${buildId}:${snapshotId}`;
}

function syncSelection(
	state: DebugUIState,
	preferredBuildId?: string,
): DebugUIState {
	const selectedBuildId =
		preferredBuildId && hasBuild(state, preferredBuildId)
			? preferredBuildId
			: hasBuild(state, state.selectedBuildId)
				? state.selectedBuildId
				: (state.buildList[0]?.id ?? Object.keys(state.liveBuilds)[0] ?? null);

	if (!selectedBuildId) {
		return {
			...state,
			selectedBuildId: null,
			selectedFileId: null,
			selectedStepId: null,
		};
	}

	const build =
		state.builds[selectedBuildId] ?? state.liveBuilds[selectedBuildId] ?? null;
	const selectedFile =
		build?.files.find((file) => file.id === state.selectedFileId) ??
		build?.files[0] ??
		null;
	const selectedStep =
		selectedFile?.steps.find((step) => step.id === state.selectedStepId) ??
		selectedFile?.steps[0] ??
		null;

	return {
		...state,
		selectedBuildId,
		selectedFileId: selectedFile?.id ?? null,
		selectedStepId: selectedStep?.id ?? null,
	};
}

function hasBuild(state: DebugUIState, buildId: string | null) {
	if (!buildId) return false;
	return (
		buildId in state.builds ||
		buildId in state.liveBuilds ||
		state.buildList.some((build) => build.id === buildId)
	);
}

function sortBuildList(buildList: BuildTraceBuildSummary[]) {
	return [...buildList].sort((left, right) => right.sequence - left.sequence);
}

function upsertBuildSummary(
	buildList: BuildTraceBuildSummary[],
	summary: BuildTraceBuildSummary,
) {
	const filtered = buildList.filter((build) => build.id !== summary.id);
	return [summary, ...filtered];
}

function mergeLiveBuild(
	buildId: string,
	build: DebugLiveBuild | undefined,
	file: DebugStreamFile,
	step: DebugStreamStep,
): DebugLiveBuild {
	const currentBuild: DebugLiveBuild = build ?? { id: buildId, files: [] };
	const existingFile = currentBuild.files.find((entry) => entry.id === file.id);
	const nextFile: DebugLiveFile = existingFile
		? {
				...existingFile,
				...file,
				steps: [
					...existingFile.steps.filter((entry) => entry.id !== step.id),
					step,
				].sort((left, right) => left.order - right.order),
			}
		: {
				...file,
				steps: [step],
			};

	return {
		id: currentBuild.id,
		files: [
			...currentBuild.files.filter((entry) => entry.id !== file.id),
			nextFile,
		],
	};
}

function omitLiveBuild(
	liveBuilds: Record<string, DebugLiveBuild>,
	buildId: string,
) {
	const nextLiveBuilds = { ...liveBuilds };
	delete nextLiveBuilds[buildId];
	return nextLiveBuilds;
}
