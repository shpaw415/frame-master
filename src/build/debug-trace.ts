export type TraceContentKind = "text" | "binary" | "empty";

export type BuildTraceStepKind =
	| "source"
	| "onLoad"
	| "finally"
	| "final-output";

export type BuildTraceBuildStatus = "running" | "success" | "error";

export interface BuildTraceSnapshot {
	id: string;
	kind: TraceContentKind;
	loader?: Bun.Loader;
	size: number;
	hash: string;
	text?: string;
}

export interface BuildTraceStep {
	id: string;
	kind: BuildTraceStepKind;
	pluginName?: string;
	path: string;
	namespace?: string;
	order: number;
	loaderBefore?: Bun.Loader;
	loaderAfter?: Bun.Loader;
	sizeBefore: number;
	sizeAfter: number;
	hashBefore?: string;
	hashAfter?: string;
	beforeSnapshotId?: string;
	afterSnapshotId?: string;
	durationMs?: number;
	preventChaining?: boolean;
	startedAt: number;
	completedAt?: number;
}

export interface BuildTraceFile {
	id: string;
	path: string;
	namespace?: string;
	initialLoader?: Bun.Loader;
	finalLoader?: Bun.Loader;
	initialSnapshotId?: string;
	finalSnapshotId?: string;
	initialSize: number;
	finalSize: number;
	initialHash?: string;
	finalHash?: string;
	steps: BuildTraceStep[];
}

export interface BuildTraceBuildSummary {
	id: string;
	sequence: number;
	status: BuildTraceBuildStatus;
	startedAt: number;
	completedAt?: number;
	durationMs?: number;
	entrypoints: string[];
	fileCount: number;
	stepCount: number;
	outputCount: number;
}

export interface BuildTraceBuild extends BuildTraceBuildSummary {
	files: BuildTraceFile[];
	snapshots: Record<string, BuildTraceSnapshot>;
	errors?: string[];
}

export interface BuildTraceSessionOptions {
	watch: boolean;
	includeTextSnapshots?: boolean;
	maxBuilds?: number;
	saveTracePath?: string;
}

export interface BuildTraceSession {
	id: string;
	startedAt: number;
	options: BuildTraceSessionOptions;
	builds: BuildTraceBuild[];
	buildList: BuildTraceBuildSummary[];
}

type TraceMutationBase = {
	path: string;
	namespace?: string;
	contents?: string | Uint8Array;
	loader?: Bun.Loader;
	triggeredAt?: number;
};

export type BuildTraceEvent =
	| (TraceMutationBase & {
			kind: "source-read";
	  })
	| (TraceMutationBase & {
			kind: "transform-start";
			pluginName: string;
			order: number;
	  })
	| (TraceMutationBase & {
			kind: "transform-complete";
			pluginName: string;
			order: number;
			durationMs: number;
			preventChaining?: boolean;
	  })
	| (TraceMutationBase & {
			kind: "finally-start";
			pluginName: string;
			order: number;
	  })
	| (TraceMutationBase & {
			kind: "finally-complete";
			pluginName: string;
			order: number;
			durationMs: number;
	  })
	| (TraceMutationBase & {
			kind: "final-output";
	  });

export interface BuildTraceCollector {
	record(event: BuildTraceEvent): void;
}

type ActiveBuildContext = {
	build: BuildTraceBuild;
	filesByPath: Map<string, BuildTraceFile>;
	pendingSteps: Map<string, BuildTraceStep>;
	sequence: number;
};

const TEXT_LOADERS = new Set<Bun.Loader>([
	"js",
	"jsx",
	"ts",
	"tsx",
	"css",
	"html",
	"json",
	"toml",
	"text",
]);

function getSize(contents?: string | Uint8Array): number {
	if (contents === undefined) return 0;
	if (typeof contents === "string") {
		return new TextEncoder().encode(contents).length;
	}
	return contents.length;
}

