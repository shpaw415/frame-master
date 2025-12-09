import React from "react";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-white selection:bg-blue-500/30">
      {/* Layout Header - Persists across pages */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-linear-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
              FM
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg tracking-tight leading-none bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                Frame Master
              </span>
              <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider leading-none mt-1">
                cloudflare-pages-react-tailwind
              </span>
            </div>
          </div>

          <div className="flex items-center gap-6 text-sm font-medium text-slate-400">
            <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
              <span className="text-blue-400 text-xs">Layout Active</span>
            </div>
            <a href="/" className="hover:text-white transition-colors">
              Home
            </a>
            <a
              href="https://github.com/shpaw415"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main>{children}</main>
    </div>
  );
}
