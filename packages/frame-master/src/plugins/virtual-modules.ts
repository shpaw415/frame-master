import type { BunPlugin } from "bun";
import type { FrameMasterPlugin, VirtualModuleDeclaration } from "./types";

export const VIRTUAL_MODULE_NAMESPACE = "frame-master-virtual-module";

export type RegisteredVirtualModule = VirtualModuleDeclaration & {
	pluginName: string;
};

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
				this.modules.set(specifier, { ...declaration, pluginName: plugin.name });
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
			[...this.modules].filter(([, module]) => !runtimeOnly || module.injectRuntime),
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
