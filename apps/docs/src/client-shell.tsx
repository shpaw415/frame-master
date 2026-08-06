// ClientWrapper is used client side only for state management
// you can create your own version of the routerHost

import {
	RouterHost,
	type router,
} from "frame-master-plugin-apply-react/router";
import { SSRPropsProvider } from "frame-master-plugin-cloudflare-pages-dynamic-ssr/client/context";
import type { PropsData } from "frame-master-plugin-cloudflare-pages-dynamic-ssr/provider/utils";
import { type JSX, StrictMode, useCallback, useRef, useState } from "react";
import { ToastContainer } from "react-toastify";
import type { ClientType } from "./auth";
import { AuthProvider } from "./hooks";
import { ThemeProvider } from "./theme";

export default function ClientWrapper({ children }: { children: JSX.Element }) {
	const routeChangePromiseRef = useRef<
		ReturnType<typeof Promise.withResolvers<Array<PropsData> | null>>
	>(Promise.withResolvers<Array<PropsData> | null>());
	const resetRouteChangePromise = useCallback(
		(ref: typeof routeChangePromiseRef) => {
			ref.current.resolve?.(null);
			ref.current = Promise.withResolvers<Array<PropsData> | null>();
		},
		[],
	);
	const [pathname, setPathname] = useState(window.location.pathname);
	const [devKey, setDevKey] = useState(0);
	const matched = useRef<ReturnType<typeof router.match>>(null);

	return (
		<StrictMode>
			<SSRPropsProvider
				pathname={pathname}
				afterFetchCallback={() =>
					resetRouteChangePromise(routeChangePromiseRef)
				}
				devKey={devKey}
				fetchCallback={(_, dynamicEndpoints) => {
					const res = Boolean(
						matched.current?.name &&
							dynamicEndpoints.includes(matched.current.name),
					);
					if (!res) resetRouteChangePromise(routeChangePromiseRef);
					return res;
				}}
			>
				<PrimaryHandler>
					<RouterHost
						onRouteChange={async (match) => {
							matched.current = match;
							setPathname(match.pathname);
							if (process.env.NODE_ENV === "development") {
								setDevKey((prev) => prev + 1);
							}
							await routeChangePromiseRef.current.promise;
						}}
					>
						{children}
					</RouterHost>
				</PrimaryHandler>
			</SSRPropsProvider>
		</StrictMode>
	);
}

type QRAuthRequest = {
	client: ClientType;
	reject: (reason?: unknown) => void;
	resolve: (token: string) => void;
};

function PrimaryHandler({ children }: { children: React.JSX.Element }) {
	const qrAuthRequestRef = useRef<QRAuthRequest | null>(null);
	const [totpCode, setTotpCode] = useState("");
	const [totpError, setTotpError] = useState("");
	const [isQrAuthModalOpen, setIsQrAuthModalOpen] = useState(false);
	const [isSubmittingTotp, setIsSubmittingTotp] = useState(false);

	const resetQrAuthModal = () => {
		setTotpCode("");
		setTotpError("");
		setIsSubmittingTotp(false);
		setIsQrAuthModalOpen(false);
		qrAuthRequestRef.current = null;
	};

	const handleQrAuthCancel = () => {
		qrAuthRequestRef.current?.reject(new Error("QR authentication cancelled"));
		resetQrAuthModal();
	};

	const handleQrAuthSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();

		const currentRequest = qrAuthRequestRef.current;
		const sanitizedCode = totpCode.replace(/\D/g, "").slice(0, 6);

		if (!currentRequest) {
			resetQrAuthModal();
			return;
		}

		if (sanitizedCode.length !== 6) {
			setTotpError(
				"Enter the current 6-digit code from your authenticator app.",
			);
			return;
		}

		setIsSubmittingTotp(true);
		setTotpError("");

		try {
			const result =
				await currentRequest.client.mfa.totpClient.getElevatedToken(
					sanitizedCode,
				);

			if (
				result &&
				typeof result === "object" &&
				"token" in result &&
				typeof result.token === "string"
			) {
				currentRequest.resolve(result.token);
				resetQrAuthModal();
				return;
			}

			setTotpCode("");
			setTotpError(
				"That code was not accepted. Enter a new code and try again.",
			);
		} catch {
			setTotpCode("");
			setTotpError(
				"Unable to verify the code right now. Enter a new code and try again.",
			);
		} finally {
			setIsSubmittingTotp(false);
		}
	};

	return (
		<ThemeProvider>
			<AuthProvider
				onQRAuthFlow={(client) =>
					new Promise<string>((resolve, reject) => {
						qrAuthRequestRef.current = { client, reject, resolve };
						setTotpCode("");
						setTotpError("");
						setIsSubmittingTotp(false);
						setIsQrAuthModalOpen(true);
					})
				}
			>
				{children}
				<ToastContainer position="bottom-left" />
				{isQrAuthModalOpen && (
					<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
						<div className="w-full max-w-md rounded-2xl border border-theme-border bg-theme-card p-6 shadow-2xl">
							<h2 className="text-2xl font-semibold text-theme-text">
								Confirm QR Login
							</h2>
							<p className="mt-2 text-sm text-theme-secondary">
								Enter the current 6-digit code from your authenticator app to
								approve this QR authentication attempt.
							</p>

							<form className="mt-6 space-y-4" onSubmit={handleQrAuthSubmit}>
								<div>
									<label
										htmlFor="qr-auth-totp-code"
										className="mb-2 block text-sm font-medium text-theme-secondary"
									>
										Authenticator code
									</label>
									<input
										autoComplete="one-time-code"
										className="w-full rounded-lg border border-theme-border-input bg-theme-input px-4 py-3 font-mono text-lg text-theme-text placeholder-theme-disabled focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
										id="qr-auth-totp-code"
										inputMode="numeric"
										onChange={(e) => {
											setTotpCode(
												e.target.value.replace(/\D/g, "").slice(0, 6),
											);
											if (totpError) {
												setTotpError("");
											}
										}}
										placeholder="123456"
										value={totpCode}
									/>
								</div>

								{totpError && (
									<p className="text-sm text-red-400">{totpError}</p>
								)}

								<div className="flex gap-3">
									<button
										type="submit"
										disabled={isSubmittingTotp || totpCode.length !== 6}
										className="flex-1 rounded-lg bg-blue-500 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
									>
										{isSubmittingTotp ? "Verifying..." : "Approve Login"}
									</button>
									<button
										type="button"
										onClick={handleQrAuthCancel}
										disabled={isSubmittingTotp}
										className="flex-1 rounded-lg border border-theme-border-input bg-theme-input px-4 py-3 font-semibold text-theme-secondary transition-colors hover:border-theme-hover-border hover:text-theme-text disabled:cursor-not-allowed disabled:opacity-60"
									>
										Cancel
									</button>
								</div>
							</form>
						</div>
					</div>
				)}
			</AuthProvider>
		</ThemeProvider>
	);
}
