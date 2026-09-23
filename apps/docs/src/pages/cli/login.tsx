import { useEffect, useState } from "react";
import { useAuth } from "@/hooks";
import { navigate, routes, searchParams } from "@/utils";

const CLI_LOGIN_CODE_KEY = "fm-cli-user-code";

export default function CliLoginPage() {
	const auth = useAuth();
	const code = searchParams("code") || "";
	const [status, setStatus] = useState<"approving" | "done" | "error" | "ready">(
		"ready",
	);
	const [message, setMessage] = useState("");

	useEffect(() => {
		if (!auth.isLoaded || auth.isAuthenticated) return;
		if (code) sessionStorage.setItem(CLI_LOGIN_CODE_KEY, code);
		alert("need to login first");
		navigate(routes.login);
	}, [auth.isAuthenticated, auth.isLoaded, code]);

	async function approve() {
		setStatus("approving");
		setMessage("");
		const response = await fetch("/api/cli/auth/approve", {
			body: JSON.stringify({ userCode: code }),
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			method: "POST",
		});
		const data = (await response.json()) as { error?: string; success?: boolean };
		if (!response.ok || !data.success) {
			setStatus("error");
			setMessage(data.error || "Could not approve this CLI login");
			return;
		}
		sessionStorage.removeItem(CLI_LOGIN_CODE_KEY);
		setStatus("done");
	}

	return (
		<main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-6 py-16">
			<p className="text-sm font-medium text-theme-muted">Frame-Master CLI</p>
			<h1 className="mt-2 text-3xl font-bold text-theme-text">Approve login</h1>
			<p className="mt-3 text-theme-muted">
				Confirm this code matches the one printed by{" "}
				<code className="text-theme-text">frame-master login</code>.
			</p>
			{code ? (
				<p className="mt-8 rounded-xl border border-theme-border bg-theme-card px-6 py-5 text-center font-mono text-3xl tracking-[0.3em] text-theme-text">
					{code}
				</p>
			) : (
				<p className="mt-8 text-theme-muted">
					Missing login code. Run <code>frame-master login</code> again.
				</p>
			)}
			{message ? <p className="mt-4 text-sm text-red-500">{message}</p> : null}
			{status === "done" ? (
				<p className="mt-6 text-theme-text">
					CLI login approved. You can return to the terminal.
				</p>
			) : (
				<button
					type="button"
					disabled={!code || !auth.isAuthenticated || status === "approving"}
					onClick={() => void approve()}
					className="mt-8 rounded-xl bg-theme-text px-5 py-3 font-semibold text-theme-bg disabled:opacity-50"
				>
					{status === "approving" ? "Approving…" : "Approve"}
				</button>
			)}
		</main>
	);
}
