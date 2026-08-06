import { NextJsStyleLayoutSetup } from "frame-master-plugin-cloudflare-pages-dynamic-ssr/utils/index.tsx";
import type { JSX } from "react";
import Shell from "../shell";

export function PageWrapper({
	children,
	pathname,
}: {
	children: JSX.Element;
	pathname: string;
}) {
	return (
		<Shell>
			<script src="/@apply-react/client-hydrate.js" type="module" />
			<script src="/@cf-process-env.js" type="module" />
			{NextJsStyleLayoutSetup.PageWrapper({
				children,
				pathname,
			})}
		</Shell>
	);
}
