import { search } from "frame-master-plugin-html-search-engine/client";
import { usePath } from "frame-master-plugin-react-to-html/hooks";
import type { JSX } from "react";
import {
	memo,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { routes } from "@/utils";
import { AnchorContext, type AnchorItem } from "./context";
import { docSections } from "./share.ts";
import { useMarkdown } from "@markdown";

function queryAutoRag(query: string) {
	return fetch(`/api/search/autorag?query=${encodeURIComponent(query)}`);
}

export default function DocumentationLayout({
	children,
}: {
	children: JSX.Element;
}) {
	const [isSidebarOpen, setIsSidebarOpen] = useState(false);
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [expandedSections, setExpandedSections] = useState<Set<string>>(
		new Set(docSections.map((section) => section.title)),
	);
	const [anchors, setAnchors] = useState<AnchorItem[]>([]);
	const [currentAnchor, setCurrentAnchor] = useState("");

	const currentPath = usePath();

	const toggleSection = useCallback((title: string) => {
		setExpandedSections((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(title)) {
				newSet.delete(title);
			} else {
				newSet.add(title);
			}
			return newSet;
		});
	}, []);

	const closeSidebar = useCallback(() => {
		setIsSidebarOpen(false);
	}, []);

	const openSidebar = useCallback(() => {
		setIsSidebarOpen(true);
	}, []);

	const openSearch = useCallback(() => {
		setIsSearchOpen(true);
	}, []);

	const closeSearch = useCallback(() => {
		setIsSearchOpen(false);
	}, []);

	const addAnchor = useCallback((id: string, title: string) => {
		setAnchors((prev) => {
			// Avoid duplicates
			if (prev.some((anchor) => anchor.id === id)) {
				return prev;
			}
			return [...prev, { id, title }];
		});
	}, []);

	const removeAnchor = useCallback((id: string) => {
		setAnchors((prev) => prev.filter((anchor) => anchor.id !== id));
	}, []);

	// Memoize anchor context value
	const anchorContextValue = useMemo(
		() => ({
			anchors,
			currentAnchor,
			addAnchor,
			removeAnchor,
			setCurrentAnchor,
		}),
		[anchors, currentAnchor, addAnchor, removeAnchor],
	);

	// Scroll tracking for active anchor
	useEffect(() => {
		const handleScroll = () => {
			// Get all sections with IDs
			const sections = anchors
				.map((anchor) => {
					const element = document.getElementById(anchor.id);
					if (!element) return null;

					const rect = element.getBoundingClientRect();
					return {
						id: anchor.id,
						top: rect.top,
						bottom: rect.bottom,
					};
				})
				.filter((section) => section !== null);

			// Find the section currently in view (closest to top of viewport)
			const viewportMiddle = window.innerHeight / 3; // Use top third of viewport
			let closestSection = sections[0];
			let closestDistance = Math.abs(
				(closestSection?.top || 0) - viewportMiddle,
			);

			for (const section of sections) {
				const distance = Math.abs(section.top - viewportMiddle);
				if (section.top <= viewportMiddle && distance < closestDistance) {
					closestSection = section;
					closestDistance = distance;
				}
			}

			if (closestSection && closestSection.id !== currentAnchor) {
				setCurrentAnchor(closestSection.id);
			}
		};

		// Debounce scroll handler
		let timeoutId: number;
		const debouncedScroll = () => {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(handleScroll, 100) as unknown as number;
		};

		window.addEventListener("scroll", debouncedScroll);
		handleScroll(); // Initial call

		return () => {
			window.removeEventListener("scroll", debouncedScroll);
			clearTimeout(timeoutId);
		};
	}, [anchors, currentAnchor]);

	// Global keyboard shortcut for search
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "/" && !isSearchOpen) {
				e.preventDefault();
				setIsSearchOpen(true);
			}
			if (e.key === "Escape" && isSearchOpen) {
				setIsSearchOpen(false);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isSearchOpen]);

	// Handle search highlighting and scrolling from URL hash
	useEffect(() => {
		currentPath;
		const hash = window.location.hash;
		if (hash.startsWith("#search=")) {
			const searchQuery = decodeURIComponent(hash.replace("#search=", ""));

			// Wait for content to render
			setTimeout(() => {
				highlightAndScrollToSearchTerm(searchQuery);
			}, 100);
		}
	}, [currentPath]);

	return (
		<AnchorContext.Provider value={anchorContextValue}>
			{/* Search Modal - Rendered at root level */}
			{isSearchOpen && <SearchModal onClose={closeSearch} />}

			<div className="min-h-screen bg-theme-bg">
				<div className="max-w-450 mx-auto">
					<div className="flex relative">
						{/* Mobile Sidebar Overlay */}
						{isSidebarOpen && (
							<button
								type="button"
								className="fixed inset-0 bg-black/50 z-40 lg:hidden"
								onClick={() => setIsSidebarOpen(false)}
							/>
						)}

						{/* Sidebar */}
						<aside
							className={`fixed lg:sticky top-16 left-0 h-[calc(100vh-4rem)] w-72 bg-theme-card border-r border-theme-border z-40 lg:z-0 transition-transform duration-300 flex flex-col shrink-0 ${
								isSidebarOpen
									? "translate-x-0"
									: "-translate-x-full lg:translate-x-0"
							}`}
						>
							{/* Sidebar Header */}
							<SidebarHeader onClose={closeSidebar} />

							{/* Navigation */}
							<nav
								className="flex-1 overflow-y-auto p-4 pb-8
                [&::-webkit-scrollbar]:w-2
                [&::-webkit-scrollbar-track]:bg-transparent
                [&::-webkit-scrollbar-thumb]:bg-theme-input
                [&::-webkit-scrollbar-thumb]:rounded-full
                [&::-webkit-scrollbar-thumb]:border-2
                [&::-webkit-scrollbar-thumb]:border-transparent
                hover:[&::-webkit-scrollbar-thumb]:bg-[#2a2a2a]
              "
							>
								{/* Search */}
								<div className="mb-6">
									<SearchButton onOpen={openSearch} />
								</div>

								{/* Doc Sections */}
								<div className="space-y-4">
									{docSections.map((section) => (
										<DocSectionComponent
											key={section.title}
											section={section}
											isExpanded={expandedSections.has(section.title)}
											onToggle={() => toggleSection(section.title)}
											currentPath={currentPath}
											onNavigate={closeSidebar}
										/>
									))}
								</div>

								{/* Quick Links */}
								<QuickLinksSection />
							</nav>
						</aside>

						{/* Main Content */}
						<main className="flex-1 min-w-0">
							{/* Mobile Header */}
							<MobileHeader onOpenSidebar={openSidebar} />

							{/* Content Area */}
							<div className="px-6 lg:px-12 py-8 lg:py-12">
								<article className="doc-content prose dark:prose-invert prose-xl max-w-none">
									{children}
								</article>
							</div>

							{/* On This Page (Table of Contents) - Right Sidebar */}
							<TableOfContents />
						</main>
					</div>
				</div>
			</div>
		</AnchorContext.Provider>
	);
}

