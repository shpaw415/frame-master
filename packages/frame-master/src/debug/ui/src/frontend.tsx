import { createRoot } from "react-dom/client";
import "@shpaw415/mui-lite/style.css";
import "./index.css";
import DebugApp from "./DebugApp";

const rootElement = document.getElementById("frame-master-debug-root");

if (!rootElement) {
	throw new Error("Missing frame-master-debug-root mount node.");
}

createRoot(rootElement).render(<DebugApp />);
