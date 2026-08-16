declare global {
	interface Window {
		__FM_DEBUG_BOOTED?: boolean;
	}
}

const rootElement = document.getElementById("frame-master-debug-root");

if (!rootElement) {
	throw new Error("Missing frame-master-debug-root mount node.");
}
const root = rootElement;

function showStartupError(error: unknown) {
	const message = error instanceof Error ? error.stack ?? error.message : String(error);
	root.replaceChildren();

	const heading = document.createElement("h1");
	heading.textContent = "Debug UI failed to start";
	const description = document.createElement("p");
	description.textContent =
		"The browser could not initialize the Frame-Master debug UI.";
	const details = document.createElement("pre");
	details.textContent = message;
	const reload = document.createElement("button");
	reload.type = "button";
	reload.textContent = "Reload debug UI";
	reload.onclick = () => window.location.reload();

	root.style.cssText =
		"box-sizing:border-box;display:block;font-family:system-ui,sans-serif;margin:0 auto;max-width:720px;padding:24px;";
	details.style.cssText =
		"background:#f5f2f5;overflow-x:auto;padding:16px;white-space:pre-wrap;";
	root.append(heading, description, details, reload);
}

root.textContent = "Loading Frame-Master debug UI...";

void Promise.all([
	import("react-dom/client"),
	import("./DebugApp"),
	import("./ErrorBoundary"),
])
	.then(([{ createRoot }, { default: DebugApp }, { default: ErrorBoundary }]) => {
		window.__FM_DEBUG_BOOTED = true;
		createRoot(root).render(
			<ErrorBoundary>
				<DebugApp />
			</ErrorBoundary>,
		);
	})
	.catch(showStartupError);
