import { useEffect, useState } from "react";
import { useAuth } from "@/hooks";
import { navigate, routes } from "@/utils";

type AuthMethod = "password" | "passkey" | "qr";

const LockIcon = () => (
	<svg viewBox="0 0 48 48" fill="none" className="w-14 h-14" aria-hidden="true">
		<title>Lock</title>
		<rect
			x="9"
			y="22"
			width="30"
			height="20"
			rx="3"
			stroke="currentColor"
			strokeWidth="1.8"
		/>
		<path
			d="M16 22v-7a8 8 0 0116 0v7"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
		/>
		<circle cx="24" cy="33" r="2.5" fill="currentColor" />
		<line
			x1="24"
			y1="35.5"
			x2="24"
			y2="39"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
		/>
	</svg>
);

const FingerprintIcon = () => (
	<svg viewBox="0 0 48 48" fill="none" className="w-14 h-14" aria-hidden="true">
		<title>Fingerprint</title>
		<path
			d="M24 10c7.732 0 14 6.268 14 14"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
		/>
		<path
			d="M10 24c0-7.732 6.268-14 14-14"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
		/>
		<path
			d="M19 24a5 5 0 0110 0c0 4-2.5 9-5 13"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
		/>
		<path
			d="M14 24c0-5.523 4.477-10 10-10"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
		/>
		<path
			d="M34 24c0 5.523-4.477 10-10 10"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
		/>
		<path
			d="M24 34v4"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
		/>
	</svg>
);

const QRIcon = () => (
	<svg viewBox="0 0 48 48" fill="none" className="w-14 h-14" aria-hidden="true">
		<title>QR Code</title>
		<rect
			x="6"
			y="6"
			width="14"
			height="14"
			rx="2"
			stroke="currentColor"
			strokeWidth="1.8"
		/>
		<rect x="10" y="10" width="6" height="6" fill="currentColor" rx="0.5" />
		<rect
			x="28"
			y="6"
			width="14"
			height="14"
			rx="2"
			stroke="currentColor"
			strokeWidth="1.8"
		/>
		<rect x="32" y="10" width="6" height="6" fill="currentColor" rx="0.5" />
		<rect
			x="6"
			y="28"
			width="14"
			height="14"
			rx="2"
			stroke="currentColor"
			strokeWidth="1.8"
		/>
		<rect x="10" y="32" width="6" height="6" fill="currentColor" rx="0.5" />
		<rect x="28" y="28" width="6" height="6" fill="currentColor" rx="0.5" />
		<rect x="36" y="28" width="6" height="6" fill="currentColor" rx="0.5" />
		<rect x="28" y="36" width="6" height="6" fill="currentColor" rx="0.5" />
		<rect x="36" y="36" width="6" height="6" fill="currentColor" rx="0.5" />
	</svg>
);

const SpinnerIcon = () => (
	<svg
		viewBox="0 0 16 16"
		className="w-3.5 h-3.5"
		fill="none"
		aria-hidden="true"
	>
		<title>Loading</title>
		<circle
			cx="8"
			cy="8"
			r="6"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeDasharray="14 8"
			strokeLinecap="round"
		/>
	</svg>
);

const methods = [
	{
		id: "password" as AuthMethod,
		code: "01",
		title: "CIPHER",
		subtitle: "Email & Password",
		hint: "Classic credential authentication",
		Icon: LockIcon,
		color: "#818cf8",
		bgColor: "rgba(99,102,241,0.08)",
		borderIdle: "rgba(99,102,241,0.18)",
		borderActive: "rgba(129,140,248,0.7)",
		glow: "0 0 35px rgba(99,102,241,0.45), 0 0 70px rgba(99,102,241,0.18)",
	},
	{
		id: "passkey" as AuthMethod,
		code: "02",
		title: "BIOMETRIC",
		subtitle: "Passkey / Touch ID",
		hint: "Device-bound cryptographic key",
		Icon: FingerprintIcon,
		color: "#34d399",
		bgColor: "rgba(16,185,129,0.08)",
		borderIdle: "rgba(16,185,129,0.18)",
		borderActive: "rgba(52,211,153,0.7)",
		glow: "0 0 35px rgba(16,185,129,0.45), 0 0 70px rgba(16,185,129,0.18)",
	},
	{
		id: "qr" as AuthMethod,
		code: "03",
		title: "REMOTE LINK",
		subtitle: "QR Code Scan",
		hint: "Authenticate from another device",
		Icon: QRIcon,
		color: "#fbbf24",
		bgColor: "rgba(245,158,11,0.08)",
		borderIdle: "rgba(245,158,11,0.18)",
		borderActive: "rgba(251,191,36,0.7)",
		glow: "0 0 35px rgba(245,158,11,0.45), 0 0 70px rgba(245,158,11,0.18)",
	},
];

