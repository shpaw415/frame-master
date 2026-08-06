import createMiddleware from "frame-master-plugin-cloudflare-pages-dynamic-ssr/middleware";
import KVProvider from "frame-master-plugin-cloudflare-pages-dynamic-ssr/provider/store/kv";
import { PageWrapper } from "../action-utils/page-wrapper";

export const onRequest = createMiddleware<Env>((ctx) => ({
	storeProvider: KVProvider({ binding: ctx.env.DYNAMIC_PAGE_KV }),
	parser: {
		jsx(pathname, pageElement) {
			return PageWrapper({
				children: pageElement,
				pathname,
			});
		},
	},
}));
