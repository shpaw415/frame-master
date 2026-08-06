import {
	startTransition,
	useDeferredValue,
	useEffect,
	useEffectEvent,
	useRef,
	useState,
} from "react";
import type {
	BuildTraceBuild,
	BuildTraceBuildStatus,
	BuildTraceBuildSummary,
	BuildTraceSession,
	BuildTraceSnapshot,
	BuildTraceStepError,
} from "../../../build/debug-trace";
import type {
	DebugBuildMessage,
	DebugRegistryEntry,
} from "../../../debug/types";
import {
	applyDebugMessage,
	createInitialDebugUIState,
	getSelectedBuild,
	getSelectedFile,
	getSelectedStep,
	getSnapshotKey,
	hydrateDebugUIState,
	loadTraceFile,
	selectBuild,
	selectStep,
	setConnectionState,
	storeSnapshot,
	upsertBuild,
} from "../../state";
import MonacoDiff from "./MonacoDiff";

// ── Left-panel tab registry ───────────────────────────────────────────────────
// Add new entries here to extend the menu.
type LeftTabKey = "builds" | "files" | "info";
const LEFT_TABS: { key: LeftTabKey; label: string }[] = [
	{ key: "builds", label: "builds" },
	{ key: "files", label: "files" },
	{ key: "info", label: "info" },
];

async function fetchJson<T>(path: string): Promise<T> {
	const response = await fetch(path);
	if (!response.ok) {
		throw new Error(`Request failed for ${path}: ${response.status}`);
	}
	return response.json() as Promise<T>;
}

function formatDuration(durationMs?: number) {
	if (durationMs == null) return "pending";
	return `${durationMs.toFixed(1)}ms`;
}

function snapshotText(snapshot?: BuildTraceSnapshot | null) {
	if (!snapshot) return "Snapshot unavailable.";
	if (snapshot.kind === "binary") {
		return `Binary snapshot\n\n${snapshot.size} bytes captured.`;
	}
	if (snapshot.kind === "empty") {
		return "No content.";
	}
	if (snapshot.text !== undefined) {
		return snapshot.text;
	}
	return "Text snapshot unavailable for this trace.";
}

function inferLanguage(path?: string, loader?: Bun.Loader) {
	if (loader === "ts" || loader === "tsx") return "typescript";
	if (loader === "js" || loader === "jsx") return "javascript";
	if (loader === "json") return "json";
	if (loader === "css") return "css";
	if (loader === "html") return "html";
	if (!path) return "plaintext";
	if (path.endsWith(".ts") || path.endsWith(".tsx")) return "typescript";
	if (path.endsWith(".js") || path.endsWith(".jsx")) return "javascript";
	if (path.endsWith(".json")) return "json";
	if (path.endsWith(".css")) return "css";
	if (path.endsWith(".html")) return "html";
	return "plaintext";
}

function statusLabel(status: BuildTraceBuildStatus) {
	if (status === "success") return "ok";
	if (status === "error") return "err";
	return "running";
}

function statusBadge(status: BuildTraceBuildStatus) {
	if (status === "success") return "t-badge-ok";
	if (status === "error") return "t-badge-err";
	return "t-badge-run";
}

