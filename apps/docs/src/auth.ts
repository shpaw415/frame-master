import {
	type CacheStoreData,
	createOpenAuthsterClient,
} from "openauthster-shared/client/user";

declare global {
	var __fetch__: typeof fetch;
}

export type ClientType = ReturnType<typeof createClient>;

const clientCache = new Map<
	string,
	{ data: CacheStoreData<any, any, any>; expiresAt: Date }
>();

export function createClient({
	secret,
	redirectURI,
	token,
	onQRAuthFlowStart,
}: {
	secret?: string;
	redirectURI?: string;
	token?: string;
	onQRAuthFlowStart?: (
		client: ReturnType<
			typeof createOpenAuthsterClient<PublicSession, PrivateSession, Roles>
		>,
	) =>
		| boolean
		| { totp_elevated_token: string }
		| Promise<{ totp_elevated_token: string } | boolean>;
} = {}) {
	const client = createOpenAuthsterClient<PublicSession, PrivateSession, Roles>(
		{
			clientID: "__frame_master_8cba5930",
			issuerURI: "https://455431595f324bd1a1e1bde3f57783b9-auth.webcreas.com",
			redirectURI: redirectURI || "",
			secret,
			token,
			cache_provider:
				typeof window !== "undefined"
					? undefined
					: {
							async get(token) {
								const cached = clientCache.get(token);
								if (!cached) return null;
								if (cached.expiresAt < new Date()) {
									clientCache.delete(token);
									return null;
								}
								return cached.data;
							},
							async set(token, value, expiresAt) {
								clientCache.set(token, { data: value, expiresAt });
							},
							async delete(token) {
								clientCache.delete(token);
							},
						},
			authFlowCallbacks: {
				onQRAuthFlowStart(client) {
					return onQRAuthFlowStart?.(client) ?? false;
				},
			},
		},
	);

	return client;
}

export const RolesList = ["admin", "moderator", "user"] as const;

export type Roles = (typeof RolesList)[number];

export type PublicSession = {
	bio?: string;
	avatarUrl?: string;
	githubUrl?: string;
	name?: string;
	inited?: true;
};
export type PrivateSession = Record<string, unknown>;
