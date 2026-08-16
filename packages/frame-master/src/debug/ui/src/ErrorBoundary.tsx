import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryState = { error: Error | null };

export default class ErrorBoundary extends Component<
	{ children: ReactNode },
	ErrorBoundaryState
> {
	override state: ErrorBoundaryState = { error: null };

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { error };
	}

	override componentDidCatch(error: Error, info: ErrorInfo) {
		console.error("Frame-Master debug UI failed to render.", error, info);
	}

	override render() {
		if (!this.state.error) return this.props.children;

		return (
			<main
				style={{
					alignItems: "center",
					background: "var(--mui-palette-background-default, #fff)",
					color: "var(--mui-palette-text-primary, #1d1b20)",
					display: "flex",
					fontFamily: "system-ui, sans-serif",
					justifyContent: "center",
					minHeight: "100vh",
					padding: "24px",
				}}
			>
				<section
					style={{
						border: "1px solid var(--mui-palette-error-main, #ba1a1a)",
						borderRadius: "16px",
						maxWidth: "720px",
						padding: "24px",
						width: "100%",
					}}
				>
					<h1 style={{ margin: "0 0 8px" }}>Debug UI failed to load</h1>
					<p style={{ margin: "0 0 16px" }}>
						An unexpected error prevented the debug UI from rendering.
					</p>
					<pre
						style={{
							background: "var(--mui-palette-action-hover, #f5f2f5)",
							overflowX: "auto",
							padding: "16px",
							whiteSpace: "pre-wrap",
						}}
					>
						{this.state.error.stack ?? this.state.error.message}
					</pre>
					<button type="button" onClick={() => window.location.reload()}>
						Reload debug UI
					</button>
				</section>
			</main>
		);
	}
}
