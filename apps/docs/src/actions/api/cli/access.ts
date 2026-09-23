"no action";

export class ListingError extends Error {
	readonly code: string;
	readonly installPath?: string;
	readonly status: number;

	constructor(
		message: string,
		options: { code: string; status: number; installPath?: string },
	) {
		super(message);
		this.name = "ListingError";
		this.code = options.code;
		this.status = options.status;
		this.installPath = options.installPath;
	}
}

export function resolveOwnedWrite(
	existingOwnerId: string | null,
	actorId: string,
): "create" | "update" | "forbidden" {
	if (!existingOwnerId) return "create";
	if (existingOwnerId === actorId) return "update";
	return "forbidden";
}