// ============================================================================
// COMPONENTS
// ============================================================================

// Helper function to highlight and scroll to search term
function highlightAndScrollToSearchTerm(searchQuery: string) {
	if (!searchQuery.trim()) return;

	// Remove any existing highlights
	const existingHighlights = document.querySelectorAll(".search-highlight");
	existingHighlights.forEach((el) => {
		const parent = el.parentNode;
		if (parent) {
			parent.replaceChild(document.createTextNode(el.textContent || ""), el);
			parent.normalize();
		}
	});

	// Find and highlight matching text in the main content
	const articleContent = document.querySelector(".doc-content, article");
	if (!articleContent) return;

	const walker = document.createTreeWalker(
		articleContent,
		NodeFilter.SHOW_TEXT,
		{
			acceptNode: (node) => {
				// Skip script and style elements
				const parent = node.parentElement;
				if (
					parent &&
					(parent.tagName === "SCRIPT" ||
						parent.tagName === "STYLE" ||
						parent.tagName === "CODE" ||
						parent.classList.contains("search-highlight"))
				) {
					return NodeFilter.FILTER_REJECT;
				}
				// Only accept nodes that contain the search query
				if (
					node.textContent?.toLowerCase().includes(searchQuery.toLowerCase())
				) {
					return NodeFilter.FILTER_ACCEPT;
				}
				return NodeFilter.FILTER_REJECT;
			},
		},
	);

	const nodesToHighlight: { node: Text; indices: number[] }[] = [];
	let currentNode: Node | null = walker.nextNode();

	while (currentNode) {
		const textNode = currentNode as Text;
		const text = textNode.textContent || "";
		const lowerText = text.toLowerCase();
		const lowerQuery = searchQuery.toLowerCase();

		// Find all occurrences in this text node
		const indices: number[] = [];
		let index = lowerText.indexOf(lowerQuery);
		while (index !== -1) {
			indices.push(index);
			index = lowerText.indexOf(lowerQuery, index + 1);
		}

		if (indices.length > 0) {
			nodesToHighlight.push({ node: textNode, indices });
		}
		currentNode = walker.nextNode();
	}

	// Highlight the matches
	let firstHighlight: HTMLElement | null = null;
	nodesToHighlight.forEach(({ node, indices }) => {
		const text = node.textContent || "";
		const parent = node.parentNode;
		if (!parent) return;

		// Split text and create highlight elements
		const fragments: (string | HTMLElement)[] = [];
		let lastIndex = 0;

		// Sort indices to process in order
		indices.sort((a, b) => a - b);

		indices.forEach((index) => {
			// Add text before match
			if (index > lastIndex) {
				fragments.push(text.substring(lastIndex, index));
			}

			// Create highlight element
			const highlight = document.createElement("mark");
			highlight.className =
				"search-highlight bg-yellow-400/30 text-yellow-300 rounded px-1";
			highlight.textContent = text.substring(index, index + searchQuery.length);
			fragments.push(highlight);

			if (!firstHighlight) {
				firstHighlight = highlight;
			}

			lastIndex = index + searchQuery.length;
		});

		// Add remaining text
		if (lastIndex < text.length) {
			fragments.push(text.substring(lastIndex));
		}

		// Replace the text node with fragments
		const fragment = document.createDocumentFragment();
		fragments.forEach((item) => {
			if (typeof item === "string") {
				fragment.appendChild(document.createTextNode(item));
			} else {
				fragment.appendChild(item);
			}
		});

		parent.replaceChild(fragment, node);
	});

	// Scroll to the first highlight
	if (firstHighlight) {
		setTimeout(() => {
			firstHighlight?.scrollIntoView({
				behavior: "smooth",
				block: "center",
			});
		}, 100);

		// Clear the hash after a delay so back button works properly
		setTimeout(() => {
			history.replaceState(
				null,
				"",
				window.location.pathname + window.location.search,
			);
		}, 2000);
	}
}

