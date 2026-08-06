import { MermaidDiagram } from "@lightenna/react-mermaid-diagram";
import { themes } from "prism-react-renderer";
import { CodeBlock } from "react-code-block";
import { useTheme } from "@/theme";

type CodeBlockWithThemeProps = {
	children?: string;
	language: "bash" | "ts" | "tsx" | "text" | "toml" | "json" | "mermaid";
	filename?: string;
	id?: string;
	code?: string;
};

export function Mermaid({ mmd, id }: { mmd: string; id: string }) {
	const { theme } = useTheme();

	return (
		<MermaidDiagram
			className="mermaid-lang"
			id={id}
			theme={theme === "light" ? "default" : "dark"}
			securityLevel="loose"
		>
			{mmd}
		</MermaidDiagram>
	);
}

export function CodeBlockWithTheme({
	children,
	language,
	filename,
	code,
	id,
}: CodeBlockWithThemeProps) {
	const { theme } = useTheme();
	return (
		<div className="overflow-hidden rounded-xl shadow-lg border border-theme-border bg-theme-card text-theme-text">
			{filename && (
				<div className="bg-theme-input px-4 py-2 border-b border-theme-border flex items-center gap-2">
					<div className="flex gap-1.5">
						<div className="w-3 h-3 rounded-full bg-red-500/80"></div>
						<div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
						<div className="w-3 h-3 rounded-full bg-green-500/80"></div>
					</div>
					<span className="text-theme-muted text-sm font-mono ml-2">
						{filename}
					</span>
				</div>
			)}
			{language === "mermaid" ? (
				<Mermaid mmd={children || (code as string)} id={id as string} />
			) : (
				<div className="overflow-auto bg-theme-bg w-full h-full">
					<CodeBlock
						language={language}
						code={children || (code as string)}
						theme={theme === "light" ? themes.github : themes.oneDark}
					>
						<CodeBlock.Code className="bg-theme-bg p-6">
							<CodeBlock.LineContent>
								<CodeBlock.Token />
							</CodeBlock.LineContent>
						</CodeBlock.Code>
					</CodeBlock>
				</div>
			)}
		</div>
	);
}
