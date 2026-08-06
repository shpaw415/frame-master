import { toString as toQrCodeString } from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import {
	GET as getGitHubAppStatus,
	DELETE as unlinkGitHubApp,
} from "@/actions/api/github/app";
import { DELETE as deleteUserAccount } from "@/actions/api/user";
import { createClient, type PublicSession } from "@/auth";
import { useAuth, useAuthEffect } from "@/hooks";
import { navigate, searchParams } from "@/utils";

type GitHubAppStatus = {
	connected: boolean;
	installPath: string;
	isAuthenticated: boolean;
	isLoading: boolean;
	link: null | {
		githubAvatarUrl: string | null;
		githubLogin: string;
		installationId: string;
		installationState: "active" | "deleted" | "suspended";
		installedAt: Date | string;
		lastValidatedAt: Date | string | null;
	};
};

type TotpState = {
	enabled: boolean;
	isLoading: boolean;
	setup: TOTPSetupData | null;
};

type TOTPSetupData = {
	uri: string;
	secret: string;
	backupCodes: string[];
};

function formatTotpSecret(secret: string) {
	return secret.replace(/(.{4})/g, "$1 ").trim();
}

function getErrorMessage(error: unknown, fallback: string) {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	return fallback;
}

export default function SettingsPage() {
	const auth = useAuth();
	const totpClient = auth.mfa.totpClient;
	const [showDeleteModal, setShowDeleteModal] = useState(false);
	const [deleteConfirmText, setDeleteConfirmText] = useState("");
	const [isDeleting, setIsDeleting] = useState(false);

	const [profileData, setProfileData] = useState({
		name: "",
		bio: "",
		avatarUrl: "",
		githubUrl: "",
	});
	const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
	const [isUnlinkingGitHubApp, setIsUnlinkingGitHubApp] = useState(false);
	const [passkeyName, setPasskeyName] = useState("");
	const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false);
	const [totpState, setTotpState] = useState<TotpState>({
		enabled: false,
		isLoading: true,
		setup: null,
	});
	const [totpCode, setTotpCode] = useState("");
	const [totpQrSvg, setTotpQrSvg] = useState("");
	const [isStartingTotpSetup, setIsStartingTotpSetup] = useState(false);
	const [isConfirmingTotpSetup, setIsConfirmingTotpSetup] = useState(false);
	const [githubAppStatus, setGitHubAppStatus] = useState<GitHubAppStatus>({
		connected: false,
		installPath: "/api/github/app/install?returnTo=%2Fsettings",
		isAuthenticated: false,
		isLoading: true,
		link: null,
	});

	useEffect(() => {
		const githubAppResult = searchParams("github_app");
		const githubAppError = searchParams("github_app_error");

		if (!githubAppResult && !githubAppError) {
			return;
		}

		if (githubAppResult === "linked") {
			toast.success("GitHub App linked successfully");
		}

		if (githubAppError) {
			toast.error(githubAppError);
		}

		const url = new URL(window.location.href);
		url.searchParams.delete("github_app");
		url.searchParams.delete("github_app_error");
		window.history.replaceState({}, "", url.toString());
	}, []);

	useEffect(() => {
		const urlStatus = new URL(window.location.href);
		if (urlStatus.searchParams.get("setup_action") !== "install") return;
		const client = createClient({ token: auth.getToken() || undefined });

		urlStatus.pathname = "/api/github/app/callback";

		client.fetch(urlStatus.toString()).then((res) => {
			if (!res.ok) {
				toast.error("GitHub App installation failed");
				setTimeout(() => {
					window.location.href = "/settings";
				}, 3000);
				return;
			}
			document.location.href = res.url;
		});
	}, [auth]);

	useAuthEffect((client) => {
		if (!client.isAuthenticated) return;
		setProfileData({
			name: client.data.public.name || "",
			bio: client.data.public.bio || "",
			avatarUrl: client.data.public.avatarUrl || "",
			githubUrl: client.data.public.githubUrl || "",
		});
	});

	useEffect(() => {
		let isCancelled = false;

		if (!auth.isAuthenticated) {
			setGitHubAppStatus((prev) => ({
				...prev,
				isAuthenticated: false,
				isLoading: false,
				link: null,
			}));
			return;
		}

		const loadGitHubAppStatus = async () => {
			setGitHubAppStatus((prev) => ({ ...prev, isLoading: true }));

			try {
				const response = await getGitHubAppStatus();
				if (isCancelled) {
					return;
				}

				setGitHubAppStatus({
					connected: response.connected,
					installPath: "/api/github/app/install?returnTo=%2Fsettings",
					isAuthenticated: response.isAuthenticated,
					isLoading: false,
					link: response.link,
				});
			} catch (error: unknown) {
				if (isCancelled) {
					return;
				}

				setGitHubAppStatus((prev) => ({
					...prev,
					isLoading: false,
				}));
				toast.error(getErrorMessage(error, "Failed to load GitHub App status"));
			}
		};

		loadGitHubAppStatus();

		return () => {
			isCancelled = true;
		};
	}, [auth.isAuthenticated]);

	useEffect(() => {
		let isCancelled = false;

		if (!auth.isAuthenticated) {
			setTotpState({
				enabled: false,
				isLoading: false,
				setup: null,
			});
			setTotpCode("");
			return;
		}

		const loadTotpStatus = async () => {
			setTotpState((prev) => ({ ...prev, isLoading: true }));

			try {
				const response = await totpClient.getTOTPEnabledStatus();
				if (isCancelled) {
					return;
				}

				if (response instanceof Error) {
					throw response;
				}

				setTotpState((prev) => ({
					enabled: response,
					isLoading: false,
					setup: response ? null : prev.setup,
				}));
			} catch (error: unknown) {
				if (isCancelled) {
					return;
				}

				setTotpState((prev) => ({
					...prev,
					isLoading: false,
				}));
				toast.error(getErrorMessage(error, "Failed to load TOTP status"));
			}
		};

		loadTotpStatus();

		return () => {
			isCancelled = true;
		};
	}, [auth.isAuthenticated, totpClient]);

	const handleProfileUpdate = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsUpdatingProfile(true);

		try {
			const res = await auth.updateUserSession("public", {
				name: profileData.name,
				bio: profileData.bio,
				avatarUrl: profileData.avatarUrl,
				githubUrl: profileData.githubUrl,
			} as PublicSession);

			if (res instanceof Error) throw res;
			const newPublic = res.public as Partial<PublicSession>;
			setProfileData({
				name: newPublic?.name || "",
				bio: newPublic?.bio || "",
				avatarUrl: newPublic?.avatarUrl || "",
				githubUrl: newPublic?.githubUrl || "",
			});
			toast.success("Profile updated successfully");
		} catch (error: unknown) {
			toast.error(getErrorMessage(error, "Failed to update profile"));
		} finally {
			setIsUpdatingProfile(false);
		}
	};

	const handleDeleteAccount = async () => {
		if (deleteConfirmText !== "delete-my-account") {
			toast.error("Please type 'delete-my-account' to confirm");
			return;
		}

		setIsDeleting(true);

		try {
			// Call API to delete user account
			const { success, message } = await deleteUserAccount();

			if (!success) {
				toast.error(message || "Failed to delete account");
				setIsDeleting(false);
				return;
			}
			toast.success("Account deleted successfully");
			auth.logout().then(() => navigate("/"));
		} catch (error: unknown) {
			toast.error(getErrorMessage(error, "Failed to delete account"));
			setIsDeleting(false);
		}
	};

	const handleUnlinkGitHubApp = async () => {
		setIsUnlinkingGitHubApp(true);

		try {
			const response = await unlinkGitHubApp();
			if (!response.success) {
				throw new Error(response.message || "Failed to unlink GitHub App");
			}

			setGitHubAppStatus({
				connected: false,
				installPath: "/api/github/app/install?returnTo=%2Fsettings",
				isAuthenticated: true,
				isLoading: false,
				link: null,
			});
			toast.success("GitHub App link removed");
		} catch (error: unknown) {
			toast.error(getErrorMessage(error, "Failed to unlink GitHub App"));
		} finally {
			setIsUnlinkingGitHubApp(false);
		}
	};

	const handleRegisterPasskey = async () => {
		if (!passkeyName.trim()) return;
		setIsRegisteringPasskey(true);
		try {
			const result = await auth.passkey.register({
				userDisplayName: passkeyName.trim(),
			});
			if (!result.success) {
				toast.error(result.error || "Failed to register passkey");
			} else {
				toast.success(result.message || "Passkey registered successfully");
				setPasskeyName("");
			}
		} catch (error: unknown) {
			toast.error(getErrorMessage(error, "Failed to register passkey"));
		} finally {
			setIsRegisteringPasskey(false);
		}
	};

	const handleCopyTotpValue = async (value: string, label: string) => {
		try {
			await navigator.clipboard.writeText(value);
			toast.success(`${label} copied`);
		} catch {
			toast.error(`Failed to copy ${label.toLowerCase()}`);
		}
	};

	const handleStartTotpSetup = async () => {
		setIsStartingTotpSetup(true);

		try {
			const response = await totpClient.setupTotp();
			if (response instanceof Error) {
				throw response;
			}

			setTotpState({
				enabled: false,
				isLoading: false,
				setup: response,
			});
			setTotpCode("");
			toast.success("TOTP setup started");
		} catch (error: unknown) {
			toast.error(getErrorMessage(error, "Failed to start TOTP setup"));
		} finally {
			setIsStartingTotpSetup(false);
		}
	};

	const handleConfirmTotpSetup = async (e: React.FormEvent) => {
		e.preventDefault();

		if (totpCode.length !== 6) {
			toast.error("Enter the 6-digit code from your authenticator app");
			return;
		}

		setIsConfirmingTotpSetup(true);
		let errorMessage = "Failed to confirm TOTP setup";

		try {
			const success = await totpClient.confirmSetup({
				code: totpCode,
				onError: (error) => {
					errorMessage = error.message || errorMessage;
				},
			});

			if (!success) {
				toast.error(errorMessage);
				return;
			}

			setTotpState({
				enabled: true,
				isLoading: false,
				setup: null,
			});
			setTotpCode("");
			toast.success("TOTP enabled successfully");
		} catch (error: unknown) {
			toast.error(getErrorMessage(error, errorMessage));
		} finally {
			setIsConfirmingTotpSetup(false);
		}
	};

	const totpSetup = totpState.setup;

	useEffect(() => {
		let isCancelled = false;

		if (!totpSetup?.uri) {
			setTotpQrSvg("");
			return;
		}

		toQrCodeString(totpSetup.uri, {
			type: "svg",
			width: 188,
			margin: 1,
			errorCorrectionLevel: "M",
			color: {
				dark: "#111827",
				light: "#FFFFFF",
			},
		})
			.then((svg: string) => {
				if (isCancelled) {
					return;
				}

				setTotpQrSvg(
					svg.replace(
						"<svg",
						'<svg style="display:block;height:auto;width:100%;max-width:188px"',
					),
				);
			})
			.catch(() => {
				if (isCancelled) {
					return;
				}

				setTotpQrSvg("");
			});

		return () => {
			isCancelled = true;
		};
	}, [totpSetup?.uri]);

	if (!auth.isAuthenticated) {
		return (
			<div className="min-h-screen bg-theme-bg p-6">
				<h1 className="text-2xl font-bold mb-4 text-theme-text">Settings</h1>
				<p className="text-theme-muted">
					Please log in to manage your account settings.
				</p>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-theme-bg p-6">
			<div className="max-w-4xl mx-auto">
				<h1 className="text-4xl font-bold mb-8 text-theme-text">
					Account Settings
				</h1>

				<div className="bg-theme-card border border-theme-border rounded-xl p-6 mb-6 transition-all duration-300 hover:border-blue-500/50">
					<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
						<div>
							<h2 className="text-2xl font-semibold mb-2 text-theme-text">
								GitHub Release Sync
							</h2>
							<p className="text-theme-secondary max-w-2xl">
								Install the Frame Master GitHub App on your personal account so
								plugin and template releases can be synced automatically when
								you publish a new GitHub release.
							</p>
						</div>

						<div className="flex gap-3">
							<form method="post" action={githubAppStatus.installPath}>
								<input
									type="hidden"
									name="token"
									value={auth.getToken() || ""}
								/>
								<button
									type="submit"
									className="inline-flex items-center justify-center rounded-lg bg-blue-500 px-5 py-3 font-semibold text-white no-underline transition-colors hover:bg-blue-600"
								>
									{githubAppStatus.connected
										? "Reinstall GitHub App"
										: "Install GitHub App"}
								</button>
							</form>

							{githubAppStatus.link && (
								<button
									onClick={handleUnlinkGitHubApp}
									disabled={isUnlinkingGitHubApp}
									type="button"
									className="rounded-lg border border-theme-border-input px-5 py-3 font-semibold text-theme-secondary transition-colors hover:border-red-500 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-60"
								>
									{isUnlinkingGitHubApp ? "Removing..." : "Remove Link"}
								</button>
							)}
						</div>
					</div>

					<div className="mt-5 rounded-xl border border-theme-border bg-theme-input p-4">
						{githubAppStatus.isLoading ? (
							<p className="text-theme-muted">Checking GitHub App status...</p>
						) : githubAppStatus.link ? (
							<div className="space-y-3">
								<div className="flex flex-wrap items-center gap-3">
									<span
										className={`rounded-full px-3 py-1 text-xs font-semibold ${
											githubAppStatus.link.installationState === "active"
												? "bg-green-500/15 text-green-400"
												: githubAppStatus.link.installationState === "suspended"
													? "bg-yellow-500/15 text-yellow-400"
													: "bg-red-500/15 text-red-400"
										}`}
									>
										{githubAppStatus.link.installationState === "active"
											? "Active"
											: githubAppStatus.link.installationState === "suspended"
												? "Suspended"
												: "Inactive"}
									</span>
									<span className="text-theme-text font-semibold">
										Linked GitHub account: @{githubAppStatus.link.githubLogin}
									</span>
								</div>
								<p className="text-sm text-theme-muted">
									Installed on{" "}
									{new Date(githubAppStatus.link.installedAt).toLocaleString()}
								</p>
								<p className="text-sm text-theme-secondary">
									Plugins and templates can only be saved for repositories owned
									by this linked GitHub account while the installation is
									active.
								</p>
							</div>
						) : (
							<div className="space-y-2">
								<p className="font-semibold text-theme-text">
									No GitHub App installation linked yet.
								</p>
								<p className="text-sm text-theme-muted">
									Install the GitHub App before creating or updating plugins or
									templates that use a GitHub repository URL.
								</p>
							</div>
						)}
					</div>
				</div>

				{/* Profile Settings */}
				<div className="bg-theme-card border border-theme-border rounded-xl p-6 mb-6 transition-all duration-300 hover:border-blue-500/50">
					<h2 className="text-2xl font-semibold mb-4 text-theme-text">
						Profile Settings
					</h2>
					<form onSubmit={handleProfileUpdate} className="space-y-5">
						<div>
							<label
								htmlFor="name"
								className="block text-sm font-medium text-theme-secondary mb-2"
							>
								Display Name
							</label>
							<input
								type="text"
								id="name"
								value={profileData.name}
								onChange={(e) =>
									setProfileData({ ...profileData, name: e.target.value })
								}
								className="w-full px-4 py-3 bg-theme-input border border-theme-border-input rounded-lg text-theme-text placeholder-theme-disabled focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
								placeholder="Your display name"
							/>
						</div>

						<div>
							<label
								htmlFor="bio"
								className="block text-sm font-medium text-theme-secondary mb-2"
							>
								Bio
							</label>
							<textarea
								id="bio"
								value={profileData.bio}
								onChange={(e) =>
									setProfileData({ ...profileData, bio: e.target.value })
								}
								rows={3}
								className="w-full px-4 py-3 bg-theme-input border border-theme-border-input rounded-lg text-theme-text placeholder-theme-disabled focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
								placeholder="Tell us a little about yourself"
							/>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-5">
							<div>
								<label
									htmlFor="avatarUrl"
									className="block text-sm font-medium text-theme-secondary mb-2"
								>
									Avatar URL
								</label>
								<input
									type="url"
									id="avatarUrl"
									value={profileData.avatarUrl}
									onChange={(e) =>
										setProfileData({
											...profileData,
											avatarUrl: e.target.value,
										})
									}
									className="w-full px-4 py-3 bg-theme-input border border-theme-border-input rounded-lg text-theme-text placeholder-theme-disabled focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
									placeholder="https://example.com/avatar.png"
								/>
							</div>

							<div>
								<label
									htmlFor="githubUrl"
									className="block text-sm font-medium text-theme-secondary mb-2"
								>
									Public GitHub Profile URL
								</label>
								<input
									type="url"
									id="githubUrl"
									value={profileData.githubUrl}
									onChange={(e) =>
										setProfileData({
											...profileData,
											githubUrl: e.target.value,
										})
									}
									className="w-full px-4 py-3 bg-theme-input border border-theme-border-input rounded-lg text-theme-text placeholder-theme-disabled focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
									placeholder="https://github.com/username"
								/>
								<p className="mt-1 text-xs text-theme-disabled">
									This is only shown on your public profile. GitHub release sync
									uses the GitHub App link above.
								</p>
							</div>
						</div>

						<button
							type="submit"
							disabled={isUpdatingProfile}
							className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 disabled:bg-theme-border-input disabled:text-theme-disabled disabled:cursor-not-allowed transition-all font-semibold"
						>
							{isUpdatingProfile ? "Saving..." : "Save Profile"}
						</button>
					</form>
				</div>

				{/* Account Info */}
				<div className="bg-theme-card border border-theme-border rounded-xl p-6 mb-6 transition-all duration-300 hover:border-blue-500/50">
					<h2 className="text-2xl font-semibold mb-4 text-theme-text">
						Account Information
					</h2>
					<div className="space-y-3">
						<p className="text-theme-secondary">
							<span className="font-medium text-theme-text">User ID:</span>{" "}
							<span className="text-theme-muted text-sm">
								{auth.userMeta.id}
							</span>
						</p>
					</div>
				</div>

				<div className="bg-theme-card border border-theme-border rounded-xl p-6 mb-6 transition-all duration-300 hover:border-blue-500/50">
					<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
						<div>
							<h2 className="text-2xl font-semibold mb-2 text-theme-text">
								Authenticator App (TOTP)
							</h2>
							<p className="text-theme-secondary max-w-2xl">
								Protect your account with a time-based one-time password from
								your authenticator app.
							</p>
						</div>

						{!totpState.isLoading && !totpState.enabled && !totpState.setup && (
							<button
								type="button"
								onClick={handleStartTotpSetup}
								disabled={isStartingTotpSetup}
								className="inline-flex items-center justify-center rounded-lg bg-blue-500 px-5 py-3 font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
							>
								{isStartingTotpSetup ? "Preparing..." : "Set Up TOTP"}
							</button>
						)}
					</div>

					<div className="mt-5 rounded-xl border border-theme-border bg-theme-input p-4">
						{totpState.isLoading ? (
							<p className="text-theme-muted">Checking TOTP status...</p>
						) : totpState.enabled ? (
							<div className="space-y-3">
								<div className="flex flex-wrap items-center gap-3">
									<span className="rounded-full bg-green-500/15 px-3 py-1 text-xs font-semibold text-green-400">
										Enabled
									</span>
									<span className="font-semibold text-theme-text">
										Authenticator app verification is active for this account.
									</span>
								</div>
								<p className="text-sm text-theme-secondary">
									TOTP is already configured, so a new setup flow is not shown
									here.
								</p>
							</div>
						) : totpSetup ? (
							<div className="space-y-5">
								<div>
									<p className="font-semibold text-theme-text">
										1. Scan the QR code with your authenticator app
									</p>
									<p className="mt-1 text-sm text-theme-muted">
										Scan this code in Google Authenticator, 1Password, Authy, or
										another TOTP app. If scanning is unavailable, use the manual
										secret below. This setup expires after 5 minutes.
									</p>
									<div className="mt-4 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
										<div className="flex items-center justify-center rounded-2xl border border-theme-border-input bg-white p-4 shadow-sm">
											{totpQrSvg ? (
												<div dangerouslySetInnerHTML={{ __html: totpQrSvg }} />
											) : (
												<div
													className="flex w-full items-center justify-center text-center text-sm text-theme-muted"
													style={{ minHeight: 188 }}
												>
													Generating QR code...
												</div>
											)}
										</div>
										<div className="space-y-3">
											<p className="font-semibold text-theme-text">
												Manual entry secret
											</p>
											<input
												type="text"
												readOnly
												value={formatTotpSecret(totpSetup.secret)}
												className="w-full rounded-lg border border-theme-border-input bg-theme-card px-4 py-3 font-mono text-sm text-theme-text focus:outline-none"
											/>
											<div className="flex flex-col gap-3 sm:flex-row">
												<button
													type="button"
													onClick={() =>
														handleCopyTotpValue(totpSetup.secret, "TOTP secret")
													}
													className="rounded-lg border border-theme-border-input px-4 py-3 font-semibold text-theme-secondary transition-colors hover:border-blue-500 hover:text-theme-text"
												>
													Copy Secret
												</button>
												<button
													type="button"
													onClick={() =>
														handleCopyTotpValue(
															totpSetup.uri,
															"Provisioning URI",
														)
													}
													className="rounded-lg border border-theme-border-input px-4 py-3 font-semibold text-theme-secondary transition-colors hover:border-blue-500 hover:text-theme-text"
												>
													Copy URI
												</button>
											</div>
										</div>
									</div>
								</div>

								<div>
									<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
										<div>
											<p className="font-semibold text-theme-text">
												2. Save your backup codes
											</p>
											<p className="mt-1 text-sm text-theme-muted">
												Each code works once. Keep them somewhere safe before
												you continue.
											</p>
										</div>
										<button
											type="button"
											onClick={() =>
												handleCopyTotpValue(
													totpSetup.backupCodes.join("\n"),
													"Backup codes",
												)
											}
											className="rounded-lg border border-theme-border-input px-4 py-3 font-semibold text-theme-secondary transition-colors hover:border-blue-500 hover:text-theme-text"
										>
											Copy Codes
										</button>
									</div>
									<div className="mt-3 grid gap-2 sm:grid-cols-2">
										{totpSetup.backupCodes.map((code: string) => (
											<div
												key={code}
												className="rounded-lg border border-theme-border-input bg-theme-card px-4 py-3 font-mono text-sm text-theme-text"
											>
												{code}
											</div>
										))}
									</div>
								</div>

								<form onSubmit={handleConfirmTotpSetup} className="space-y-3">
									<div>
										<p className="font-semibold text-theme-text">
											3. Confirm with the current 6-digit code
										</p>
										<p className="mt-1 text-sm text-theme-muted">
											Enter the code generated by your authenticator app to
											finish setup.
										</p>
									</div>
									<div className="flex flex-col gap-3 md:flex-row">
										<input
											type="text"
											inputMode="numeric"
											autoComplete="one-time-code"
											value={totpCode}
											onChange={(e) =>
												setTotpCode(
													e.target.value.replace(/\D/g, "").slice(0, 6),
												)
											}
											className="w-full rounded-lg border border-theme-border-input bg-theme-card px-4 py-3 font-mono text-theme-text placeholder-theme-disabled focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
											placeholder="123456"
										/>
										<button
											type="submit"
											disabled={totpCode.length !== 6 || isConfirmingTotpSetup}
											className="rounded-lg bg-blue-500 px-5 py-3 font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
										>
											{isConfirmingTotpSetup ? "Confirming..." : "Enable TOTP"}
										</button>
									</div>
								</form>

								<details className="rounded-lg border border-theme-border-input bg-theme-card p-4">
									<summary className="cursor-pointer font-semibold text-theme-text">
										Advanced: provisioning URI
									</summary>
									<p className="mt-3 break-all font-mono text-xs text-theme-muted">
										{totpSetup.uri}
									</p>
								</details>
							</div>
						) : (
							<div className="space-y-2">
								<p className="font-semibold text-theme-text">
									TOTP is not enabled yet.
								</p>
								<p className="text-sm text-theme-muted">
									Start setup to generate a secret and backup codes for your
									authenticator app.
								</p>
							</div>
						)}
					</div>
				</div>

				{/* Passkeys */}
				<div className="bg-theme-card border border-theme-border rounded-xl p-6 mb-6 transition-all duration-300 hover:border-blue-500/50">
					<h2 className="text-2xl font-semibold mb-2 text-theme-text">
						Passkeys
					</h2>
					<p className="text-theme-secondary mb-5">
						Add a passkey to sign in securely without a password using your
						device's biometrics or PIN.
					</p>
					<div className="flex flex-col sm:flex-row gap-3">
						<input
							type="text"
							value={passkeyName}
							onChange={(e) => setPasskeyName(e.target.value)}
							className="flex-1 px-4 py-3 bg-theme-input border border-theme-border-input rounded-lg text-theme-text placeholder-theme-disabled focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
							placeholder="Passkey name (e.g. Frame-master Laptop)"
						/>
						<button
							type="button"
							onClick={handleRegisterPasskey}
							disabled={!passkeyName.trim() || isRegisteringPasskey}
							className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 disabled:bg-theme-border-input disabled:text-theme-disabled disabled:cursor-not-allowed transition-all font-semibold whitespace-nowrap"
						>
							{isRegisteringPasskey ? "Registering..." : "Add Passkey"}
						</button>
					</div>
				</div>

				{/* Danger Zone - Delete Account */}
				<div className="bg-theme-card border border-red-500/30 rounded-xl p-6 transition-all duration-300 hover:border-red-500/50">
					<h2 className="text-2xl font-semibold text-red-400 mb-4">
						Danger Zone
					</h2>
					<p className="text-theme-secondary mb-4">
						Once you delete your account, there is no going back. This action
						cannot be undone.
					</p>
					<button
						type="button"
						onClick={() => setShowDeleteModal(true)}
						className="bg-red-500/20 border border-red-500/50 text-red-400 px-6 py-3 rounded-lg hover:bg-red-500/30 hover:border-red-500 transition-all font-semibold"
					>
						Delete Account
					</button>
				</div>
			</div>

			{/* Delete Confirmation Modal */}
			{showDeleteModal && (
				<div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
					<div className="bg-theme-card border border-red-500/30 rounded-2xl max-w-md w-full p-8 shadow-2xl">
						<h3 className="text-3xl font-bold text-red-400 mb-6">
							Delete Account
						</h3>

						<div className="bg-red-500/10 border border-red-500/30 rounded-lg p-5 mb-6">
							<p className="text-red-400 font-semibold mb-3 text-lg flex items-center gap-2">
								<span className="text-2xl">⚠️</span> Warning
							</p>
							<ul className="text-sm text-theme-secondary space-y-2 list-disc list-inside">
								<li>All your data will be permanently deleted</li>
								<li>Your plugins will be removed from the marketplace</li>
								<li>This action cannot be undone</li>
							</ul>
						</div>

						<p className="text-theme-secondary mb-4">
							To confirm deletion, please type{" "}
							<strong className="text-theme-text font-mono">
								delete-my-account
							</strong>{" "}
							below:
						</p>

						<input
							type="text"
							value={deleteConfirmText}
							onChange={(e) => setDeleteConfirmText(e.target.value)}
							className="w-full px-4 py-3 bg-theme-input border border-theme-border-input rounded-lg text-theme-text placeholder-theme-disabled focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent mb-6 transition-all font-mono"
							placeholder="delete-my-account"
						/>

						<div className="flex gap-3">
							<button
								type="button"
								onClick={handleDeleteAccount}
								disabled={
									deleteConfirmText !== "delete-my-account" || isDeleting
								}
								className="flex-1 bg-red-500 text-white px-4 py-3 rounded-lg hover:bg-red-600 disabled:bg-theme-border-input disabled:text-theme-disabled disabled:cursor-not-allowed transition-all font-semibold"
							>
								{isDeleting ? "Deleting..." : "Delete My Account"}
							</button>
							<button
								type="button"
								onClick={() => {
									setShowDeleteModal(false);
									setDeleteConfirmText("");
								}}
								disabled={isDeleting}
								className="flex-1 bg-theme-input border border-theme-border-input text-theme-secondary px-4 py-3 rounded-lg hover:bg-theme-input hover:border-theme-hover-border disabled:cursor-not-allowed transition-all font-semibold"
							>
								Cancel
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
