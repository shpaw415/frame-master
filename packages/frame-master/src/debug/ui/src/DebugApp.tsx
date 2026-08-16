import {
	startTransition,
	useDeferredValue,
	useEffect,
	useEffectEvent,
	useRef,
	useState,
} from "react";
import Alert from "@shpaw415/mui-lite/Alert";
import AppBar from "@shpaw415/mui-lite/AppBar";
import Box from "@shpaw415/mui-lite/Box";
import Button from "@shpaw415/mui-lite/Button";
import Chip from "@shpaw415/mui-lite/Chip";
import CssBaseline from "@shpaw415/mui-lite/CssBaseline";
import Divider from "@shpaw415/mui-lite/Divider";
import Drawer from "@shpaw415/mui-lite/Drawer";
import IconButton from "@shpaw415/mui-lite/IconButton";
import {
	List,
	ListItemButton,
	ListItemText,
	ListSubheader,
} from "@shpaw415/mui-lite/List";
import Paper from "@shpaw415/mui-lite/Paper";
import Select from "@shpaw415/mui-lite/Select";
import { Tab } from "@shpaw415/mui-lite/Tabs";
import Tabs from "@shpaw415/mui-lite/Tabs";
import { DefaultTheme, ThemeProvider } from "@shpaw415/mui-lite/theme";
import TextField from "@shpaw415/mui-lite/TextField";
import Toolbar from "@shpaw415/mui-lite/Toolbar";
import Typography from "@shpaw415/mui-lite/Typography";
import {
	CloudUpload,
	ChevronDown,
	ChevronRight,
	Download,
	Menu,
	Moon,
	RefreshCw,
	Search,
	Sun,
	X,
} from "lucide-react";
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

const VIRTUAL_MODULE_NAMESPACE = "frame-master-virtual-module";

// ── Left-panel tab registry ───────────────────────────────────────────────────
// Add new entries here to extend the menu.
type LeftTabKey = "builds" | "files" | "info";
type DrawerSectionKey =
	| "files"
	| "steps"
	| "registry"
	| "step"
	| "session";

const LEFT_TABS: { key: LeftTabKey; label: string }[] = [
	{ key: "builds", label: "builds" },
	{ key: "files", label: "files" },
	{ key: "info", label: "info" },
];

