import type { BunPlugin } from "bun";
import type {
	FrameMasterPlugin,
	VirtualModuleContentsFactory,
	VirtualModuleDeclaration,
} from "./types";

export const VIRTUAL_MODULE_NAMESPACE = "frame-master-virtual-module";

export function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createVirtualModuleResolveFilter(
	specifiers: Iterable<string>,
): RegExp {
	return new RegExp(`^(?:${[...specifiers].map(escapeRegExp).join("|")})$`);
}

export type RegisteredVirtualModule = VirtualModuleDeclaration & {
	pluginName: string;
};

type VirtualModuleFile = Pick<
	Bun.BunFile,
	| "arrayBuffer"
	| "bytes"
	| "exists"
	| "json"
	| "size"
	| "stream"
	| "text"
	| "type"
>;

let nativeBunFile: typeof Bun.file | null = null;
let activeRegistry: VirtualModuleRegistry | null = null;
let virtualModuleFileProxyInstalled = false;

export function isVirtualModuleContentsFactory(
	contents: VirtualModuleDeclaration["contents"],
): contents is VirtualModuleContentsFactory {
	return typeof contents === "function";
}

function isResolvedVirtualModuleContents(
	value: unknown,
): value is string | Uint8Array {
	return typeof value === "string" || value instanceof Uint8Array;
}

function factoryFailedError(
	specifier: string,
	pluginName: string,
	cause: unknown,
): Error {
	return new Error(
		`Virtual module "${specifier}" contents factory from plugin "${pluginName}" failed`,
		{ cause },
	);
}

function invalidContentsError(specifier: string, pluginName: string): Error {
	return new Error(
		`Virtual module "${specifier}" contents factory from plugin "${pluginName}" must return a string or Uint8Array.`,
	);
}

function assertResolvedContents(
	value: unknown,
	specifier: string,
	pluginName: string,
): asserts value is string | Uint8Array {
	if (!isResolvedVirtualModuleContents(value)) {
		throw invalidContentsError(specifier, pluginName);
	}
}

export async function resolveVirtualModuleContents(
	module: RegisteredVirtualModule,
	specifier: string,
): Promise<string | Uint8Array> {
	if (!isVirtualModuleContentsFactory(module.contents)) {
		return module.contents;
	}

	let resolved: string | Uint8Array | Promise<string | Uint8Array>;
	try {
		resolved = module.contents();
	} catch (error) {
		throw factoryFailedError(specifier, module.pluginName, error);
	}

	try {
		resolved = await resolved;
	} catch (error) {
		throw factoryFailedError(specifier, module.pluginName, error);
	}

	assertResolvedContents(resolved, specifier, module.pluginName);
	return resolved;
}

export function resolveVirtualModuleContentsSync(
	module: RegisteredVirtualModule,
	specifier: string,
): string | Uint8Array {
	if (!isVirtualModuleContentsFactory(module.contents)) {
		return module.contents;
	}

	let resolved: string | Uint8Array | Promise<string | Uint8Array>;
	try {
		resolved = module.contents();
	} catch (error) {
		throw factoryFailedError(specifier, module.pluginName, error);
	}

	if (resolved instanceof Promise) {
		throw new Error(
			`Virtual module "${specifier}" contents factory from plugin "${module.pluginName}" is async; use .text() / .bytes() instead of sync accessors.`,
		);
	}

	assertResolvedContents(resolved, specifier, module.pluginName);
	return resolved;
}

function contentsToBytes(contents: string | Uint8Array): Uint8Array {
	return typeof contents === "string"
		? new TextEncoder().encode(contents)
		: contents;
}

function moduleType(loader: Bun.Loader): string {
	switch (loader) {
		case "json":
			return "application/json";
		case "css":
			return "text/css";
		case "html":
			return "text/html";
		case "text":
			return "text/plain";
		default:
			return "application/javascript";
	}
}

