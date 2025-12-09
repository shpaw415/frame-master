import React from "react";

export default function HomePage() {
  return (
    <div>
      {/* Hero Section */}
      <header className="relative overflow-hidden pt-32 pb-20 lg:pt-48 lg:pb-32">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-blue-500/20 rounded-full blur-[120px] -z-10 opacity-50 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[800px] h-[600px] bg-purple-500/10 rounded-full blur-[100px] -z-10 opacity-30 pointer-events-none" />

        <div className="container mx-auto px-4 text-center">
          <div className="mb-8 inline-flex items-center justify-center p-2 bg-slate-900/50 rounded-2xl border border-slate-800 backdrop-blur-sm">
            <img
              src="/static/logo.webp"
              alt="Logo"
              className="w-16 h-16 object-contain"
            />
          </div>

          <div className="mb-6">
            <span className="inline-block px-4 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-sm font-mono font-medium">
              React • Tailwind CSS • Cloudflare Pages
            </span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
            Cloudflare Pages
            <span className="block mt-2 text-transparent bg-clip-text bg-linear-to-r from-blue-400 to-purple-500">
              React + Tailwind
            </span>
          </h1>

          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            The ultimate starter kit for building high-performance React
            applications with Tailwind CSS styling, deployed instantly to
            Cloudflare Pages.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a
              href="#get-started"
              className="px-8 py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-semibold transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
            >
              Get Started
            </a>
            <a
              href="https://developers.cloudflare.com/pages"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-3.5 bg-slate-800 hover:bg-slate-700 text-white rounded-full font-semibold transition-all border border-slate-700"
            >
              Documentation
            </a>
          </div>
        </div>
      </header>

      {/* Features Section */}
      <section className="py-24 bg-slate-900/50 border-y border-slate-800/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Why Choose This Template?
            </h2>
            <p className="text-slate-400">
              Everything you need to build modern web applications
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
            {[
              {
                icon: "⚛️",
                title: "React",
                desc: "Built with the latest React features for building interactive and dynamic user interfaces.",
              },
              {
                icon: "🎨",
                title: "Tailwind CSS",
                desc: "Rapidly build modern websites without ever leaving your HTML using utility-first classes.",
              },
              {
                icon: "☁️",
                title: "Cloudflare Pages",
                desc: "Deploy your site to the edge in seconds with global low latency and high performance.",
              },
              {
                icon: "📘",
                title: "TypeScript",
                desc: "First-class TypeScript support for type-safe development and better developer experience.",
              },
              {
                icon: "⚡",
                title: "Bun",
                desc: "Powered by Bun for lightning-fast installations, development server, and building.",
              },
              {
                icon: "🛠️",
                title: "Frame Master",
                desc: "Orchestrated by Frame Master for a seamless and powerful development workflow.",
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="p-8 bg-slate-950 rounded-2xl border border-slate-800 hover:border-blue-500/30 transition-colors group"
              >
                <div className="text-4xl mb-6 bg-slate-900 w-16 h-16 flex items-center justify-center rounded-xl group-hover:scale-110 transition-transform duration-300">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold mb-3 text-slate-100">
                  {feature.title}
                </h3>
                <p className="text-slate-400 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Get Started Section */}
      <section id="get-started" className="py-32 relative">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-12">Get Started</h2>

          <div className="max-w-2xl mx-auto bg-slate-900 rounded-2xl border border-slate-800 p-8 md:p-12 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-blue-500 via-purple-500 to-blue-500 opacity-50" />

            <p className="text-xl text-slate-300 mb-8">
              Ready to build? Start by editing your entry file:
            </p>

            <div className="bg-slate-950 rounded-xl p-6 border border-slate-800 inline-block mx-auto shadow-inner">
              <code className="font-mono text-blue-400 text-lg">
                src/pages/index.tsx
              </code>
            </div>
          </div>
        </div>
      </section>

      {/* Tech Stack Section */}
      <section className="py-20 border-t border-slate-800">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold mb-10 text-slate-300">
            Powered By
          </h2>
          <div className="flex flex-wrap justify-center gap-4 md:gap-8">
            {[
              "React",
              "Tailwind CSS",
              "TypeScript",
              "Cloudflare Pages",
              "Frame Master",
              "Bun",
            ].map((tech) => (
              <span
                key={tech}
                className="px-6 py-2 bg-slate-900 rounded-full border border-slate-800 text-slate-400 font-medium hover:border-slate-700 hover:text-slate-200 transition-colors cursor-default"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-slate-800 bg-slate-950">
        <div className="container mx-auto px-4 text-center">
          <p className="text-slate-500 mb-6">
            Built with ❤️ using Frame Master
          </p>
          <div className="flex justify-center gap-8 text-slate-400">
            <a
              href="https://github.com/shpaw415"
              className="hover:text-blue-400 transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://cloudflare.com"
              className="hover:text-blue-400 transition-colors"
            >
              Cloudflare
            </a>
            <a href="#" className="hover:text-blue-400 transition-colors">
              Documentation
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
