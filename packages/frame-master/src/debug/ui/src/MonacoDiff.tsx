import { DiffEditor, type Monaco } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import { formatDebugSource } from "./format-debug-source";

type DiffEditorInstance = {
	getOriginalEditor: () => StandaloneEditor;
	getModifiedEditor: () => StandaloneEditor;
};

type StandaloneEditor = {
	getAction: (id: string) => { run: () => void | Promise<void> } | null;
	updateOptions: (options: { readOnly?: boolean; domReadOnly?: boolean }) => void;
};

const THEME_DARK = "fm-dark";
const THEME_LIGHT = "fm-light";
const COMPACT_QUERY = "(max-width: 899px)";

function registerThemes(monaco: Monaco) {
	monaco.editor.defineTheme(THEME_DARK, {
		base: "vs-dark",
		inherit: true,
		rules: [
			{ token: "", foreground: "abb2bf", background: "282c34" },
			{ token: "comment", foreground: "5c6370", fontStyle: "italic" },
			{ token: "comment.doc", foreground: "5c6370", fontStyle: "italic" },
			{ token: "string", foreground: "98c379" },
			{ token: "string.escape", foreground: "56b6c2" },
			{ token: "keyword", foreground: "c678dd" },
			{ token: "keyword.operator", foreground: "56b6c2" },
			{ token: "number", foreground: "d19a66" },
			{ token: "constant", foreground: "d19a66" },
			{ token: "constant.language", foreground: "e5c07b" },
			{ token: "type", foreground: "e5c07b" },
			{ token: "entity.name.type", foreground: "e5c07b" },
			{ token: "entity.name.function", foreground: "61afef" },
			{ token: "support.function", foreground: "61afef" },
			{ token: "variable", foreground: "e06c75" },
			{ token: "variable.language", foreground: "e06c75" },
			{ token: "punctuation", foreground: "abb2bf" },
			{ token: "delimiter", foreground: "abb2bf" },
			{ token: "tag", foreground: "e06c75" },
			{ token: "attribute.name", foreground: "d19a66" },
			{ token: "attribute.value", foreground: "98c379" },
		],
		colors: {
			"editor.background": "#282c34",
			"editor.foreground": "#abb2bf",
			"editor.lineHighlightBackground": "#2c313c",
			"editorGutter.background": "#282c34",
			"editorLineNumber.foreground": "#4b5263",
			"editorLineNumber.activeForeground": "#abb2bf",
			"editorCursor.foreground": "#528bff",
			"editorWhitespace.foreground": "#3b4048",
			"editorIndentGuide.background": "#3b4048",
			"editorIndentGuide.activeBackground": "#c678dd",
			"diffEditor.insertedTextBackground": "#98c37922",
			"diffEditor.removedTextBackground": "#e06c7522",
			"diffEditor.insertedLineBackground": "#98c37911",
			"diffEditor.removedLineBackground": "#e06c7511",
			"diffEditor.border": "#3e4451",
			"editorOverviewRuler.border": "#00000000",
			"scrollbarSlider.background": "#4b526344",
			"scrollbarSlider.hoverBackground": "#4b526366",
			"scrollbarSlider.activeBackground": "#4b526388",
			"minimap.background": "#282c34",
		},
	});

	monaco.editor.defineTheme(THEME_LIGHT, {
		base: "vs",
		inherit: true,
		rules: [
			{ token: "", foreground: "383a42", background: "fafafa" },
			{ token: "comment", foreground: "a0a1a7", fontStyle: "italic" },
			{ token: "string", foreground: "50a14f" },
			{ token: "string.escape", foreground: "0184bc" },
			{ token: "keyword", foreground: "a626a4" },
			{ token: "keyword.operator", foreground: "0184bc" },
			{ token: "number", foreground: "986801" },
			{ token: "constant", foreground: "986801" },
			{ token: "constant.language", foreground: "c18401" },
			{ token: "type", foreground: "c18401" },
			{ token: "entity.name.type", foreground: "c18401" },
			{ token: "entity.name.function", foreground: "4078f2" },
			{ token: "support.function", foreground: "4078f2" },
			{ token: "variable", foreground: "e45649" },
			{ token: "variable.language", foreground: "e45649" },
			{ token: "tag", foreground: "e45649" },
			{ token: "attribute.name", foreground: "986801" },
			{ token: "attribute.value", foreground: "50a14f" },
		],
		colors: {
			"editor.background": "#fafafa",
			"editor.foreground": "#383a42",
			"editor.lineHighlightBackground": "#f0f0f0",
			"editorGutter.background": "#fafafa",
			"editorLineNumber.foreground": "#9d9d9f",
			"editorLineNumber.activeForeground": "#383a42",
			"editorCursor.foreground": "#526fff",
			"diffEditor.insertedTextBackground": "#50a14f22",
			"diffEditor.removedTextBackground": "#e4564922",
			"diffEditor.insertedLineBackground": "#50a14f11",
			"diffEditor.removedLineBackground": "#e4564911",
			"diffEditor.border": "#d3d3d3",
			"editorOverviewRuler.border": "#00000000",
			"scrollbarSlider.background": "#9d9d9f44",
			"scrollbarSlider.hoverBackground": "#9d9d9f66",
			"scrollbarSlider.activeBackground": "#9d9d9f88",
			"minimap.background": "#fafafa",
		},
	});
}

