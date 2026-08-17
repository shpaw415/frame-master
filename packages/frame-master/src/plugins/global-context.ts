import type {
	PluginContext,
	PluginContextKey,
	PluginGlobalContext,
} from "./types";

type GlobalPluginStore = typeof globalThis & {
	__GLOBAL_CONTEXT__?: PluginContext;
};

type MergeablePluginContext = Record<string, unknown>;

function getGlobalPluginStore(): PluginContext {
	const store = globalThis as GlobalPluginStore;
	store.__GLOBAL_CONTEXT__ ??= {};
	return store.__GLOBAL_CONTEXT__;
}

function isMergeablePluginContext(
	value: unknown,
): value is MergeablePluginContext {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function getGlobalPluginContext(): PluginContext;
export function getGlobalPluginContext<TPluginName extends PluginContextKey>(
	pluginName: TPluginName,
): PluginGlobalContext<TPluginName> | undefined;
export function getGlobalPluginContext(pluginName?: PluginContextKey) {
	const store = getGlobalPluginStore();
	if (typeof pluginName === "undefined") return store;
	return store[pluginName] as
		| PluginGlobalContext<typeof pluginName>
		| undefined;
}

export function hasGlobalPluginContext(pluginName: PluginContextKey): boolean {
	return Object.hasOwn(getGlobalPluginStore(), pluginName);
}

export function setGlobalPluginContext<TPluginName extends PluginContextKey>(
	pluginName: TPluginName,
	context: PluginGlobalContext<TPluginName>,
): PluginGlobalContext<TPluginName> {
	const store = getGlobalPluginStore() as Record<string, unknown>;
	store[pluginName] = context;
	return store[pluginName] as PluginGlobalContext<TPluginName>;
}

export function mergeGlobalPluginContext<TPluginName extends PluginContextKey>(
	pluginName: TPluginName,
	context: PluginGlobalContext<TPluginName>,
): PluginGlobalContext<TPluginName> {
	const store = getGlobalPluginStore() as Record<string, unknown>;
	const previousContext = store[pluginName];

	if (
		isMergeablePluginContext(previousContext) &&
		isMergeablePluginContext(context)
	) {
		store[pluginName] = {
			...previousContext,
			...context,
		};
	} else {
		store[pluginName] = context;
	}

	return store[pluginName] as PluginGlobalContext<TPluginName>;
}

export function deleteGlobalPluginContext(
	pluginName: PluginContextKey,
): boolean {
	return delete getGlobalPluginStore()[pluginName];
}
