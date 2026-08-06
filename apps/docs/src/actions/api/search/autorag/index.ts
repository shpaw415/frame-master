import { logError, rateLimitManager } from "@/action_ext/utils";

export async function onRequestGet(
	ctx: EventContext<Cloudflare.Env, never, never>,
) {
	const query = new URL(ctx.request.url).searchParams.get("query");

	if (!query || query.length < 3) {
		return Response.json({
			success: false,
			message: "Query must be at least 3 characters long.",
		});
	}
	try {
		// Prefer Cloudflare-provided IP, then fall back to common forwarding headers
		const clientIP = getClientIp(ctx.request) || null;

		if (!clientIP) {
			return new Response("Unable to determine client IP for rate limiting.", {
				status: 400,
			});
		}

		const rl = await rateLimitManager.create({
			userId: clientIP,
			endpoint: "/api/search/autorag",
			db: ctx.env.DB,
			defaults: {
				period: 3600,
				limit: 20,
				used: 0,
			},
		});

		if (!rl.canProceed())
			return new Response(
				`Rate limit exceeded. Try again in ${Math.round(
					rl.timeUntilReset() / 60,
				)} minutes.`,
				{ status: 429 },
			);

		rl.increment();
		await rl.upsert();

		return ctx.env.AI.autorag("tiny-pine-408c").aiSearch({
			stream: true,
			query,
			rewrite_query: true,
			max_num_results: 2,
			ranking_options: {
				score_threshold: 0.3,
			},
			reranking: {
				enabled: true,
				model: "@cf/baai/bge-reranker-base",
			},
		});
	} catch (e) {
		logError({
			context: ctx,
			error: e,
			endpoint: "/api/search/autorag",
			method: "GET",
			severity: "error",
			additionalContext: { query },
		});
		return new Response(`Error: ${(e as Error).message}`, { status: 500 });
	}
}

function getClientIp(request: Request): string | null {
	const cf = request.cf;
	const forwardedFor = request.headers.get("x-forwarded-for");
	const forwardedIp = forwardedFor
		?.split(",")
		.map((part) => part.trim())
		.find(Boolean);

	return (
		(cf?.ip as string) ||
		request.headers.get("cf-connecting-ip") ||
		request.headers.get("true-client-ip") ||
		forwardedIp ||
		request.headers.get("x-real-ip") ||
		null
	);
}