function SearchButton({ onOpen }: { onOpen: () => void }) {
	return (
		<button
			type="button"
			onClick={onOpen}
			className="w-full flex items-center gap-3 px-4 py-2.5 bg-theme-input border border-theme-border rounded-lg text-theme-muted hover:text-theme-text hover:border-theme-hover-border transition-colors text-sm"
		>
			<span>🔍</span>
			<span>Search docs...</span>
			<kbd className="ml-auto px-2 py-0.5 bg-theme-card rounded text-xs">/</kbd>
		</button>
	);
}

function SearchModal({ onClose }: { onClose: () => void }) {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<
		Array<{
			href: string;
			title: string;
			excerpt: string;
			score: number;
		}>
	>([]);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [isSearching, setIsSearching] = useState(false);
	const [isAiMode, setIsAiMode] = useState(false);
	const [aiResponse, setAiResponse] = useState("");
	const [aiError, setAiError] = useState<string | null>(null);
	const [isAiLoading, setIsAiLoading] = useState(false);
	const inputRef = useCallback((node: HTMLInputElement | null) => {
		if (node) {
			node.focus();
		}
	}, []);
	const md = useMarkdown();
	const renderedMarkdownAiResponse = useMemo(
		() => md.render(aiResponse),
		[aiResponse, md],
	);

	// Handle AI search
	const handleAiSearch = useCallback(async () => {
		if (!query.trim() || isAiLoading) return;

		setIsAiLoading(true);
		setAiResponse("");
		setAiError(null);

		try {
			const response = await queryAutoRag(query);

			if (!response.ok) {
				const errorData = (await response.text().catch(() => null)) as
					| string
					| null;
				setAiError(
					errorData || `Request failed with status ${response.status}`,
				);
				return;
			}

			// Handle streaming response (SSE format)
			if (response.body) {
				const reader = response.body.getReader();
				const decoder = new TextDecoder();
				let buffer = "";

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });

					// Process complete lines from the buffer
					const lines = buffer.split("\n");
					// Keep the last potentially incomplete line in the buffer
					buffer = lines.pop() || "";

					for (const line of lines) {
						const trimmedLine = line.trim();
						if (!trimmedLine) continue;

						// Handle SSE format: "data: {...}"
						if (trimmedLine.startsWith("data:")) {
							const jsonStr = trimmedLine.slice(5).trim();
							if (jsonStr === "[DONE]") continue;

							try {
								const parsed = JSON.parse(jsonStr) as {
									response?: string;
									data?: { response?: string };
								};
								const text = parsed.response || parsed.data?.response || "";
								if (text) {
									setAiResponse((prev) => prev + text);
								}
							} catch {
								// Not valid JSON, might be partial - ignore
							}
						} else {
							// Try parsing as raw JSON (non-SSE format)
							try {
								const parsed = JSON.parse(trimmedLine) as {
									response?: string;
									data?: { response?: string };
								};
								const text = parsed.response || parsed.data?.response || "";
								if (text) {
									setAiResponse((prev) => prev + text);
								}
							} catch {
								// Not valid JSON - might be plain text
								if (trimmedLine && !trimmedLine.startsWith("{")) {
									setAiResponse((prev) => prev + trimmedLine);
								}
							}
						}
					}
				}

				// Process any remaining buffer content
				if (buffer.trim()) {
					const trimmedLine = buffer.trim();
					if (trimmedLine.startsWith("data:")) {
						const jsonStr = trimmedLine.slice(5).trim();
						if (jsonStr !== "[DONE]") {
							try {
								const parsed = JSON.parse(jsonStr) as {
									response?: string;
									data?: { response?: string };
								};
								const text = parsed.response || parsed.data?.response || "";
								if (text) {
									setAiResponse((prev) => prev + text);
								}
							} catch {
								// Ignore parse errors
							}
						}
					}
				}
			} else {
				const text = await response.text();
				setAiResponse(text);
			}
		} catch (error) {
			console.error("AI Search error:", error);
			setAiError(
				error instanceof Error ? error.message : "Failed to get AI response",
			);
		} finally {
			setIsAiLoading(false);
		}
	}, [query, isAiLoading]);

	// Perform regular search (only when not in AI mode)
	useEffect(() => {
		if (isAiMode || !query.trim()) {
			if (!isAiMode) {
				setResults([]);
				setSelectedIndex(0);
			}
			return;
		}

		setIsSearching(true);
		const timeoutId = setTimeout(async () => {
			try {
				const searchResults = await search(query, {
					limit: 10,
					searchKeys: ["doc-content"],
				});
				// Transform SearchResult to our display format
				const formattedResults = searchResults.map((result) => ({
					href: result.index.prettyPathname,
					title: result.index.title,
					excerpt: result.excerpt,
					score: result.score,
				}));
				setResults(formattedResults);
				setSelectedIndex(0);
			} catch (error) {
				console.error("Search error:", error);
				setResults([]);
			} finally {
				setIsSearching(false);
			}
		}, 300); // Debounce search

		return () => clearTimeout(timeoutId);
	}, [query, isAiMode]);

	// Handle keyboard navigation
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			} else if (e.key === "ArrowDown" && !isAiMode) {
				e.preventDefault();
				setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
			} else if (e.key === "ArrowUp" && !isAiMode) {
				e.preventDefault();
				setSelectedIndex((prev) => Math.max(prev - 1, 0));
			} else if (e.key === "Enter") {
				e.preventDefault();
				if (isAiMode) {
					handleAiSearch();
				} else if (results[selectedIndex]) {
					const result = results[selectedIndex];
					window.location.href = `${result.href}#search=${encodeURIComponent(
						query,
					)}`;
					onClose();
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [results, selectedIndex, onClose, isAiMode, handleAiSearch, query]);

	// Scroll selected item into view
	useEffect(() => {
		const selectedElement = document.getElementById(
			`search-result-${selectedIndex}`,
		);
		if (selectedElement) {
			selectedElement.scrollIntoView({ block: "nearest", behavior: "smooth" });
		}
	}, [selectedIndex]);

	const highlightText = (text: string, query: string) => {
		if (!query.trim()) return text;

		const parts = text.split(new RegExp(`(${query})`, "gi"));
		return parts.map((part, i) =>
			part.toLowerCase() === query.toLowerCase() ? (
				<mark key={part} className="bg-blue-500/30 text-blue-300">
					{part}
				</mark>
			) : (
				part
			),
		);
	};

	return (
		<div
			className="fixed inset-0 bg-black/80 backdrop-blur-sm z-100 flex items-center justify-center px-4"
			onMouseUp={onClose}
		>
			<article
				className="w-full max-w-2xl bg-theme-card border border-theme-border rounded-lg shadow-2xl overflow-hidden"
				onMouseUp={(e) => e.stopPropagation()}
			>
				{/* Mode Toggle */}
				<div className="flex border-b border-theme-border">
					<button
						type="button"
						onClick={() => setIsAiMode(false)}
						className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
							!isAiMode
								? "bg-theme-input text-theme-text border-b-2 border-blue-500"
								: "text-theme-muted hover:text-theme-text hover:bg-theme-input/50"
						}`}
					>
						🔍 Search
					</button>
					<button
						type="button"
						onClick={() => setIsAiMode(true)}
						className={`flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
							isAiMode
								? "bg-theme-input text-theme-text border-b-2 border-purple-500"
								: "text-theme-muted hover:text-theme-text hover:bg-theme-input/50"
						}`}
					>
						✨ Ask AI
					</button>
				</div>

				{/* Search Input */}
				<div className="flex items-center gap-3 px-4 py-4 border-b border-theme-border">
					<span className="text-theme-muted text-xl">
						{isAiMode ? "✨" : "🔍"}
					</span>
					<input
						ref={inputRef}
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder={
							isAiMode
								? "Ask a question about the documentation..."
								: "Search documentation..."
						}
						className="flex-1 bg-transparent text-theme-text placeholder-theme-disabled outline-none text-lg"
					/>
					{(isSearching || isAiLoading) && (
						<div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
					)}
					{isAiMode && query.trim() && !isAiLoading && (
						<button
							type="button"
							onClick={handleAiSearch}
							className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
						>
							Ask
						</button>
					)}
					<kbd className="px-2 py-1 bg-theme-input rounded text-xs text-theme-muted">
						ESC
					</kbd>
				</div>

				{/* Results */}
				<div className="max-h-[60vh] overflow-y-auto p-2">
					{isAiMode ? (
						// AI Mode Content
						<div className="px-4 py-4">
							{aiError ? (
								<div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
									<p className="text-red-400 text-sm">{aiError}</p>
								</div>
							) : aiResponse ? (
								<div className="prose prose-invert prose-sm max-w-none">
									<div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
										<div className="flex items-center gap-2 mb-3 text-purple-400 text-sm font-medium">
											<span>✨</span>
											<span>AI Response</span>
										</div>
										<div
											className="text-theme-text prose prose-invert prose-sm max-w-none
                        prose-p:my-2 prose-p:leading-relaxed
                        prose-headings:text-theme-text prose-headings:font-semibold
                        prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
                        prose-code:bg-theme-input prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-purple-300
                        prose-pre:bg-theme-input prose-pre:p-3 prose-pre:rounded-lg
                        prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
                        prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5
                        prose-strong:text-theme-text prose-strong:font-semibold"
											dangerouslySetInnerHTML={{
												__html: renderedMarkdownAiResponse,
											}}
										/>
									</div>
								</div>
							) : isAiLoading ? (
								<div className="flex items-center justify-center py-12">
									<div className="flex items-center gap-3 text-theme-muted">
										<div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
										<span>Thinking...</span>
									</div>
								</div>
							) : (
								<div className="text-center text-theme-disabled py-12">
									<p className="text-lg mb-2">
										Ask anything about Frame Master
									</p>
									<p className="text-sm mb-4">
										Our AI will search the documentation and provide an answer
									</p>
									<div className="flex items-center justify-center gap-2 text-sm">
										<kbd className="px-2 py-1 bg-theme-input rounded">↵</kbd>
										<span>to ask</span>
									</div>
								</div>
							)}
						</div>
					) : query.trim() === "" ? (
						<div className="px-4 py-12 text-center text-theme-disabled">
							<p className="text-lg mb-2">Start typing to search</p>
							<div className="flex items-center justify-center gap-4 text-sm">
								<div className="flex items-center gap-2">
									<kbd className="px-2 py-1 bg-theme-input rounded">↑</kbd>
									<kbd className="px-2 py-1 bg-theme-input rounded">↓</kbd>
									<span>Navigate</span>
								</div>
								<div className="flex items-center gap-2">
									<kbd className="px-2 py-1 bg-theme-input rounded">↵</kbd>
									<span>Select</span>
								</div>
							</div>
						</div>
					) : results.length === 0 && !isSearching ? (
						<div className="px-4 py-12 text-center text-theme-disabled">
							<p className="text-lg">No results found for "{query}"</p>
							<p className="text-sm mt-2">
								Try different keywords or check your spelling
							</p>
						</div>
					) : (
						<div className="space-y-1">
							{results.map((result, index) => (
								<a
									key={result.title}
									id={`search-result-${index}`}
									href={`${result.href}#search=${encodeURIComponent(query)}`}
									onClick={onClose}
									onMouseEnter={() => setSelectedIndex(index)}
									className={`block px-4 py-3 rounded-lg transition-colors no-underline cursor-pointer ${
										index === selectedIndex
											? "bg-blue-500/15 border border-blue-500/30"
											: "hover:bg-theme-input border border-transparent"
									}`}
								>
									<div className="flex items-start justify-between gap-3 mb-1">
										<h3 className="text-theme-text font-medium text-sm">
											{highlightText(result.title, query)}
										</h3>
										<span className="text-xs text-theme-disabled shrink-0">
											{Math.round(result.score * 100)}%
										</span>
									</div>
									<p className="text-sm text-theme-muted line-clamp-2">
										{highlightText(result.excerpt, query)}
									</p>
									<p className="text-xs text-neutral-600 mt-1">{result.href}</p>
								</a>
							))}
						</div>
					)}
				</div>

				{/* Footer */}
				{results.length > 0 && (
					<div className="px-4 py-3 border-t border-theme-border bg-theme-bg flex items-center justify-between text-xs text-theme-disabled">
						<span>
							{results.length} result{results.length !== 1 ? "s" : ""}
						</span>
						<div className="flex items-center gap-4">
							<div className="flex items-center gap-2">
								<kbd className="px-2 py-1 bg-theme-input rounded">↑</kbd>
								<kbd className="px-2 py-1 bg-theme-input rounded">↓</kbd>
								<span>Navigate</span>
							</div>
							<div className="flex items-center gap-2">
								<kbd className="px-2 py-1 bg-theme-input rounded">↵</kbd>
								<span>Open</span>
							</div>
						</div>
					</div>
				)}
			</article>
		</div>
	);
}

