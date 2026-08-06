export default function Loading() {
	return (
		<div className="min-h-screen bg-theme-bg flex items-center justify-center overflow-hidden">
			<div className="relative">
				{/* Animated Background */}
				<div className="absolute inset-0 -z-10">
					<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
					<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-green-500/20 rounded-full blur-3xl animate-pulse delay-100"></div>
				</div>

				{/* Loading Content */}
				<div className="text-center">
					{/* Animated Template Icon */}
					<div className="mb-8 relative">
						<div className="w-24 h-24 mx-auto bg-linear-to-br from-blue-500 to-green-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/50 animate-bounce">
							<span className="text-5xl">📁</span>
						</div>
						<div className="absolute -inset-4 bg-linear-to-r from-blue-500/0 via-blue-500/30 to-blue-500/0 blur-xl animate-pulse"></div>
					</div>

					{/* Loading Text */}
					<h3 className="text-2xl font-bold text-theme-text mb-3 animate-pulse">
						Loading Template Details
					</h3>
					<p className="text-theme-muted mb-8">
						Fetching project template information...
					</p>

					{/* Progress Bar */}
					<div className="w-64 h-2 mx-auto bg-theme-input rounded-full overflow-hidden">
						<div className="h-full bg-linear-to-r from-blue-500 to-green-500 rounded-full animate-loading-bar"></div>
					</div>

					{/* Loading Steps */}
					<div className="mt-8 space-y-2 text-sm text-theme-disabled">
						<div className="flex items-center justify-center gap-2 animate-fade-in">
							<span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping"></span>
							Connecting to database...
						</div>
						<div className="flex items-center justify-center gap-2 animate-fade-in delay-200">
							<span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping"></span>
							Retrieving template data...
						</div>
						<div className="flex items-center justify-center gap-2 animate-fade-in delay-400">
							<span className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-ping"></span>
							Preparing visualization...
						</div>
					</div>
				</div>
			</div>

			<style>{`
          @keyframes loading-bar {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(400%); }
          }
          .animate-loading-bar {
            animation: loading-bar 1.5s ease-in-out infinite;
          }
          @keyframes fade-in {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-in {
            animation: fade-in 0.5s ease-out forwards;
            opacity: 0;
          }
          .delay-100 { animation-delay: 0.1s; }
          .delay-200 { animation-delay: 0.2s; }
          .delay-400 { animation-delay: 0.4s; }
        `}</style>
		</div>
	);
}
