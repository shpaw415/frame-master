import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { type ClientType, createClient } from "./auth";

// Use a global so the context survives HMR and StrictMode double-mounts
declare global {
	var __AUTH_CTX__: React.Context<ClientType>;
	var __SESSION_LOADED__: React.Context<boolean>;
}
globalThis.__AUTH_CTX__ ??= createContext({} as ClientType);
globalThis.__SESSION_LOADED__ ??= createContext(false);

export function AuthProvider({
	children,
	onQRAuthFlow,
}: {
	children: ReactNode;
	onQRAuthFlow?: (client: ClientType) => Promise<string>;
}) {
	const client = useRef(
		createClient({
			redirectURI:
				typeof window !== "undefined"
					? (process.env.PUBLIC_REDIRECT_URI as string)
					: "",
			async onQRAuthFlowStart(client) {
				return {
					totp_elevated_token: (await onQRAuthFlow?.(client)) ?? "",
				};
			},
		}),
	);
	const [session, setSession] = useState(false);

	useEffect(() => {
		globalThis.__fetch__ = client.current.fetch.bind(
			client.current,
		) as typeof fetch;
		client.current.init().then(() => {
			if (!client.current.isAuthenticated) return;
			client.current.setTokenToCookie();
			client.current.getUserSession("public").then(() => {
				client.current.triggerUpdate();
				setSession(true);
			});
		});
	}, []);

	return (
		<globalThis.__AUTH_CTX__.Provider value={client.current}>
			<globalThis.__SESSION_LOADED__.Provider value={session}>
				{children}
			</globalThis.__SESSION_LOADED__.Provider>
		</globalThis.__AUTH_CTX__.Provider>
	);
}

export function useAuth() {
	const ctx = useContext(globalThis.__AUTH_CTX__);
	const key = useRef(crypto.randomUUID());
	const [, rerender] = useState("");

	useEffect(() => {
		ctx.addInitializationListener(key.current, () =>
			rerender(crypto.randomUUID()),
		);
		return () => ctx.removeInitializationListener(key.current);
	}, [ctx]);

	return ctx;
}

export function useAuthEffect(
	effect: (client: ClientType) => unknown | (() => unknown),
	deps: unknown[] = [],
) {
	const ctx = useAuth();
	const sessionLoaded = useContext(globalThis.__SESSION_LOADED__);
	const id = useRef(crypto.randomUUID());
	const _effect = useRef(effect);
	useEffect(() => {
		_effect.current = effect;
	}, [...deps]);
	useEffect(() => {
		if (ctx.isAuthenticated && sessionLoaded) _effect.current(ctx);
		ctx.addInitializationListener(id.current, (client) => {
			if (ctx.isAuthenticated && sessionLoaded) _effect.current(client);
		});
		return () => ctx.removeInitializationListener(id.current);
	}, [sessionLoaded, ctx, _effect.current]);
	return ctx;
}