const SidebarHeader = memo(function SidebarHeader({
	onClose,
}: {
	onClose: () => void;
}) {
	return (
		<div className="shrink-0 bg-theme-card border-b border-theme-border p-6 flex items-center justify-between">
			<h2 className="text-theme-text font-bold text-lg">Documentation</h2>
			<button
				type="button"
				onClick={onClose}
				className="lg:hidden text-theme-muted hover:text-theme-text transition-colors"
			>
				✕
			</button>
		</div>
	);
});

const QuickLinksSection = memo(function QuickLinksSection() {
	return (
		<div className="mt-8 pt-6 border-t border-theme-border">
			<h3 className="text-xs font-bold text-theme-disabled uppercase tracking-wider mb-3 px-2">
				Quick Links
			</h3>
			<div className="space-y-1">
				<QuickLink href="https://github.com/shpaw415/frame-master" icon="💻">
					GitHub
				</QuickLink>
				<QuickLink href={routes.plugins} icon="🔌">
					Browse Plugins
				</QuickLink>
			</div>
		</div>
	);
});

const MobileHeader = memo(function MobileHeader({
	onOpenSidebar,
}: {
	onOpenSidebar: () => void;
}) {
	return (
		<div className="lg:hidden sticky top-16 z-20 bg-theme-bg/95 backdrop-blur-sm border-b border-theme-border">
			<div className="flex items-center justify-between px-6 h-16">
				<button
					type="button"
					onClick={onOpenSidebar}
					className="flex items-center justify-center w-10 h-10 bg-theme-card border border-theme-border rounded-lg text-theme-muted hover:text-theme-text hover:border-theme-hover-border transition-colors"
				>
					☰
				</button>
				<h1 className="text-theme-text font-bold text-lg">Documentation</h1>
				<div className="w-10" /> {/* Spacer */}
			</div>
		</div>
	);
});

