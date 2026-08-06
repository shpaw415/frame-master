import { getContext } from "frame-master-plugin-cloudflare-pages-functions-action/context";
import { rateLimitManager } from "@/action_ext/utils";
import { createClient } from "@/auth";

export type AIResponseType = {
	result: {
		response: string;
		usage:
			| {
					prompt_tokens: number;
					completion_tokens: number;
					total_tokens: number;
			  }
			| Record<string, never>;
	};
	success: boolean;
	errors: string[];
	messages: string[];
};

const rateLimitTime = 3600; // in seconds
const limitPerUser = 5;

/////////////
// AI Format Markdown description
/////////////
export async function POST(description: string): Promise<AIResponseType> {
	const ctx = getContext<Env, never, never>(arguments);

	const session = await createClient().setTokenFromRequest(
		ctx.request as unknown as Request,
	);
	await session.getUserSession("public");

	if (!session.isAuthenticated || !session.userMeta.id) {
		return {
			result: {
				response: "Unauthorized",
				usage: {},
			},
			success: false,
			errors: ["Unauthorized"],
			messages: ["User is not authenticated"],
		};
	}

	const rateLimiter = await rateLimitManager.create({
		userId: session.userMeta.id,
		endpoint: "/api/plugins/ai",
		db: ctx.env.DB,
		defaults: {
			limit: limitPerUser,
			period: rateLimitTime,
			used: 0,
		},
	});

	if (!rateLimiter.canProceed()) {
		return {
			result: {
				response: "Rate limit exceeded",
				usage: {},
			},
			success: false,
			errors: [
				`Rate limit exceeded for the next ${Math.round(rateLimiter.timeUntilReset() / 60)} min.`,
			],
			messages: ["You have exceeded your rate limit for this endpoint."],
		};
	}

	const input = {
		messages: [
			{
				role: "system",
				content:
					"You are a helpful assistant that formats and beautify text in markdown.",
			},
			{
				role: "user",
				content: description,
			},
		],
	};

	const response = await fetch(ctx.env.CLOUDFLARE_WORKER_AI_API_URL, {
		headers: {
			Authorization: `Bearer ${ctx.env.CLOUDFLARE_WORKER_AI_API_KEY}`,
		},
		method: "POST",
		body: JSON.stringify(input),
	});

	rateLimiter.increment();
	await rateLimiter.upsert().run();

	return (await response.json()) as AIResponseType;
}