function createVirtualModuleFile(
	registry: VirtualModuleRegistry,
	specifier: string,
): VirtualModuleFile {
	const getModule = () => {
		const module = registry.getModule(specifier);
		if (!module)
			throw new Error(`Virtual module "${specifier}" is no longer registered.`);
		return module;
	};
	const getBytesSync = () =>
		contentsToBytes(resolveVirtualModuleContentsSync(getModule(), specifier));
	const getBytes = async () =>
		contentsToBytes(await resolveVirtualModuleContents(getModule(), specifier));

	return {
		get size() {
			return getBytesSync().byteLength;
		},
		get type() {
			const module = registry.getModule(specifier);
			return module ? moduleType(module.loader) : "";
		},
		async arrayBuffer() {
			const bytes = await getBytes();
			return bytes.buffer.slice(
				bytes.byteOffset,
				bytes.byteOffset + bytes.byteLength,
			) as ArrayBuffer;
		},
		async bytes() {
			return new Uint8Array(await getBytes());
		},
		async exists() {
			return registry.getModule(specifier) !== undefined;
		},
		async json() {
			return JSON.parse(await this.text());
		},
		stream() {
			return new Blob([getBytesSync().slice().buffer], {
				type: this.type,
			}).stream();
		},
		async text() {
			return new TextDecoder().decode(await getBytes());
		},
	};
}

/**
 * Enables the opt-in Bun.file compatibility layer for registry-backed modules.
 * The wrapper itself is installed once; config reloads only replace its registry.
 */
export function configureVirtualModuleFileProxy(
	enabled: boolean,
	registry: VirtualModuleRegistry,
): void {
	activeRegistry = enabled ? registry : null;

	if (enabled && !virtualModuleFileProxyInstalled) {
		const bunWithMutableFile = Bun as unknown as { file: typeof Bun.file };
		nativeBunFile = Bun.file;
		bunWithMutableFile.file = ((path: string, options?: BlobPropertyBag) => {
			const module = activeRegistry?.getModule(path);
			if (module && activeRegistry) {
				return createVirtualModuleFile(activeRegistry, path) as Bun.BunFile;
			}
			if (!nativeBunFile) throw new Error("Bun.file is not available.");
			return nativeBunFile(path, options);
		}) as typeof Bun.file;
		virtualModuleFileProxyInstalled = true;
	}

	if (!enabled && virtualModuleFileProxyInstalled) {
		const bunWithMutableFile = Bun as unknown as { file: typeof Bun.file };
		if (!nativeBunFile) throw new Error("Bun.file is not available.");
		bunWithMutableFile.file = nativeBunFile;
		virtualModuleFileProxyInstalled = false;
		nativeBunFile = null;
	}
}

/**
 * Owns declared plugin virtual modules for one loaded Frame-Master config.
 * A new instance is created with each PluginLoader, including config reloads.
 */
export class VirtualModuleRegistry {
	private modules = new Map<string, RegisteredVirtualModule>();

	constructor(plugins: FrameMasterPlugin[]) {
		for (const plugin of plugins) {
			for (const [specifier, declaration] of Object.entries(
				plugin.virtualModules ?? {},
			)) {
				const existing = this.modules.get(specifier);
				if (existing) {
					throw new Error(
						`Virtual module "${specifier}" is declared by both plugins "${existing.pluginName}" and "${plugin.name}".`,
					);
				}
				this.modules.set(specifier, {
					...declaration,
					pluginName: plugin.name,
				});
			}
		}
	}

	hasRuntimeModules(): boolean {
		return [...this.modules.values()].some((module) => module.injectRuntime);
	}

	getModule(specifier: string): RegisteredVirtualModule | undefined {
		return this.modules.get(specifier);
	}

	createPlugin(runtimeOnly = false): BunPlugin | null {
		const modules = new Map(
			[...this.modules].filter(
				([, module]) => !runtimeOnly || module.injectRuntime,
			),
		);
		if (modules.size === 0) return null;

		const resolveFilter = createVirtualModuleResolveFilter(modules.keys());

		return {
			name: runtimeOnly
				? "frame-master-runtime-virtual-modules"
				: "frame-master-virtual-modules",
			setup(build) {
				build.onResolve({ filter: resolveFilter }, (args) => {
					if (!modules.has(args.path)) return undefined;
					return { path: args.path, namespace: VIRTUAL_MODULE_NAMESPACE };
				});
				build.onLoad(
					{ filter: /.*/, namespace: VIRTUAL_MODULE_NAMESPACE },
					async (args) => {
						const module = modules.get(args.path);
						if (!module) return undefined;
						return {
							contents: await resolveVirtualModuleContents(module, args.path),
							loader: module.loader,
						};
					},
				);
			},
		};
	}
}