function TableOfContents() {
	const { anchors, currentAnchor } = useContext(AnchorContext);
	if (anchors.length === 0) {
		return null;
	}

	return (
		<aside className="hidden xl:block fixed right-7 top-24 w-64">
			<div className="sticky top-24">
				<h3 className="text-xs font-bold text-theme-disabled uppercase tracking-wider mb-4">
					On This Page
				</h3>
				<nav className="space-y-2 text-sm">
					{anchors.map((anchor) => (
						<a
							key={anchor.id}
							href={`#${anchor.id}`}
							className={`block transition-colors py-1 cursor-pointer ${
								currentAnchor === anchor.id
									? "text-blue-400 font-medium"
									: "text-theme-muted hover:text-theme-text"
							}`}
						>
							{anchor.title}
						</a>
					))}
				</nav>
			</div>
		</aside>
	);
}

const DocSectionComponent = memo(function DocSection({
	section,
	isExpanded,
	onToggle,
	currentPath,
	onNavigate,
}: {
	section: (typeof docSections)[number];
	isExpanded: boolean;
	onToggle: () => void;
	currentPath: string;
	onNavigate: () => void;
}) {
	// Memoize expensive computations
	const hasActiveItem = useMemo(
		() => section.items.some((item) => currentPath.startsWith(item.href)),
		[section.items, currentPath],
	);

	const isActive = useCallback(
		(href: string) => currentPath === href,
		[currentPath],
	);

	return (
		<div>
			<button
				type="button"
				onClick={onToggle}
				className={`w-full flex items-center justify-between px-2 py-2 rounded-lg text-sm font-semibold transition-colors ${
					hasActiveItem
						? "text-blue-500"
						: "text-theme-secondary hover:text-theme-text hover:bg-theme-input"
				}`}
			>
				<span>{section.title}</span>
				<span
					className={`text-xs transition-transform ${
						isExpanded ? "rotate-90" : ""
					}`}
				>
					▶
				</span>
			</button>
			{isExpanded && (
				<div className="mt-1 space-y-0.5">
					{section.items.map((item) => (
						<DocItem
							key={item.href}
							item={item}
							isActive={isActive(item.href)}
							onClick={onNavigate}
						/>
					))}
				</div>
			)}
		</div>
	);
});

