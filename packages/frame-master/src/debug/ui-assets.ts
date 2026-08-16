import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const DEBUG_ASSET_NAME = /^(index\.html|chunk-[A-Za-z0-9_-]+\.(js|css))$/;

const BOOT_WATCHDOG = `<noscript><p style="font-family:system-ui,sans-serif;padding:24px">JavaScript is required for the Frame-Master debug UI.</p></noscript>
<script data-cfasync="false" id="fm-debug-boot-watchdog">
(function () {
  var root = document.getElementById("frame-master-debug-root");
  if (root && !root.textContent) root.textContent = "Loading Frame-Master debug UI...";
  function fail(message) {
    if (window.__FM_DEBUG_BOOTED) return;
    if (!root || root.getAttribute("data-fm-debug-failed") === "1") return;
    root.setAttribute("data-fm-debug-failed", "1");
    root.style.cssText = "box-sizing:border-box;display:block;font-family:system-ui,sans-serif;margin:0 auto;max-width:720px;padding:24px;";
    root.replaceChildren();
    var heading = document.createElement("h1");
    heading.textContent = "Debug UI failed to start";
    var description = document.createElement("p");
    description.textContent = message;
    var reload = document.createElement("button");
    reload.type = "button";
    reload.textContent = "Reload debug UI";
    reload.onclick = function () { window.location.reload(); };
    root.append(heading, description, reload);
  }
  window.addEventListener("error", function (event) {
    fail(event.message || "A script error prevented the debug UI from loading.");
  });
  window.addEventListener("unhandledrejection", function (event) {
    fail(String(event.reason || "An unhandled rejection prevented the debug UI from loading."));
  });
  setTimeout(function () {
    fail("The debug UI module never started. Cloudflare Rocket Loader can block type=module scripts on tunneled HTTPS pages.");
  }, 4000);
})();
</script>`;

export function getDebugUiAssetsDir(cwd = process.cwd()) {
	return join(cwd, ".frame-master", "debug-ui");
}

export function isDebugUiAssetName(name: string) {
	return DEBUG_ASSET_NAME.test(name);
}

export function rewriteDebugUiHtml(html: string) {
	let next = html
		.replaceAll('href="./', 'href="/')
		.replaceAll('src="./', 'src="/')
		.replace(
			/<script(?![^>]*data-cfasync)([^>]*type="module"[^>]*)>/g,
			'<script data-cfasync="false"$1>',
		);
	if (!next.includes("fm-debug-boot-watchdog")) {
		next = next.replace("</body>", `${BOOT_WATCHDOG}\n</body>`);
	}
	return next;
}

export function serveDebugUiAsset(
	pathname: string,
	assetsDir = getDebugUiAssetsDir(),
): Response | null {
	const name = basename(pathname);
	if (!isDebugUiAssetName(name)) return null;
	const filePath = join(assetsDir, name);
	if (!existsSync(filePath)) return null;
	if (name === "index.html") {
		return new Response(rewriteDebugUiHtml(readFileSync(filePath, "utf8")), {
			headers: {
				"Cache-Control": "no-store",
				"Content-Type": "text/html; charset=utf-8",
			},
		});
	}
	return new Response(Bun.file(filePath), {
		headers: { "Cache-Control": "no-store" },
	});
}
