import type { BunPlugin } from "bun";
import type { FrameMasterPlugin, VirtualModuleDeclaration } from "./types";

export const VIRTUAL_MODULE_NAMESPACE = "frame-master-virtual-module";

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

const nativeBunFile = Bun.file;
let activeRegistry: VirtualModuleRegistry | null = null;
let virtualModuleFileProxyInstalled = false;

function moduleBytes(module: RegisteredVirtualModule): Uint8Array {
	return typeof module.contents === "string"
		? new TextEncoder().encode(module.contents)
		: module.contents;
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
	const getModule = () => registry.getModule(specifier);
	const getBytes = () => {
		const module = getModule();
		if (!module)
			throw new Error(`Virtual module "${specifier}" is no longer registered.`);
		return moduleBytes(module);
	};

	return {
		get size() {
			return getBytes().byteLength;
		},
		get type() {
			const module = getModule();
			return module ? moduleType(module.loader) : "";
		},
		async arrayBuffer() {
			const bytes = getBytes();
			return bytes.buffer.slice(
				bytes.byteOffset,
				bytes.byteOffset + bytes.byteLength,
			) as ArrayBuffer;
		},
		async bytes() {
			return new Uint8Array(getBytes());
		},
		async exists() {
			return getModule() !== undefined;
		},
		async json() {
			return JSON.parse(await this.text());
		},
		stream() {
			return new Blob([getBytes().slice().buffer], {
				type: this.type,
			}).stream();
		},
		async text() {
			return new TextDecoder().decode(getBytes());
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
	const bunWithMutableFile = Bun as unknown as { file: typeof Bun.file };

	if (enabled && !virtualModuleFileProxyInstalled) {
		bunWithMutableFile.file = ((path: string, options?: BlobPropertyBag) => {
			const module = activeRegistry?.getModule(path);
			if (module && activeRegistry) {
				return createVirtualModuleFile(activeRegistry, path) as Bun.BunFile;
			}
			return nativeBunFile(path, options);
		}) as typeof Bun.file;
		virtualModuleFileProxyInstalled = true;
	}

	if (!enabled && virtualModuleFileProxyInstalled) {
		bunWithMutableFile.file = nativeBunFile;
		virtualModuleFileProxyInstalled = false;
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

		return {
			name: runtimeOnly
				? "frame-master-runtime-virtual-modules"
				: "frame-master-virtual-modules",
			setup(build) {
				build.onResolve({ filter: /.*/ }, (args) => {
					if (!modules.has(args.path)) return undefined;
					return { path: args.path, namespace: VIRTUAL_MODULE_NAMESPACE };
				});
				build.onLoad(
					{ filter: /.*/, namespace: VIRTUAL_MODULE_NAMESPACE },
					(args) => {
						const module = modules.get(args.path);
						if (!module) return undefined;
						return { contents: module.contents, loader: module.loader };
					},
				);
			},
		};
	}
}