async function formatStandaloneEditor(standalone: StandaloneEditor) {
	const action = standalone.getAction("editor.action.formatDocument");
	if (!action) return;
	standalone.updateOptions({ readOnly: false, domReadOnly: false });
	try {
		await action.run();
	} catch {
		return;
	} finally {
		standalone.updateOptions({ readOnly: true, domReadOnly: true });
	}
}

async function formatDiffEditor(diff: DiffEditorInstance) {
	await formatStandaloneEditor(diff.getOriginalEditor());
	await formatStandaloneEditor(diff.getModifiedEditor());
}

export default function MonacoDiff({
	original,
	modified,
	language,
	theme,
}: {
	original: string;
	modified: string;
	language?: string;
	theme?: "dark" | "light";
}) {
	const editorRef = useRef<DiffEditorInstance | null>(null);
	const formattedOriginal = formatDebugSource(original, language);
	const formattedModified = formatDebugSource(modified, language);
	const [compact, setCompact] = useState(
		() => window.matchMedia(COMPACT_QUERY).matches,
	);

	useEffect(() => {
		const query = window.matchMedia(COMPACT_QUERY);
		const update = () => setCompact(query.matches);
		update();
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	}, []);

	useEffect(() => {
		const diff = editorRef.current;
		if (!diff) return;
		void formatDiffEditor(diff);
	}, [formattedOriginal, formattedModified, language]);

	return (
		<div
			style={{
				height: "100%",
				minHeight: 0,
				minWidth: 0,
				overflow: "hidden",
				touchAction: "pan-x pan-y",
			}}
		>
			<DiffEditor
				original={formattedOriginal}
				modified={formattedModified}
				language={language}
				theme={theme === "light" ? THEME_LIGHT : THEME_DARK}
				height="100%"
				options={{
					automaticLayout: true,
					readOnly: true,
					domReadOnly: true,
					originalEditable: false,
					renderSideBySide: false,
					useInlineViewWhenSpaceIsLimited: true,
					enableSplitViewResizing: false,
					renderOverviewRuler: !compact,
					renderIndicators: !compact,
					fontFamily: "'IBM Plex Mono', 'Fira Code', monospace",
					fontLigatures: true,
					fontSize: compact ? 13 : 15,
					lineHeight: compact ? 18 : 20,
					padding: compact
						? { top: 8, bottom: 8 }
						: { top: 14, bottom: 14 },
					minimap: { enabled: false },
					scrollBeyondLastLine: false,
					wordWrap: "on",
					diffWordWrap: "on",
					wrappingStrategy: "advanced",
					fixedOverflowWidgets: true,
					contextmenu: !compact,
					mouseWheelZoom: false,
					smoothScrolling: true,
					links: !compact,
					parameterHints: { enabled: false },
					folding: !compact,
					glyphMargin: false,
					lineDecorationsWidth: compact ? 4 : 10,
					lineNumbers: compact ? "off" : "on",
					lineNumbersMinChars: compact ? 1 : 4,
					renderLineHighlight: compact ? "none" : "line",
					overviewRulerBorder: false,
					overviewRulerLanes: compact ? 0 : 3,
					hideCursorInOverviewRuler: true,
					scrollbar: {
						alwaysConsumeMouseWheel: false,
						horizontalScrollbarSize: compact ? 6 : 10,
						verticalScrollbarSize: compact ? 6 : 10,
						useShadows: false,
					},
				}}
				beforeMount={registerThemes}
				onMount={(diff) => {
					editorRef.current = diff;
					void formatDiffEditor(diff);
				}}
			/>
		</div>
	);
}