const DocItem = memo(function DocItem({
	item,
	isActive,
	onClick,
}: {
	item: { title: string; href: string; badge?: string };
	isActive: boolean;
	onClick: (href: string) => void;
}) {
	const handleClick = useCallback(() => {
		onClick(item.href);
	}, [onClick, item.href]);

	return (
		<a
			onClick={handleClick}
			href={item.href}
			className={`flex items-center justify-between px-2 py-2 pl-6 rounded-lg text-sm transition-colors no-underline group cursor-pointer ${
				isActive
					? "bg-blue-500/15 text-blue-500 font-medium"
					: "text-theme-muted hover:text-theme-text hover:bg-theme-input"
			}`}
		>
			<span>{item.title}</span>
			{item.badge && (
				<span className="px-2 py-0.5 bg-blue-500 text-white rounded text-xs font-semibold">
					{item.badge}
				</span>
			)}
		</a>
	);
});

const QuickLink = memo(function QuickLink({
	href,
	icon,
	children,
}: {
	href: string;
	icon: string;
	children: React.ReactNode;
}) {
	const isExternal = href.startsWith("http");
	return (
		<a
			href={href}
			target={isExternal ? "_blank" : undefined}
			rel={isExternal ? "noopener noreferrer" : undefined}
			className="flex items-center gap-3 px-2 py-2 rounded-lg text-sm text-theme-muted hover:text-theme-text hover:bg-theme-input transition-colors no-underline group"
		>
			<span className="text-lg">{icon}</span>
			<span className="flex-1">{children}</span>
			{isExternal && (
				<span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity">
					↗
				</span>
			)}
		</a>
	);
});