function DrawerSectionHeader({
	expanded,
	label,
	onToggle,
}: {
	expanded: boolean;
	label: string;
	onToggle: () => void;
}) {
	return (
		<>
			<ListItemButton
				aria-expanded={expanded}
				onClick={onToggle}
				sx={{ minHeight: 40, px: 2, py: 0.5 }}
			>
				<ListItemText
					primary={label}
					SlotProps={{
						primary: {
							sx: {
								fontSize: "0.75rem",
								letterSpacing: "0.08em",
								textTransform: "uppercase",
							},
						},
					}}
				/>
				{expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
			</ListItemButton>
			<Divider />
		</>
	);
}

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

function statusColor(status: BuildTraceBuildStatus) {
	if (status === "success") return "success" as const;
	if (status === "error") return "error" as const;
	return "warning" as const;
}

function isVirtualModule(namespace?: string) {
	return namespace === VIRTUAL_MODULE_NAMESPACE;
}

function StepErrorPanel({ error }: { error: BuildTraceStepError }) {
	return (
		<Box sx={{ display: "flex", height: "100%", flexDirection: "column", gap: 2, overflow: "auto", p: 3 }}>
			{/* Error type + message */}
			<Alert severity="error">
				<strong>{error.name}</strong>: {error.message}
			</Alert>

			{/* Stack trace */}
			{error.stack && (
				<Paper variant="outlined" sx={{ p: 2 }}>
					<Typography variant="overline">Stack trace</Typography>
					<pre>
						{/* Strip the first line of the stack if it duplicates name+message */}
						{error.stack.startsWith(`${error.name}: ${error.message}`)
							? error.stack
									.slice(`${error.name}: ${error.message}`.length)
									.trimStart()
							: error.stack}
					</pre>
				</Paper>
			)}

			{/* Cause chain */}
			{error.cause && (
				<Paper variant="outlined" sx={{ p: 2 }}>
					<Typography variant="overline">Caused by</Typography>
					<pre>
						{error.cause}
					</pre>
				</Paper>
			)}

			{/* Extra properties */}
			{error.extra && Object.keys(error.extra).length > 0 && (
				<Paper variant="outlined" sx={{ p: 2 }}>
					<Typography variant="overline">Extra</Typography>
					<Box sx={{ display: "grid", gridTemplateColumns: "minmax(96px, max-content) minmax(0, 1fr)", gap: 1, mt: 1 }}>
						{Object.entries(error.extra).map(([k, v]) => (
							<Box key={k} sx={{ display: "contents" }}>
								<Typography variant="caption" sx={{ color: "text.secondary" }}>{k}</Typography>
								<Typography variant="caption" sx={{ overflowWrap: "anywhere" }}>{v}</Typography>
							</Box>
						))}
					</Box>
				</Paper>
			)}
		</Box>
	);
}

export default function DebugApp() {
	const [state, setState] = useState(createInitialDebugUIState);
	const [theme, setTheme] = useState<"dark" | "light">("dark");
	const [leftTab, setLeftTab] = useState<LeftTabKey>("builds");
	const [expandedSections, setExpandedSections] = useState<
		Record<DrawerSectionKey, boolean>
	>({
		files: true,
		steps: true,
		registry: true,
		step: true,
		session: true,
	});
	const [pipelineFilter, setPipelineFilter] = useState("all");
	const [fileNameFilter, setFileNameFilter] = useState("");
	const [fileTypeFilter, setFileTypeFilter] = useState("all");
	const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
	const [isDesktopDrawer, setIsDesktopDrawer] = useState(
		() => window.matchMedia("(min-width: 900px)").matches,
	);
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

	useEffect(() => {
		const query = window.matchMedia("(min-width: 900px)");
		const updateDrawerVariant = () => {
			setIsDesktopDrawer(query.matches);
			if (query.matches) setMobileNavigationOpen(false);
		};
		updateDrawerVariant();
		query.addEventListener("change", updateDrawerVariant);
		return () => query.removeEventListener("change", updateDrawerVariant);
	}, []);

	const selectedBuild = getSelectedBuild(state);
	const selectedFile = getSelectedFile(state);
	const selectedStep = getSelectedStep(state);
	const selectedSummary = state.buildList.find(
		(build) => build.id === state.selectedBuildId,
	);

	const deferredBuildList = useDeferredValue(state.buildList);
	const visibleBuildList = deferredBuildList.filter(
		(build) => pipelineFilter === "all" || build.pipelineId === pipelineFilter,
	);
	const deferredRegistry = useDeferredValue(state.registry);
	const deferredWatcherEvents = useDeferredValue(state.watcherEvents);
	const toggleSection = (section: DrawerSectionKey) => {
		setExpandedSections((current) => ({
			...current,
			[section]: !current[section],
		}));
	};
	const deferredFileNameFilter = useDeferredValue(fileNameFilter.trim().toLowerCase());
	const availableFileTypes = [
		...new Set(
			(selectedBuild?.files ?? [])
				.map((file) => file.finalLoader)
				.filter((loader): loader is Bun.Loader => Boolean(loader)),
		),
	].sort();
	const filteredFiles = (selectedBuild?.files ?? []).filter((file) => {
		const matchesName =
			!deferredFileNameFilter ||
			file.path.toLowerCase().includes(deferredFileNameFilter);
		const matchesType =
			fileTypeFilter === "all" || file.finalLoader === fileTypeFilter;
		return matchesName && matchesType;
	});

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

	const debugTheme = { ...DefaultTheme, theme };
	const isLive = state.connection !== "closed";

	return (
		<ThemeProvider
			theme={debugTheme}
			data-theme={theme}
		>
			<Box sx={{ display: "flex", height: "100vh", minWidth: 0, flexDirection: "column", overflow: "hidden", bgcolor: "background.default" }}>
			{/* ── Top bar ── */}
			<AppBar position="static" elevation={0}>
				<Toolbar sx={{ display: "flex", minHeight: { xs: 56, sm: 64 }, gap: { xs: 1, sm: 2 }, alignItems: "center", flexWrap: { xs: "wrap", md: "nowrap" }, overflow: "hidden" }}>
					<IconButton
						type="button"
						sx={{ display: { xs: "inline-flex", md: "none" } }}
						onClick={() => setMobileNavigationOpen(c => !c)}
						aria-label="Open debug navigation"
					>
						<Menu size={20} />
					</IconButton>
					<Box sx={{ display: "flex", minWidth: 0, flex: { xs: 1, sm: "0 0 auto" }, flexDirection: "column" }}>
						<Typography variant="subtitle1">Frame Master</Typography>
						<Typography sx={{ display: { xs: "none", sm: "block" } }} variant="caption">Build debugger</Typography>
					</Box>
					<Box sx={{ display: { xs: "none", md: "flex" }, minWidth: 0, flex: 1, gap: 1, alignItems: "center", overflow: "hidden" }}>
						<Typography variant="caption">{window.location.host}</Typography>
						<Chip size="small">{deferredBuildList.length} builds</Chip>
						<Chip size="small">{deferredRegistry.length} plugins</Chip>
						<Chip size="small">watch {String(state.session?.options.watch ?? false)}</Chip>
						<Chip size="small" color={state.connection === "open" ? "success" : "warning"}>
							{state.connection}
						</Chip>
					</Box>
					<Box sx={{ display: "flex", gap: 1, alignItems: "center", justifyContent: "flex-end" }}>
						<Button
							type="button"
							onClick={() =>
								socketRef.current?.send(
									JSON.stringify({ type: "trigger-rebuild" }),
								)
							}
							variant="contained"
							size="small"
							sx={{ display: { xs: "none", md: "inline-flex" } }}
							startIcon={<RefreshCw size={15} />}
							disabled={!isLive}
							title={isLive ? "Trigger a new build" : "Unavailable while viewing a saved trace"}
						>
							Rebuild
						</Button>
						<Button
							href="/api/export"
							download="frame-master-debug-trace.json"
							variant="outlined"
							size="small"
							sx={{ display: { xs: "none", md: "inline-flex" } }}
							startIcon={<Download size={15} />}
						>
							Export
						</Button>
						<Button
							type="button"
							onClick={() => importFileRef.current?.click()}
							variant="outlined"
							size="small"
							sx={{ display: { xs: "none", md: "inline-flex" } }}
							startIcon={<CloudUpload size={15} />}
							title="Import a debug-trace.json file"
						>
							Import trace
						</Button>
						<input
							ref={importFileRef}
							type="file"
							accept=".json,application/json"
							style={{ display: "none" }}
							onChange={handleImportFile}
						/>
						<IconButton
							type="button"
							sx={{ display: { xs: "none", md: "inline-flex" } }}
							onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
							title="Toggle light/dark theme"
							aria-label="Toggle light and dark theme"
						>
							{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
						</IconButton>
					</Box>
					<Box sx={{ display: { xs: "flex", md: "none" }, width: { xs: "100%", md: "auto" }, gap: 0.5, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", pb: { xs: 1, md: 0 } }}>
						<Button type="button" onClick={() => socketRef.current?.send(JSON.stringify({ type: "trigger-rebuild" }))} disabled={!isLive} size="small" startIcon={<RefreshCw size={16} />}>Build</Button>
						<Button href="/api/export" download="frame-master-debug-trace.json" size="small" startIcon={<Download size={16} />}>Export</Button>
						<Button type="button" onClick={() => importFileRef.current?.click()} size="small" startIcon={<CloudUpload size={16} />}>Import</Button>
						<Button type="button" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} size="small" startIcon={theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}>Theme</Button>
					</Box>
				</Toolbar>
			</AppBar>

			{/* ── Main 2-column layout ── */}
			<Box sx={{ display: "flex", minHeight: 0, flex: 1, overflow: "hidden" }}>
				<Box sx={{ display: { xs: "contents", md: "flex" }, width: { md: 280, lg: 304 }, flex: "0 0 auto", minWidth: 0 }}>
				<Drawer
					open={isDesktopDrawer || mobileNavigationOpen}
					variant={isDesktopDrawer ? "permanent" : "temporary"}
					width={304}
					minifiedWidth={280}
					onClose={() => setMobileNavigationOpen(false)}
				>
					<Box sx={{ display: { xs: "flex", md: "none" }, justifyContent: "flex-end", p: 1 }}>
						<IconButton type="button" onClick={() => setMobileNavigationOpen(false)} aria-label="Close debug navigation">
							<X size={20} />
						</IconButton>
					</Box>
					{/* Tab bar */}
					<Tabs
						value={leftTab}
						onChange={(_, value) => {
							setLeftTab(value as LeftTabKey);
						}}
						variant="fullWidth"
						aria-label="Debug navigation"
					>
						{LEFT_TABS.map((tab) => (
							<Tab
								key={tab.key}
								value={tab.key}
								label={tab.label}
							/>
						))}
					</Tabs>

					{/* Tab: builds + watch feed */}
					{leftTab === "builds" && (
						<>
							{(state.session?.pipelines?.length ?? 0) > 1 && (
								<Box sx={{ p: 1.5 }}>
									<Select
										name="debug-pipeline"
										label="Pipeline"
										value={pipelineFilter}
										onSelect={(pipelineId) => {
											setPipelineFilter(pipelineId);
											const nextBuild = deferredBuildList.find(
												(build) => pipelineId === "all" || build.pipelineId === pipelineId,
											);
											if (nextBuild) {
												startTransition(() => {
													setState((current) => selectBuild(current, nextBuild.id));
												});
											}
										}}
									>
										{[
											<option key="all" value="all">All pipelines</option>,
											...(state.session?.pipelines ?? []).map((pipeline) => (
												<option key={pipeline.id} value={pipeline.id}>
													{pipeline.label}
												</option>
											)),
										]}
									</Select>
								</Box>
							)}
							<Box sx={{ flex: 1, overflowY: "auto" }}>
								{visibleBuildList.length === 0 ? (
									<Typography align="center" color="textSecondary" sx={{ p: 3 }} variant="caption">no builds yet</Typography>
								) : (
									<List disablePadding>
										{visibleBuildList.map((build) => {
										const isSelected = state.selectedBuildId === build.id;
										return (
											<ListItemButton
												key={build.id}
												selected={isSelected}
												sx={{ borderBottom: 1, borderColor: "divider" }}
												onClick={() => {
													startTransition(() => {
														setState((current) =>
															selectBuild(current, build.id),
														);
													});
												}}
											>
												<Box sx={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
													<Typography variant="body2">#{build.sequence}</Typography>
													<Chip size="small" color={statusColor(build.status)}>
														{statusLabel(build.status)}
													</Chip>
												</Box>
												<Typography variant="caption" color="textSecondary">{new Date(build.startedAt).toLocaleTimeString()}</Typography>
											{build.pipelineLabel && (
												<Typography variant="caption" color="primary">{build.pipelineLabel}</Typography>
											)}
												<Typography variant="caption" color="textSecondary">{build.fileCount} files · {build.stepCount} steps · {build.outputCount} outputs</Typography>
											</ListItemButton>
										);
										})}
									</List>
								)}
							</Box>
							<Divider />
							<Typography sx={{ px: 2, py: 1 }} variant="overline">Watch feed</Typography>
							<Divider />
							<Box sx={{ maxHeight: 160, overflowY: "auto", flexShrink: 0 }}>
								{deferredWatcherEvents.length === 0 ? (
									<Typography align="center" color="textSecondary" sx={{ p: 2 }} variant="caption">no events</Typography>
								) : (
									deferredWatcherEvents.map((event) => (
										<Box
											key={`${event.eventType}:${event.filePath}`}
											sx={{ p: 1.5, borderBottom: 1, borderColor: "divider" }}
										>
											<Typography variant="caption" color="textSecondary">{event.eventType}</Typography>
											<Typography variant="caption" sx={{ display: "block", overflowWrap: "anywhere" }}>{event.filePath}</Typography>
										</Box>
									))
								)}
							</Box>
						</>
					)}

					{/* Tab: files + steps */}
					{leftTab === "files" && (
						<Box sx={{ display: "flex", minHeight: 0, flex: 1, flexDirection: "column", overflow: "hidden" }}>
							<DrawerSectionHeader
								expanded={expandedSections.files}
								label="Files"
								onToggle={() => toggleSection("files")}
							/>
							{expandedSections.files && (
								<Box sx={{ display: "flex", minHeight: 0, flex: "1 1 50%", flexDirection: "column", overflow: "hidden" }}>
								<Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "minmax(0, 1fr) minmax(132px, 0.4fr)" }, gap: 1.5, p: 1.5 }}>
									<TextField
										variant="outlined"
										label="Find files"
										value={fileNameFilter}
										onChange={(event) => setFileNameFilter(event.target.value)}
										startIcon={<Search size={16} />}
									/>
									<Select
										name="debug-file-type"
										label="File type"
										value={fileTypeFilter}
										onSelect={setFileTypeFilter}
									>
										{[
											<option key="all" value="all">All types</option>,
											...availableFileTypes.map((loader) => (
												<option key={loader} value={loader}>{loader}</option>
											)),
										]}
									</Select>
								</Box>
								<Box sx={{ flex: 1, overflowY: "auto" }}>
									{selectedBuild?.files.length ? (
										filteredFiles.length ? (
											filteredFiles.map((file) => {
											const isSelected = selectedFile?.id === file.id;
											return (
												<ListItemButton
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
													selected={isSelected}
													sx={{ borderBottom: 1, borderColor: "divider" }}
												>
														<ListItemText
															primary={file.path}
															secondary={`${isVirtualModule(file.namespace) ? "Virtual module · " : ""}${file.steps.length} steps · ${file.finalLoader ?? "?"} · ${file.finalSize} bytes`}
															SlotProps={{ primary: { sx: { overflowWrap: "anywhere", fontSize: "0.75rem" } }, secondary: { sx: { fontSize: "0.6875rem" } } }}
														/>
													</ListItemButton>
											);
											})
										) : (
											<Typography align="center" color="textSecondary" sx={{ p: 3 }} variant="caption">no files match these filters</Typography>
										)
									) : (
										<Typography align="center" color="textSecondary" sx={{ p: 3 }} variant="caption">select a build</Typography>
									)}
								</Box>
							</Box>
							)}

							<DrawerSectionHeader
								expanded={expandedSections.steps}
								label="Steps"
								onToggle={() => toggleSection("steps")}
							/>
							{expandedSections.steps && (
								<Box sx={{ display: "flex", minHeight: 0, flex: "1 1 50%", flexDirection: "column", overflow: "hidden" }}>
								<Box sx={{ flex: 1, overflowY: "auto" }}>
									{selectedFile?.steps.length ? (
										selectedFile.steps.map((step) => {
											const isSelected = selectedStep?.id === step.id;
											return (
											<ListItemButton
													key={step.id}
													type="button"
													onClick={() => {
														startTransition(() => {
														setState((current) =>
															selectStep(current, selectedFile.id, step.id),
														);
														});
													}}
												selected={isSelected}
												sx={{ borderBottom: 1, borderColor: "divider" }}
											>
												<Box sx={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
													<Typography color={step.error ? "error" : isSelected ? "primary" : "textSecondary"} variant="body2">
														{step.pluginName ?? "core"}
														{step.error && (
															<Chip color="error" label={step.error.name} size="small" sx={{ ml: 1 }} />
														)}
													</Typography>
													<Typography color="textSecondary" variant="caption">{formatDuration(step.durationMs)}</Typography>
												</Box>
												<Typography color="textSecondary" variant="caption">{step.kind} · {step.loaderBefore ?? "-"} → {step.loaderAfter ?? "-"} · order {step.order}</Typography>
												<Typography color="textSecondary" variant="caption">{step.sizeBefore} bytes → {step.sizeAfter} bytes</Typography>
												{step.error && (
													<Typography color="error" noWrap title={step.error.message} variant="caption">{step.error.message}</Typography>
												)}
											</ListItemButton>
											);
										})
									) : (
										<Typography align="center" color="textSecondary" sx={{ p: 3 }} variant="caption">select a file</Typography>
									)}
								</Box>
							</Box>
							)}
						</Box>
					)}

					{/* Tab: info (registry + step details + session) */}
					{leftTab === "info" && (
						<Box sx={{ display: "flex", minHeight: 0, flex: 1, flexDirection: "column", overflow: "hidden" }}>
							<DrawerSectionHeader
								expanded={expandedSections.registry}
								label="Registry"
								onToggle={() => toggleSection("registry")}
							/>
							{expandedSections.registry && (
							<Box sx={{ flex: 1, overflowY: "auto" }}>
								{deferredRegistry.map((plugin) => (
									<Box key={plugin.name} sx={{ p: 1.5, borderBottom: 1, borderColor: "divider" }}>
										<Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
											<Typography noWrap variant="body2">{plugin.name}</Typography>
											<Typography color="textSecondary" variant="caption">p{plugin.priority}</Typography>
										</Box>
										<Typography color="textSecondary" variant="caption">v{plugin.version}</Typography>
										<Typography color="textSecondary" variant="caption">{plugin.metrics.interventions} hits · {formatDuration(plugin.metrics.totalMs)}</Typography>
										<Typography color="textSecondary" variant="caption">{plugin.metrics.fileCount} files · {plugin.metrics.buildCount} builds · {formatDuration(plugin.metrics.onLoadMs)}</Typography>
										{plugin.dependencies.length > 0 && (
											<Typography color="textSecondary" sx={{ mt: 1 }} variant="caption">{plugin.dependencies.map((d) => `${d.name}${d.satisfied ? "" : " !"}`).join(", ")}</Typography>
										)}
									</Box>
								))}
							</Box>
							)}

							<DrawerSectionHeader
								expanded={expandedSections.step}
								label="Step"
								onToggle={() => toggleSection("step")}
							/>
							{expandedSections.step && (
							<Box sx={{ p: 1.5 }}>
								{selectedStep ? (
									<Box sx={{ display: "grid", gap: 0.5 }}>
										{(
												[
													["kind", selectedStep.kind],
													[
														"source",
														isVirtualModule(selectedFile?.namespace)
															? "plugin virtual module"
															: "file system",
													],
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
											<Box key={k} sx={{ display: "grid", gridTemplateColumns: "48px minmax(0, 1fr)", gap: 1 }}>
												<Typography color="textSecondary" variant="caption">{k}</Typography>
												<Typography variant="caption">{v}</Typography>
											</Box>
										))}
										{selectedStep.error && (
											<Box sx={{ display: "grid", gridTemplateColumns: "48px minmax(0, 1fr)", gap: 1 }}><Typography color="textSecondary" variant="caption">error</Typography><Typography color="error" sx={{ overflowWrap: "anywhere" }} variant="caption">{selectedStep.error.name}: {selectedStep.error.message}</Typography></Box>
										)}
									</Box>
								) : (
									<Typography color="textSecondary" variant="caption">no step selected</Typography>
								)}
							</Box>
							)}

							<DrawerSectionHeader
								expanded={expandedSections.session}
								label="Session"
								onToggle={() => toggleSection("session")}
							/>
							{expandedSections.session && (
							<Box sx={{ display: "grid", gridTemplateColumns: "48px minmax(0, 1fr)", gap: 1, p: 1.5 }}>
								<Typography color="textSecondary" variant="caption">started</Typography><Typography variant="caption">{state.session ? new Date(state.session.startedAt).toLocaleTimeString() : "pending"}</Typography>
								<Typography color="textSecondary" variant="caption">trace</Typography><Typography sx={{ overflowWrap: "anywhere" }} variant="caption">{state.lastSavedTracePath ?? "not saved"}</Typography>
							</Box>
							)}
						</Box>
					)}
				</Drawer>
				</Box>

				{/* Center — diff editor (full height) */}
				<Box sx={{ display: "flex", minWidth: 0, flex: 1, flexDirection: "column", overflow: "hidden" }}>
					{/* Build summary bar */}
					<Box sx={{ display: "flex", flexShrink: 0, flexWrap: "wrap", gap: 1.5, alignItems: "center", borderBottom: 1, borderColor: "divider", p: 1.5 }}>
						{selectedSummary ? (
							<>
								<Typography variant="body2">build #{selectedSummary.sequence}</Typography>
								<Chip size="small" color={statusColor(selectedSummary.status)}>
									{statusLabel(selectedSummary.status)}
								</Chip>
								<Typography color="textSecondary" variant="caption">{formatDuration(selectedSummary.durationMs)}</Typography>
								<Typography color="textSecondary" variant="caption">{selectedSummary.fileCount} files</Typography>
								<Typography color="textSecondary" variant="caption">{selectedSummary.stepCount} steps</Typography>
								<Box sx={{ display: "flex", minWidth: 0, gap: 1 }}>
									{selectedSummary.entrypoints?.map((ep) => (
										<Typography key={ep} color="textSecondary" noWrap variant="caption">{ep}</Typography>
									))}
								</Box>
							</>
						) : (
							<Typography color="textSecondary" variant="caption">no build selected</Typography>
						)}
					</Box>

					{/* Diff info bar */}
					<Box sx={{ display: "flex", flexShrink: 0, flexWrap: "wrap", gap: 1, alignItems: "center", borderBottom: 1, borderColor: "divider", px: 2, py: 1 }}>
						<Typography color="textSecondary" variant="caption">diff</Typography>
						{selectedStep ? (
							<>
								<Typography variant="caption">{selectedStep.pluginName ?? "core"}</Typography>
								<Typography color="textSecondary" variant="caption">{selectedLanguage}</Typography>
								<Typography color="textSecondary" variant="caption">{selectedStep.sizeBefore} bytes → {selectedStep.sizeAfter} bytes</Typography>
								{selectedFile && (
									<>
										<Typography color="textSecondary" noWrap sx={{ maxWidth: 320 }} variant="caption">{selectedFile.path}</Typography>
									</>
								)}
							</>
						) : (
							<Typography color="textSecondary" variant="caption">select a build → open files tab → pick file and step</Typography>
						)}
					</Box>

					{/* Monaco diff — takes all remaining height */}
					<Box sx={{ flex: 1, overflow: "hidden" }}>
						{selectedStep?.error ? (
							<StepErrorPanel error={selectedStep.error} />
						) : (
							<MonacoDiff
								language={selectedLanguage}
								original={snapshotText(beforeSnapshot)}
								modified={snapshotText(afterSnapshot)}
								theme={theme}
							/>
						)}
					</Box>
				</Box>
			</Box>
			</Box>
		</ThemeProvider>
	);
}
