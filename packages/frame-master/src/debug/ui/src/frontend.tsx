import { createRoot } from "react-dom/client";
import DebugApp from "./DebugApp";
import ErrorBoundary from "./ErrorBoundary";

const rootElement = document.getElementById("frame-master-debug-root");

if (!rootElement) {
	throw new Error("Missing frame-master-debug-root mount node.");
}

createRoot(rootElement).render(
	<ErrorBoundary>
		<DebugApp />
	</ErrorBoundary>,
);
