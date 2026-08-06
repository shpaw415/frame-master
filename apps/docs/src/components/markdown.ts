import { fromHighlighter } from "@shikijs/markdown-it";
import MarkdownIt from "markdown-it/lib/index.mjs";
import type { RenderRule } from "markdown-it/lib/renderer.mjs";
import { type DependencyList, useEffect, useState } from "react";
import { createHighlighter } from "shiki";

function mermaidPlugin(md: MarkdownIt) {
	const defaultFence: RenderRule =
		md.renderer.rules.fence ??
		((tokens, idx, options, _env, self) =>
			self.renderToken(tokens, idx, options));

	md.renderer.rules.fence = (tokens, idx, options, env, self) => {
		const token = tokens[idx];
		if (token && token.info.trim().split(/\s+/)[0] === "mermaid") {
			return `<pre class="mermaid">${md.utils.escapeHtml(token.content)}</pre>\n`;
		}
		return defaultFence(tokens, idx, options, env, self);
	};
}

export function baseMd() {
	return new MarkdownIt({
		html: false,
		linkify: true,
		typographer: true,
	}).use(mermaidPlugin);
}

export async function createMd() {
	const highlighter = await createHighlighter({
		themes: ["one-dark-pro", "github-light"],
		langs: [
			"ts",
			"tsx",
			"bash",
			"json",
			"mdx",
			"md",
			"jsonc",
			"yaml",
			"yml",
			"html",
			"css",
			"scss",
			"less",
			"graphql",
			"sql",
			"dockerfile",
			"powershell",
			"python",
		],
	});

	const md = baseMd()
		.use(
			fromHighlighter(highlighter, {
				themes: {
					dark: "one-dark-pro",
					light: "github-light",
				},
				defaultColor: "light-dark()",
			}),
		)
		.use(mermaidPlugin); // re-apply after shiki so mermaid blocks are intercepted first

	return md;
}

export function useMarkdown() {
	const [md, setMd] = useState<MarkdownIt>(baseMd());
	useMermaidEffect([md]); // ensure mermaid runs on initial render and whenever md changes
	useEffect(() => {
		createMd()
			.then(setMd)
			.catch((error) => {
				console.error(
					"Failed to create MarkdownIt instance with syntax highlighting:",
					error,
				);
				setMd(baseMd()); // Fallback to basic MarkdownIt if highlighter setup fails
			});
	}, []);
	return md;
}

/**
 * Call inside a component that renders markdown containing mermaid blocks.
 * Pass the same deps array you use to update the rendered HTML so mermaid
 * re-runs whenever the content changes.
 */
export function useMermaidEffect(deps: DependencyList) {
	useEffect(() => {
		import("mermaid").then(({ default: mermaid }) => {
			mermaid.initialize({ startOnLoad: false });
			mermaid.run({ querySelector: ".mermaid" });
		});
		// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally forwarding caller deps
	}, deps);
}
