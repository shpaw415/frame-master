export default function NotFound() {
	return (
		<div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
			<div className="absolute top-0 left-1/2 -translate-x-1/2 w-200 h-100 bg-blue-500/10 rounded-full blur-[120px] -z-10 pointer-events-none" />
			<div className="absolute bottom-0 right-0 w-160 h-120 bg-purple-500/10 rounded-full blur-[100px] -z-10 pointer-events-none" />

			<div className="flex flex-col items-center gap-8 text-center px-4">
				<div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-sm font-mono font-medium">
					<span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
					404
				</div>

				<div className="flex flex-col items-center gap-4">
					<h1 className="text-7xl md:text-9xl font-bold tracking-tighter text-transparent bg-clip-text bg-linear-to-r from-blue-400 to-purple-500 select-none">
						404
					</h1>
					<h2 className="text-2xl md:text-3xl font-semibold text-white">
						Page not found
					</h2>
					<p className="text-slate-400 max-w-sm leading-relaxed">
						The page you're looking for doesn't exist or has been moved.
					</p>
				</div>

				<a
					href="/"
					className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-semibold transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
				>
					Back to home
				</a>
			</div>
		</div>
	);
}
