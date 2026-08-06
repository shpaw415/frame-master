import { useEffect } from "react";
import { useAuth } from "@/hooks";

export function RedirectToLogin() {
	const auth = useAuth();

	useEffect(() => {
		if (!auth.isAuthenticated) {
			auth.login();
		}
	}, [auth]);

	return <RedirectLoading />;
}

function RedirectLoading() {
	return (
		<div className="flex flex-col items-center justify-center h-screen gap-4 text-center">
			<div
				className="h-12 w-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"
				aria-hidden="true"
			/>
			<div>
				<p className="text-sm text-slate-600">
					Redirecting you to the login page…
				</p>
				<p className="text-xs text-slate-500">
					If nothing happens, please refresh.
				</p>
			</div>
		</div>
	);
}
