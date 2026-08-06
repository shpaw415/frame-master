
type RouteTreeNode = {
	isStaticPage: boolean;
	hasDynamicDescendant: boolean;
	children: Map<string, RouteTreeNode>;
};

export const DYNAMIC_ROUTE_SEGMENT_PATTERN = /\/\[[^/]+\](?:\/|$)/;
export const NON_PAGE_ROUTE_PATTERNS = [/\/layout$/, /\/loading$/, /\/404$/];

export function createRouteTreeNode(): RouteTreeNode {
	return {
		isStaticPage: false,
		hasDynamicDescendant: false,
		children: new Map(),
	};
}

function getRouteSegments(pathname: string) {
	if (pathname === "/") return [];
	return pathname.slice(1).split("/").filter(Boolean);
}

function upsertRouteChild(node: RouteTreeNode, segment: string) {
	const child = node.children.get(segment);
	if (child) return child;

	const nextChild = createRouteTreeNode();
	node.children.set(segment, nextChild);
	return nextChild;
}

export function addStaticRoute(root: RouteTreeNode, pathname: string) {
	let current = root;
	for (const segment of getRouteSegments(pathname)) {
		current = upsertRouteChild(current, segment);
	}
	current.isStaticPage = true;
}

export function markDynamicRoute(root: RouteTreeNode, pathname: string) {
	let current = root;
	current.hasDynamicDescendant = true;

	for (const segment of getRouteSegments(pathname)) {
		current = upsertRouteChild(current, segment);
		current.hasDynamicDescendant = true;
	}
}

export function collectStaticExcludeRules(
	node: RouteTreeNode,
	pathname = "/",
): string[] {
	if (pathname !== "/" && !node.hasDynamicDescendant) {
		const rules = node.isStaticPage ? [pathname] : [];
		if (node.children.size > 0) {
			rules.push(`${pathname}/*`);
		}
		return rules;
	}

	const rules = pathname === "/" && node.isStaticPage ? ["/"] : [];
	for (const [segment, child] of node.children) {
		const childPath = pathname === "/" ? `/${segment}` : `${pathname}/${segment}`;
		rules.push(...collectStaticExcludeRules(child, childPath));
	}

	return rules;
}

export function isNonPageRoute(pathname: string) {
	return NON_PAGE_ROUTE_PATTERNS.some((matcher) => matcher.test(pathname));
}