import { getContext } from "frame-master-plugin-cloudflare-pages-functions-action/context";
import { getReleaseNotes } from "@/action_ext/utils";

// ===========================================================================
// GET Release Notes
// ===========================================================================
export async function GET(id?: number) {
	const ctx = getContext<Cloudflare.Env, never, never>(arguments);
	return getReleaseNotes({ db: ctx.env.DB, id });
}
