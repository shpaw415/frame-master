export default function CliLoginPage() {
	return (
		<main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-6 py-16">
			<p className="text-sm font-medium text-theme-muted">Frame-Master CLI</p>
			<h1 className="mt-2 text-3xl font-bold text-theme-text">CLI login moved</h1>
			<p className="mt-3 text-theme-muted">
				<code className="text-theme-text">frame-master login</code> now signs in
				through OpenAuthster. The browser opens the issuer, then the CLI stores
				the access and refresh tokens itself. This approval page is no longer
				used.
			</p>
		</main>
	);
}
