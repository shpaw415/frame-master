import type React from "react";
import { AuthProvider } from "./hooks";
import { ThemeProvider } from "./theme";

const themeScript = `
(function() {
  const stored = localStorage.getItem('theme-mode');
  const defaultTheme = 'dark';
  const mode = stored || defaultTheme;
  let theme = mode;
  if (mode === 'system') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.classList.add(theme);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
`;

export default function RenderShell({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<link rel="stylesheet" href="/static/style.css" />
				<link rel="icon" href="/static/favicon.ico" />
				<script dangerouslySetInnerHTML={{ __html: themeScript }} />
				<title>Frame Master - The Ultimate Framework Builder for Bun</title>
			</head>
			<body
				id="root"
				className="bg-background text-foreground antialiased transition-colors"
			>
				<AuthProvider>
					<ThemeProvider>{children}</ThemeProvider>
				</AuthProvider>
			</body>
		</html>
	);
}