export default function LoginPage() {
	const auth = useAuth();
	const [selected, setSelected] = useState<AuthMethod | null>(null);
	const [hovering, setHovering] = useState<AuthMethod | null>(null);

	useEffect(() => {
		if (auth.isAuthenticated) {
			navigate(routes.home);
		}
	}, [auth.isAuthenticated]);

	const handleSelect = async (method: AuthMethod) => {
		if (selected) return;
		setSelected(method);
		await auth.login({ provider: method });
	};

	return (
		<div
			className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden select-none"
			style={{ background: "#050510" }}
		>
			{/* Grid backdrop */}
			<div
				className="absolute inset-0 pointer-events-none"
				style={{
					backgroundImage: `
              linear-gradient(rgba(129,140,248,0.035) 1px, transparent 1px),
              linear-gradient(90deg, rgba(129,140,248,0.035) 1px, transparent 1px)
            `,
					backgroundSize: "52px 52px",
				}}
			/>

			{/* Ambient orbs */}
			<div
				className="absolute pointer-events-none"
				style={{
					top: "-25%",
					left: "-15%",
					width: "700px",
					height: "700px",
					borderRadius: "50%",
					background:
						"radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 65%)",
					filter: "blur(60px)",
				}}
			/>
			<div
				className="absolute pointer-events-none"
				style={{
					bottom: "-20%",
					right: "-12%",
					width: "600px",
					height: "600px",
					borderRadius: "50%",
					background:
						"radial-gradient(circle, rgba(16,185,129,0.055) 0%, transparent 65%)",
					filter: "blur(60px)",
				}}
			/>

			{/* Floating particles */}
			{Array.from({ length: 20 }).map((_, i) => (
				<div
					key={i}
					className="absolute rounded-full lp-particle"
					style={{
						left: `${(i * 4.9 + 1.5) % 100}%`,
						bottom: `-${6 + ((i * 9) % 24)}px`,
						width: `${1.5 + (i % 3) * 0.8}px`,
						height: `${1.5 + (i % 3) * 0.8}px`,
						background: ["#818cf8", "#34d399", "#fbbf24"][i % 3],
						animationDuration: `${9 + ((i * 1.4) % 11)}s`,
						animationDelay: `${(i * 0.65) % 7}s`,
					}}
				/>
			))}

			{/* Content */}
			<div className="relative z-10 flex flex-col items-center w-full max-w-5xl px-5">
				{/* Header */}
				<div className="lp-title text-center mb-12">
					<div
						className="text-xs font-mono tracking-[0.45em] mb-5 lp-flicker"
						style={{ color: "rgba(129,140,248,0.65)" }}
					>
						FRAME&nbsp;MASTER &nbsp;·&nbsp; ACCESS&nbsp;PORTAL &nbsp;·&nbsp;
						SECURE&nbsp;ZONE
					</div>

					<h1
						className="text-5xl md:text-[5.5rem] font-black leading-none mb-4"
						style={{
							background:
								"linear-gradient(140deg, #f1f5f9 0%, #94a3b8 45%, #818cf8 100%)",
							WebkitBackgroundClip: "text",
							WebkitTextFillColor: "transparent",
							backgroundClip: "text",
							letterSpacing: "-0.035em",
						}}
					>
						AUTHENTICATE
					</h1>

					<p
						className="text-xs font-mono tracking-[0.3em]"
						style={{ color: "rgba(100,116,139,0.75)" }}
					>
						— SELECT YOUR ACCESS METHOD —
					</p>
				</div>

				{/* Cards */}
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-3xl">
					{methods.map((m) => {
						const isSelected = selected === m.id;
						const isOther = selected !== null && selected !== m.id;
						const isHovered = hovering === m.id && !selected;

						return (
							<button
								key={m.id}
								type="button"
								disabled={!!selected}
								className="lp-card relative text-left rounded-2xl p-7 flex flex-col gap-5 overflow-hidden transition-all duration-300 cursor-pointer"
								style={{
									background:
										isSelected || isHovered
											? m.bgColor
											: "rgba(255,255,255,0.025)",
									border: `1px solid ${isSelected || isHovered ? m.borderActive : m.borderIdle}`,
									boxShadow: isSelected || isHovered ? m.glow : "none",
									opacity: isOther ? 0.18 : 1,
									transform: isSelected
										? "scale(1.025)"
										: isOther
											? "scale(0.96)"
											: "scale(1)",
									filter: isOther ? "grayscale(1) blur(1px)" : "none",
									backdropFilter: "blur(16px)",
								}}
								onMouseEnter={() => setHovering(m.id)}
								onMouseLeave={() => setHovering(null)}
								onClick={() => handleSelect(m.id)}
								aria-label={`Sign in with ${m.subtitle}`}
							>
								{/* Scan line on hover */}
								{isHovered && (
									<div
										className="lp-scan-line absolute inset-x-0 h-px pointer-events-none"
										style={{
											background: `linear-gradient(90deg, transparent 0%, ${m.color} 50%, transparent 100%)`,
											top: 0,
										}}
									/>
								)}

								{/* Pulse ring on selected */}
								{isSelected && (
									<div
										className="lp-pulse absolute inset-0 rounded-2xl pointer-events-none"
										style={{
											border: `1.5px solid ${m.color}`,
										}}
									/>
								)}

								{/* Corner code */}
								<span
									className="text-xs font-mono tracking-[0.3em]"
									style={{ color: `${m.color}70` }}
								>
									{m.code} ───
								</span>

								{/* Icon */}
								<div
									style={{
										color: m.color,
										filter:
											isSelected || isHovered
												? `drop-shadow(0 0 10px ${m.color})`
												: "none",
										transition: "filter 0.3s ease",
									}}
								>
									<m.Icon />
								</div>

								{/* Labels */}
								<div className="flex flex-col gap-1.5">
									<span
										className="font-black text-xl tracking-wider transition-colors duration-200"
										style={{
											color: isSelected || isHovered ? m.color : "#e2e8f0",
										}}
									>
										{m.title}
									</span>
									<span
										className="text-sm font-medium"
										style={{ color: "rgba(148,163,184,0.85)" }}
									>
										{m.subtitle}
									</span>
									<span
										className="text-xs"
										style={{ color: "rgba(100,116,139,0.7)" }}
									>
										{m.hint}
									</span>
								</div>

								{/* Bottom status */}
								<div className="mt-auto pt-2">
									{isSelected ? (
										<div
											className="flex items-center gap-2 text-xs font-mono"
											style={{ color: m.color }}
										>
											<span className="lp-spin">
												<SpinnerIcon />
											</span>
											CONNECTING...
										</div>
									) : (
										<div
											className="text-xs font-mono transition-opacity duration-200"
											style={{
												color: m.color,
												opacity: isHovered ? 1 : 0,
											}}
										>
											→ ENTER
										</div>
									)}
								</div>
							</button>
						);
					})}
				</div>

				{/* Footer */}
				<div
					className="mt-14 text-xs font-mono text-center leading-relaxed"
					style={{ color: "rgba(51,65,85,0.9)", letterSpacing: "0.12em" }}
				>
					SECURED &nbsp;·&nbsp; END-TO-END ENCRYPTED &nbsp;·&nbsp; ZERO
					KNOWLEDGE
				</div>
			</div>
		</div>
	);
}