function StepErrorPanel({ error }: { error: BuildTraceStepError }) {
	return (
		<div className="flex flex-col h-full overflow-y-auto p-4 gap-4 font-mono text-xs">
			{/* Error type + message */}
			<div className="flex flex-col gap-1.5">
				<div className="flex items-center gap-2">
					<span className="t-badge t-badge-err shrink-0">{error.name}</span>
					<span className="t-err font-semibold text-sm leading-snug break-all">
						{error.message}
					</span>
				</div>
			</div>

			{/* Stack trace */}
			{error.stack && (
				<div className="flex flex-col gap-1">
					<div className="t-section-label text-xs uppercase tracking-wider pb-1">
						stack trace
					</div>
					<pre className="t-surface border rounded p-3 text-xs leading-relaxed t-dim overflow-x-auto whitespace-pre-wrap break-all">
						{/* Strip the first line of the stack if it duplicates name+message */}
						{error.stack.startsWith(`${error.name}: ${error.message}`)
							? error.stack
									.slice(`${error.name}: ${error.message}`.length)
									.trimStart()
							: error.stack}
					</pre>
				</div>
			)}

			{/* Cause chain */}
			{error.cause && (
				<div className="flex flex-col gap-1">
					<div className="t-section-label text-xs uppercase tracking-wider pb-1">
						caused by
					</div>
					<pre className="t-surface border rounded p-3 text-xs leading-relaxed t-dim overflow-x-auto whitespace-pre-wrap break-all">
						{error.cause}
					</pre>
				</div>
			)}

			{/* Extra properties */}
			{error.extra && Object.keys(error.extra).length > 0 && (
				<div className="flex flex-col gap-1">
					<div className="t-section-label text-xs uppercase tracking-wider pb-1">
						extra
					</div>
					<div className="t-surface border rounded p-3 flex flex-col gap-1">
						{Object.entries(error.extra).map(([k, v]) => (
							<div key={k} className="flex gap-2">
								<span className="t-faint shrink-0 w-24 truncate">{k}</span>
								<span className="t-dim break-all">{v}</span>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

export default function DebugApp() {
	const [state, setState] = useState(createInitialDebugUIState);
	const [theme, setTheme] = useState<"dark" | "light">("dark");
	const [leftTab, setLeftTab] = useState<LeftTabKey>("builds");
	const socketRef = useRef<WebSocket | null>(null);
	const importFileRef = useRef<HTMLInputElement | null>(null);

	function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			try {
				const session = JSON.parse(
					reader.result as string,
				) as BuildTraceSession;
				startTransition(() => {
					setState((current) => loadTraceFile(current, session));
				});
			} catch {
				// Invalid file — silently ignore
			}
		};
		reader.readAsText(file);
		// Reset so re-importing the same file triggers the event again
		e.target.value = "";
	}

	useEffect(() => {
		if (theme === "light") {
			document.documentElement.dataset.theme = "light";
		} else {
			delete document.documentElement.dataset.theme;
		}
	}, [theme]);

	const selectedBuild = getSelectedBuild(state);
	const selectedFile = getSelectedFile(state);
	const selectedStep = getSelectedStep(state);
	const selectedSummary = state.buildList.find(
		(build) => build.id === state.selectedBuildId,
	);

	const deferredBuildList = useDeferredValue(state.buildList);
	const deferredRegistry = useDeferredValue(state.registry);
	const deferredWatcherEvents = useDeferredValue(state.watcherEvents);

	const handleMessage = useEffectEvent((message: DebugBuildMessage) => {
		startTransition(() => {
			setState((current) => applyDebugMessage(current, message));
		});
	});

	useEffect(() => {
		let cancelled = false;
		const protocol = window.location.protocol === "https:" ? "wss" : "ws";
		const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
		socketRef.current = socket;

		void (async () => {
			const [session, buildList, registry] = await Promise.all([
				fetchJson<BuildTraceSession | null>("/api/session"),
				fetchJson<BuildTraceBuildSummary[]>("/api/builds"),
				fetchJson<DebugRegistryEntry[]>("/api/registry"),
			]);

			if (cancelled) return;
			startTransition(() => {
				setState((current) =>
					hydrateDebugUIState(current, { session, buildList, registry }),
				);
			});
		})();

		socket.addEventListener("open", () => {
			startTransition(() => {
				setState((current) => setConnectionState(current, "open"));
			});
		});

		socket.addEventListener("close", () => {
			startTransition(() => {
				setState((current) => setConnectionState(current, "closed"));
			});
		});

		socket.addEventListener("message", (event) => {
			handleMessage(JSON.parse(event.data) as DebugBuildMessage);
		});

		return () => {
			cancelled = true;
			socket.close();
			socketRef.current = null;
		};
	}, []);

	useEffect(() => {
		if (!state.selectedBuildId) return;
		let cancelled = false;

		void fetchJson<BuildTraceBuild | null>(
			`/api/builds/${state.selectedBuildId}`,
		).then((build) => {
			if (cancelled || !build) return;
			startTransition(() => {
				setState((current) => upsertBuild(current, build));
			});
		});

		return () => {
			cancelled = true;
		};
	}, [state.selectedBuildId]);

	useEffect(() => {
		if (!state.selectedBuildId || !selectedStep) return;
		const buildId = state.selectedBuildId;
		const snapshotIds = [
			...new Set([selectedStep.beforeSnapshotId, selectedStep.afterSnapshotId]),
		].filter((snapshotId): snapshotId is string => Boolean(snapshotId));
		let cancelled = false;

		for (const snapshotId of snapshotIds) {
			if (state.snapshots[getSnapshotKey(buildId, snapshotId)]) continue;
			void fetchJson<BuildTraceSnapshot | null>(
				`/api/builds/${buildId}/snapshots/${snapshotId}`,
			).then((snapshot) => {
				if (cancelled || !snapshot) return;
				startTransition(() => {
					setState((current) => storeSnapshot(current, buildId, snapshot));
				});
			});
		}

		return () => {
			cancelled = true;
		};
	}, [state.selectedBuildId, selectedStep, state.snapshots]);

	const beforeSnapshot =
		state.selectedBuildId && selectedStep?.beforeSnapshotId
			? state.snapshots[
					getSnapshotKey(state.selectedBuildId, selectedStep.beforeSnapshotId)
				]
			: null;
	const afterSnapshot =
		state.selectedBuildId && selectedStep?.afterSnapshotId
			? state.snapshots[
					getSnapshotKey(state.selectedBuildId, selectedStep.afterSnapshotId)
				]
			: null;

	const selectedLanguage = inferLanguage(
		selectedFile?.path,
		selectedStep?.loaderAfter ?? selectedStep?.loaderBefore,
	);

	return (
		<div className="flex h-screen flex-col overflow-hidden" data-theme={theme}>
			{/* ── Top bar ── */}
			<div className="t-surface border-b px-4 py-2 flex items-center justify-between shrink-0">
				<div className="flex items-center gap-2 text-xs">
					<span className="t-accent font-semibold">frame-master</span>
					<span className="t-faint">/</span>
					<span className="t-dim">debug build</span>
				</div>
				<div className="flex items-center gap-3 text-xs">
					<span className="t-dim">{window.location.host}</span>
					<span className="t-faint">·</span>
					<span className="t-muted">
						{deferredBuildList.length} <span className="t-faint">builds</span>
					</span>
					<span className="t-muted">
						{deferredRegistry.length} <span className="t-faint">plugins</span>
					</span>
					<span className="t-muted">
						{String(state.session?.options.watch ?? false)}{" "}
						<span className="t-faint">watch</span>
					</span>
					<span className={state.connection === "open" ? "t-ok" : "t-run"}>
						● {state.connection}
					</span>
					<div className="flex items-center gap-1.5 ml-2">
						<button
							type="button"
							onClick={() =>
								socketRef.current?.send(
									JSON.stringify({ type: "trigger-rebuild" }),
								)
							}
							className="t-btn-accent"
						>
							rebuild
						</button>
						<a
							href="/api/export"
							download="frame-master-debug-trace.json"
							className="t-btn"
						>
							export
						</a>
						<button
							type="button"
							onClick={() => importFileRef.current?.click()}
							className="t-btn"
							title="Import a debug-trace.json file"
						>
							import trace
						</button>
						<input
							ref={importFileRef}
							type="file"
							accept=".json,application/json"
							className="hidden"
							onChange={handleImportFile}
						/>
						<button
							type="button"
							onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
							className="t-btn"
							title="Toggle light/dark theme"
						>
							{theme === "dark" ? "☀" : "◗"}
						</button>
					</div>
				</div>
			</div>

			{/* ── Main 2-column layout ── */}
			<div className="flex flex-1 overflow-hidden">
				{/* Left panel — tabbed */}
				<div className="w-60 shrink-0 border-r flex flex-col overflow-hidden">
					{/* Tab bar */}
					<div className="flex shrink-0 border-b">
						{LEFT_TABS.map((tab) => (
							<button
								key={tab.key}
								type="button"
								onClick={() => setLeftTab(tab.key)}
								className={`flex-1 px-2 py-1.5 text-xs transition-colors${
									leftTab === tab.key
										? " t-accent font-semibold border-b-2 border-current -mb-px"
										: " t-faint t-hover"
								}`}
							>
								{tab.label}
							</button>
						))}
					</div>

					{/* Tab: builds + watch feed */}
					{leftTab === "builds" && (
						<>
							<div className="flex-1 overflow-y-auto">
								{deferredBuildList.length === 0 ? (
									<div className="px-3 py-6 text-xs t-faint text-center">
										no builds yet
									</div>
								) : (
									deferredBuildList.map((build) => {
										const isSelected = state.selectedBuildId === build.id;
										return (
											<button
												key={build.id}
												type="button"
												onClick={() => {
													startTransition(() => {
														setState((current) =>
															selectBuild(current, build.id),
														);
													});
												}}
												className={`w-full px-3 py-2.5 text-left border-b transition-colors t-hover${
													isSelected ? " t-selected" : ""
												}`}
											>
												<div className="flex items-center justify-between gap-2">
													<span
														className={`text-xs font-medium ${isSelected ? "t-accent" : "t-text"}`}
													>
														#{build.sequence}
													</span>
													<span
														className={`t-badge ${statusBadge(build.status)}`}
													>
														{statusLabel(build.status)}
													</span>
												</div>
												<div className="mt-1 text-xs t-dim">
													{new Date(build.startedAt).toLocaleTimeString()}
												</div>
												<div className="mt-0.5 text-xs t-faint">
													{build.fileCount}f · {build.stepCount}s ·{" "}
													{build.outputCount}o
												</div>
											</button>
										);
									})
								)}
							</div>
							<div className="t-section-label border-t border-b shrink-0">
								watch feed
							</div>
							<div className="max-h-40 overflow-y-auto shrink-0">
								{deferredWatcherEvents.length === 0 ? (
									<div className="px-3 py-3 text-xs t-faint text-center">
										no events
									</div>
								) : (
									deferredWatcherEvents.map((event) => (
										<div
											key={`${event.eventType}:${event.filePath}`}
											className="border-b px-3 py-2"
										>
											<div className="text-xs t-faint">{event.eventType}</div>
											<div className="mt-0.5 text-xs t-dim break-all">
												{event.filePath}
											</div>
										</div>
									))
								)}
							</div>
						</>
					)}

					{/* Tab: files + steps */}
					{leftTab === "files" && (
						<div className="flex flex-col flex-1 overflow-hidden">
							<div
								className="flex flex-col overflow-hidden"
								style={{ flex: "1 1 50%" }}
							>
								<div className="t-section-label border-b shrink-0">files</div>
								<div className="flex-1 overflow-y-auto">
									{selectedBuild?.files.length ? (
										selectedBuild.files.map((file) => {
											const isSelected = selectedFile?.id === file.id;
											return (
												<button
													key={file.id}
													type="button"
													onClick={() => {
														const firstStep = file.steps[0];
														if (!firstStep) return;
														startTransition(() => {
															setState((current) =>
																selectStep(current, file.id, firstStep.id),
															);
														});
													}}
													className={`w-full px-3 py-2 text-left border-b transition-colors t-hover${
														isSelected ? " t-selected" : ""
													}`}
												>
													<div
														className={`text-xs break-all ${isSelected ? "t-text" : "t-muted"}`}
													>
														{file.path}
													</div>
													<div className="mt-0.5 text-xs t-faint">
														{file.steps.length}s · {file.finalLoader ?? "?"} ·{" "}
														{file.finalSize}b
													</div>
												</button>
											);
										})
									) : (
										<div className="px-3 py-6 text-xs t-faint text-center">
											select a build
										</div>
									)}
								</div>
							</div>

							<div
								className="flex flex-col overflow-hidden border-t"
								style={{ flex: "1 1 50%" }}
							>
								<div className="t-section-label border-b shrink-0">steps</div>
								<div className="flex-1 overflow-y-auto">
									{selectedFile?.steps.length ? (
										selectedFile.steps.map((step) => {
											const isSelected = selectedStep?.id === step.id;
											return (
												<button
													key={step.id}
													type="button"
													onClick={() => {
														startTransition(() => {
															setState((current) =>
																selectStep(current, selectedFile.id, step.id),
															);
														});
													}}
													className={`w-full px-3 py-2 text-left border-b transition-colors t-hover${
														isSelected ? " t-selected" : ""
													}`}
												>
													<div className="flex items-center justify-between gap-2">
														<span
															className={`text-xs font-medium ${step.error ? "t-err" : isSelected ? "t-accent" : "t-muted"}`}
														>
															{step.pluginName ?? "core"}
															{step.error && (
																<span className="ml-1 t-badge t-badge-err">
																	{step.error.name}
																</span>
															)}
														</span>
														<span className="text-xs t-dim">
															{formatDuration(step.durationMs)}
														</span>
													</div>
													<div className="mt-0.5 text-xs t-faint">
														{step.kind} · {step.loaderBefore ?? "-"} →{" "}
														{step.loaderAfter ?? "-"} · order {step.order}
													</div>
													<div className="mt-0.5 text-xs t-faint">
														{step.sizeBefore}b → {step.sizeAfter}b
													</div>
													{step.error && (
														<div
															className="mt-1 text-xs t-err truncate"
															title={step.error.message}
														>
															{step.error.message}
														</div>
													)}
												</button>
											);
										})
									) : (
										<div className="px-3 py-6 text-xs t-faint text-center">
											select a file
										</div>
									)}
								</div>
							</div>
						</div>
					)}

					{/* Tab: info (registry + step details + session) */}
					{leftTab === "info" && (
						<div className="flex flex-col flex-1 overflow-hidden">
							<div className="t-section-label border-b shrink-0">registry</div>
							<div className="flex-1 overflow-y-auto">
								{deferredRegistry.map((plugin) => (
									<div key={plugin.name} className="border-b px-3 py-2.5">
										<div className="flex items-center justify-between gap-2">
											<span className="text-xs t-text font-medium truncate">
												{plugin.name}
											</span>
											<span className="text-xs t-faint shrink-0">
												p{plugin.priority}
											</span>
										</div>
										<div className="text-xs t-dim mt-0.5">
											v{plugin.version}
										</div>
										<div className="mt-1.5 flex items-center gap-2 text-xs">
											<span className="t-muted">
												{plugin.metrics.interventions} hits
											</span>
											<span className="t-faint">·</span>
											<span className="t-muted">
												{formatDuration(plugin.metrics.totalMs)}
											</span>
										</div>
										<div className="mt-0.5 text-xs t-faint">
											{plugin.metrics.fileCount}f · {plugin.metrics.buildCount}b
											· {formatDuration(plugin.metrics.onLoadMs)}
										</div>
										{plugin.dependencies.length > 0 && (
											<div className="mt-1 text-xs t-faint">
												{plugin.dependencies
													.map((d) => `${d.name}${d.satisfied ? "" : " !"}`)
													.join(", ")}
											</div>
										)}
									</div>
								))}
							</div>

							<div className="t-section-label border-t border-b shrink-0">
								step
							</div>
							<div className="border-b px-3 py-2.5 shrink-0">
								{selectedStep ? (
									<div className="space-y-1 text-xs">
										{(
											[
												["kind", selectedStep.kind],
												["plugin", selectedStep.pluginName ?? "core"],
												[
													"loader",
													`${selectedStep.loaderBefore ?? "-"} → ${selectedStep.loaderAfter ?? "-"}`,
												],
												[
													"size",
													`${selectedStep.sizeBefore}b → ${selectedStep.sizeAfter}b`,
												],
											] as const
										).map(([k, v]) => (
											<div key={k} className="flex gap-2">
												<span className="t-faint w-10 shrink-0">{k}</span>
												<span className="t-dim">{v}</span>
											</div>
										))}
										{selectedStep.error && (
											<div className="flex gap-2 mt-1">
												<span className="t-faint w-10 shrink-0">error</span>
												<span className="t-err break-all">
													{selectedStep.error.name}:{" "}
													{selectedStep.error.message}
												</span>
											</div>
										)}
									</div>
								) : (
									<span className="text-xs t-faint">no step selected</span>
								)}
							</div>

							<div className="t-section-label border-b shrink-0">session</div>
							<div className="px-3 py-2.5 text-xs shrink-0">
								<div className="flex gap-2">
									<span className="t-faint w-12 shrink-0">started</span>
									<span className="t-dim">
										{state.session
											? new Date(state.session.startedAt).toLocaleTimeString()
											: "pending"}
									</span>
								</div>
								<div className="flex gap-2 mt-1">
									<span className="t-faint w-12 shrink-0">trace</span>
									<span className="t-dim break-all">
										{state.lastSavedTracePath ?? "not saved"}
									</span>
								</div>
							</div>
						</div>
					)}
				</div>

				{/* Center — diff editor (full height) */}
				<div className="flex flex-1 flex-col overflow-hidden">
					{/* Build summary bar */}
					<div className="t-surface border-b px-4 py-2 flex items-center gap-3 text-xs shrink-0">
						{selectedSummary ? (
							<>
								<span className="t-text font-medium">
									build #{selectedSummary.sequence}
								</span>
								<span
									className={`t-badge ${statusBadge(selectedSummary.status)}`}
								>
									{statusLabel(selectedSummary.status)}
								</span>
								<span className="t-dim">
									{formatDuration(selectedSummary.durationMs)}
								</span>
								<span className="t-dim">{selectedSummary.fileCount} files</span>
								<span className="t-dim">{selectedSummary.stepCount} steps</span>
								<div className="flex gap-2 ml-2 min-w-0">
									{selectedSummary.entrypoints?.map((ep) => (
										<span key={ep} className="t-faint truncate">
											{ep}
										</span>
									))}
								</div>
							</>
						) : (
							<span className="t-faint">no build selected</span>
						)}
					</div>

					{/* Diff info bar */}
					<div className="t-surface border-b px-3 py-1.5 flex items-center gap-2 text-xs shrink-0">
						<span className="t-dim">diff</span>
						{selectedStep ? (
							<>
								<span className="t-faint">·</span>
								<span className="t-dim">
									{selectedStep.pluginName ?? "core"}
								</span>
								<span className="t-faint">·</span>
								<span className="t-dim">{selectedLanguage}</span>
								<span className="t-faint">·</span>
								<span className="t-faint">
									{selectedStep.sizeBefore}b → {selectedStep.sizeAfter}b
								</span>
								{selectedFile && (
									<>
										<span className="t-faint">·</span>
										<span className="t-faint truncate max-w-xs">
											{selectedFile.path}
										</span>
									</>
								)}
							</>
						) : (
							<span className="t-faint">
								select a build → open files tab → pick file and step
							</span>
						)}
					</div>

					{/* Monaco diff — takes all remaining height */}
					<div className="flex-1 overflow-hidden">
						{selectedStep?.error ? (
							<StepErrorPanel error={selectedStep.error} />
						) : (
							<MonacoDiff
								language={selectedLanguage}
								original={snapshotText(beforeSnapshot)}
								modified={snapshotText(afterSnapshot)}
								className="h-full"
								theme={theme}
							/>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