function hashContents(contents?: string | Uint8Array): string {
	if (contents === undefined) return "";
	const bytes =
		typeof contents === "string"
			? new TextEncoder().encode(contents)
			: contents;
	let hash = 2166136261;
	for (const byte of bytes) {
		hash ^= byte;
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

function getContentKind(
	contents?: string | Uint8Array,
	loader?: Bun.Loader,
): TraceContentKind {
	if (contents === undefined) return "empty";
	if (typeof contents === "string") return "text";
	if (loader && TEXT_LOADERS.has(loader)) return "text";
	return "binary";
}

function normalizeSnapshot(
	id: string,
	contents?: string | Uint8Array,
	loader?: Bun.Loader,
	includeText = true,
): BuildTraceSnapshot {
	const kind = getContentKind(contents, loader);
	return {
		id,
		kind,
		loader,
		size: getSize(contents),
		hash: hashContents(contents),
		text:
			includeText && kind === "text"
				? typeof contents === "string"
					? contents
					: new TextDecoder().decode(contents)
				: undefined,
	};
}

function cloneBuildSummary(build: BuildTraceBuild): BuildTraceBuildSummary {
	return {
		id: build.id,
		sequence: build.sequence,
		status: build.status,
		startedAt: build.startedAt,
		completedAt: build.completedAt,
		durationMs: build.durationMs,
		entrypoints: [...build.entrypoints],
		fileCount: build.files.length,
		stepCount: build.files.reduce(
			(count, file) => count + file.steps.length,
			0,
		),
		outputCount: build.outputCount,
	};
}

export class BuildTraceSessionStore implements BuildTraceCollector {
	private session: BuildTraceSession;
	private activeBuild: ActiveBuildContext | null = null;
	private buildCounter = 0;

	constructor(options: BuildTraceSessionOptions) {
		this.session = {
			id: `trace-session-${Date.now()}`,
			startedAt: Date.now(),
			options: {
				includeTextSnapshots: true,
				maxBuilds: 25,
				...options,
			},
			builds: [],
			buildList: [],
		};
	}

	startBuild(entrypoints: string[]): BuildTraceBuild {
		this.buildCounter += 1;
		const build: BuildTraceBuild = {
			id: `build-${this.buildCounter}`,
			sequence: this.buildCounter,
			status: "running",
			startedAt: Date.now(),
			entrypoints: [...entrypoints],
			fileCount: 0,
			stepCount: 0,
			outputCount: 0,
			files: [],
			snapshots: {},
		};

		this.activeBuild = {
			build,
			filesByPath: new Map(),
			pendingSteps: new Map(),
			sequence: 0,
		};
		return build;
	}

	completeBuild(props: {
		success: boolean;
		outputCount: number;
		errors?: string[];
	}): BuildTraceBuild | null {
		if (!this.activeBuild) return null;

		const build = this.activeBuild.build;
		build.status = props.success ? "success" : "error";
		build.completedAt = Date.now();
		build.durationMs = build.completedAt - build.startedAt;
		build.outputCount = props.outputCount;
		build.errors = props.errors;

		for (const file of build.files) {
			file.finalSize =
				file.steps.at(-1)?.sizeAfter ?? file.initialSize ?? file.finalSize;
			file.finalLoader =
				file.steps.at(-1)?.loaderAfter ??
				file.initialLoader ??
				file.finalLoader;
			file.finalHash =
				file.steps.at(-1)?.hashAfter ?? file.initialHash ?? file.finalHash;
			file.finalSnapshotId =
				file.steps.at(-1)?.afterSnapshotId ??
				file.initialSnapshotId ??
				file.finalSnapshotId;
		}

		build.fileCount = build.files.length;
		build.stepCount = build.files.reduce(
			(count, file) => count + file.steps.length,
			0,
		);

		this.session.builds = [...this.session.builds, build].slice(
			-(this.session.options.maxBuilds ?? 25),
		);
		this.session.buildList = this.session.builds
			.map((entry) => cloneBuildSummary(entry))
			.sort((left, right) => right.sequence - left.sequence);

		this.activeBuild = null;
		return build;
	}

	record(event: BuildTraceEvent): void {
		if (!this.activeBuild) return;

		const file = this.ensureFile(event.path, event.namespace);
		switch (event.kind) {
			case "source-read":
				this.captureFileSource(file, event.contents, event.loader);
				break;
			case "transform-start":
				this.startStep(file, {
					kind: "onLoad",
					pluginName: event.pluginName,
					path: event.path,
					namespace: event.namespace,
					order: event.order,
					loaderBefore: event.loader ?? file.finalLoader ?? file.initialLoader,
					loaderAfter: undefined,
					sizeBefore: getSize(event.contents),
					sizeAfter: getSize(event.contents),
					hashBefore: hashContents(event.contents),
					hashAfter: undefined,
					beforeSnapshotId: this.createSnapshot(event.contents, event.loader),
					afterSnapshotId: undefined,
					durationMs: undefined,
					startedAt: event.triggeredAt ?? Date.now(),
					completedAt: undefined,
				});
				break;
			case "transform-complete":
				this.completeStep(file, "onLoad", event.pluginName, event.order, {
					contents: event.contents,
					loader: event.loader,
					durationMs: event.durationMs,
					preventChaining: event.preventChaining,
					completedAt: event.triggeredAt ?? Date.now(),
				});
				break;
			case "finally-start":
				this.startStep(file, {
					kind: "finally",
					pluginName: event.pluginName,
					path: event.path,
					namespace: event.namespace,
					order: event.order,
					loaderBefore: event.loader ?? file.finalLoader ?? file.initialLoader,
					loaderAfter: undefined,
					sizeBefore: getSize(event.contents),
					sizeAfter: getSize(event.contents),
					hashBefore: hashContents(event.contents),
					hashAfter: undefined,
					beforeSnapshotId: this.createSnapshot(event.contents, event.loader),
					afterSnapshotId: undefined,
					durationMs: undefined,
					startedAt: event.triggeredAt ?? Date.now(),
					completedAt: undefined,
				});
				break;
			case "finally-complete":
				this.completeStep(file, "finally", event.pluginName, event.order, {
					contents: event.contents,
					loader: event.loader,
					durationMs: event.durationMs,
					completedAt: event.triggeredAt ?? Date.now(),
				});
				break;
			case "final-output":
				this.finishFile(file, event.contents, event.loader);
				break;
		}
	}

	getSession(): BuildTraceSession {
		return structuredClone(this.session);
	}

	listBuilds(): BuildTraceBuildSummary[] {
		return this.session.buildList.map((build) => ({
			...build,
			entrypoints: [...build.entrypoints],
		}));
	}

	exportJSON(): string {
		return JSON.stringify(this.getSession(), null, 2);
	}

	private ensureFile(path: string, namespace?: string): BuildTraceFile {
		const activeBuild = this.requireActiveBuild();
		const existing = activeBuild.filesByPath.get(path);
		if (existing) return existing;

		const file: BuildTraceFile = {
			id: `${activeBuild.build.id}:file:${activeBuild.build.files.length + 1}`,
			path,
			namespace,
			initialSize: 0,
			finalSize: 0,
			steps: [],
		};

		activeBuild.filesByPath.set(path, file);
		activeBuild.build.files.push(file);
		return file;
	}

	private captureFileSource(
		file: BuildTraceFile,
		contents?: string | Uint8Array,
		loader?: Bun.Loader,
	) {
		if (file.initialSnapshotId) return;
		const snapshotId = this.createSnapshot(contents, loader);
		file.initialSnapshotId = snapshotId;
		file.finalSnapshotId = snapshotId;
		file.initialLoader = loader;
		file.finalLoader = loader;
		file.initialSize = getSize(contents);
		file.finalSize = file.initialSize;
		file.initialHash = hashContents(contents);
		file.finalHash = file.initialHash;
		file.steps.push({
			id: `${file.id}:step:${file.steps.length + 1}`,
			kind: "source",
			path: file.path,
			namespace: file.namespace,
			order: 0,
			loaderBefore: loader,
			loaderAfter: loader,
			sizeBefore: file.initialSize,
			sizeAfter: file.initialSize,
			hashBefore: file.initialHash,
			hashAfter: file.initialHash,
			beforeSnapshotId: snapshotId,
			afterSnapshotId: snapshotId,
			startedAt: Date.now(),
			completedAt: Date.now(),
		});
	}

	private startStep(file: BuildTraceFile, step: BuildTraceStep) {
		const activeBuild = this.requireActiveBuild();
		const nextStep: BuildTraceStep = {
			...step,
			id: `${file.id}:step:${file.steps.length + 1}`,
		};
		file.steps.push(nextStep);
		activeBuild.pendingSteps.set(
			this.stepKey(file.path, step.kind, step.pluginName, step.order),
			nextStep,
		);
	}

	private completeStep(
		file: BuildTraceFile,
		kind: "onLoad" | "finally",
		pluginName: string,
		order: number,
		props: {
			contents?: string | Uint8Array;
			loader?: Bun.Loader;
			durationMs?: number;
			preventChaining?: boolean;
			completedAt: number;
		},
	) {
		const activeBuild = this.requireActiveBuild();
		const key = this.stepKey(file.path, kind, pluginName, order);
		const step = activeBuild.pendingSteps.get(key);
		if (!step) return;

		step.loaderAfter = props.loader ?? step.loaderBefore;
		step.sizeAfter = getSize(props.contents);
		step.hashAfter = hashContents(props.contents);
		step.afterSnapshotId = this.createSnapshot(
			props.contents,
			step.loaderAfter,
		);
		step.durationMs = props.durationMs;
		step.preventChaining = props.preventChaining;
		step.completedAt = props.completedAt;

		file.finalLoader = step.loaderAfter;
		file.finalSize = step.sizeAfter;
		file.finalHash = step.hashAfter;
		file.finalSnapshotId = step.afterSnapshotId;
		activeBuild.pendingSteps.delete(key);
	}

	private finishFile(
		file: BuildTraceFile,
		contents?: string | Uint8Array,
		loader?: Bun.Loader,
	) {
		const snapshotId = this.createSnapshot(contents, loader);
		file.finalLoader = loader ?? file.finalLoader;
		file.finalSize = getSize(contents);
		file.finalHash = hashContents(contents);
		file.finalSnapshotId = snapshotId;
		file.steps.push({
			id: `${file.id}:step:${file.steps.length + 1}`,
			kind: "final-output",
			path: file.path,
			namespace: file.namespace,
			order: file.steps.length,
			loaderBefore: file.steps.at(-1)?.loaderAfter ?? file.initialLoader,
			loaderAfter: file.finalLoader,
			sizeBefore: file.steps.at(-1)?.sizeAfter ?? file.initialSize,
			sizeAfter: file.finalSize,
			hashBefore: file.steps.at(-1)?.hashAfter ?? file.initialHash,
			hashAfter: file.finalHash,
			beforeSnapshotId:
				file.steps.at(-1)?.afterSnapshotId ?? file.initialSnapshotId,
			afterSnapshotId: snapshotId,
			startedAt: Date.now(),
			completedAt: Date.now(),
		});
	}

	private createSnapshot(
		contents?: string | Uint8Array,
		loader?: Bun.Loader,
	): string | undefined {
		const activeBuild = this.activeBuild;
		if (!activeBuild) return undefined;
		const snapshotId = `${activeBuild.build.id}:snapshot:${
			Object.keys(activeBuild.build.snapshots).length + 1
		}`;
		activeBuild.build.snapshots[snapshotId] = normalizeSnapshot(
			snapshotId,
			contents,
			loader,
			this.session.options.includeTextSnapshots,
		);
		return snapshotId;
	}

	private requireActiveBuild(): ActiveBuildContext {
		if (!this.activeBuild) {
			throw new Error("No active debug build. Call startBuild() first.");
		}
		return this.activeBuild;
	}

	private stepKey(
		path: string,
		kind: "onLoad" | "finally",
		pluginName: string,
		order: number,
	) {
		return `${path}:${kind}:${pluginName}:${order}`;
	}
}
