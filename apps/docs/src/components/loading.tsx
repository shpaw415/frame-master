export default function Loading() {
	return (
		<div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
			<div className="absolute top-0 left-1/2 -translate-x-1/2 w-200 h-100 bg-blue-500/10 rounded-full blur-[120px] -z-10 pointer-events-none" />

			<div className="flex flex-col items-center gap-6 text-center">
				<div className="relative w-16 h-16">
					<div className="absolute inset-0 rounded-full border-2 border-slate-800" />
					<div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-500 animate-spin" />
					<div className="absolute inset-2 rounded-full border-2 border-transparent border-t-purple-500 animate-spin [animation-duration:0.6s]" />
				</div>

				<div className="flex flex-col items-center gap-2">
					<p className="text-slate-300 font-medium tracking-wide">Loading</p>
					<div className="flex gap-1">
						<span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:0ms]" />
						<span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:150ms]" />
						<span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce [animation-delay:300ms]" />
					</div>
				</div>
			</div>
		</div>
	);
}
