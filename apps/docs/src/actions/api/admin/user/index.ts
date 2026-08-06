import { getContext } from "frame-master-plugin-cloudflare-pages-functions-action/context";
import { deleteUser, logError } from "@/action_ext/utils";
import {
	type ClientType,
	type PublicSession,
	type Roles,
	RolesList,
} from "@/auth";

type ApiResponse<T = unknown> = {
	success: boolean;
	data?: T;
	error?: string;
};

export type UserInfoResponse = {
	created_at: string;
	id: string;
	role: Roles | "Not specified" | null;
	public: PublicSession;
	email: string;
};

// ============================================================================
// GET - Fetch all users or a specific user
// ============================================================================
export async function GET(
	params?:
		| {
				userId: string;
				page?: undefined;
				perPage?: undefined;
				filter?: undefined;
		  }
		| {
				page: number;
				perPage: number;
				filter: { role: Roles };
				userId?: undefined;
		  }
		| undefined,
): Promise<ApiResponse<UserInfoResponse | Array<UserInfoResponse>>> {
	const context = getContext<Cloudflare.Env, never, { client: ClientType }>(
		arguments,
	);

	const client = context.data.client;

	try {
		if (params?.userId) {
			const userFromAuth = await client.getUserById(params.userId);

			if (userFromAuth instanceof Error || !userFromAuth.error) {
				return {
					success: false,
					error: `Error fetching user from auth system: ${userFromAuth instanceof Error ? userFromAuth.message : "Unknown error"}`,
				};
			}
			const user = userFromAuth.data?.users.at(0);

			if (!user) {
				return {
					success: false,
					error: `User not found in auth system: id: ${params.userId}`,
				};
			}

			return {
				success: true,
				data: {
					id: user.id,
					role: user.role,
					public: user.session_public as PublicSession,
					created_at: user.created_at,
					email: user.data.email as string,
				},
			};
		} else if (params?.filter) {
			const allUsers = await client.getUsers();

			if (allUsers instanceof Error || allUsers.error) {
				return {
					success: false,
					error: `Error fetching users from auth system: ${allUsers instanceof Error ? allUsers.message : "Unknown error"}`,
				};
			}

			let filterdUsers = allUsers.data?.users || [];

			if (params.filter.role) {
				filterdUsers = filterdUsers?.filter(
					(user) => user.role === params.filter.role,
				);
			}

			return {
				success: true,
				data: filterdUsers.map((user) => ({
					id: user.id,
					role: params.filter.role,
					public: user.session_public as PublicSession,
					email: user.data.email as string,
					created_at: user.created_at,
				})),
			};
		}

		const users = await client.getUsers(
			params
				? {
						page: params.page,
						limit: params.perPage,
					}
				: undefined,
		);

		if (users instanceof Error || users.error) {
			return {
				success: false,
				error: `Error fetching users from auth system: ${users instanceof Error ? users.message : "Unknown error"}`,
			};
		}

		const userRoled: Array<UserInfoResponse> =
			users.data?.users.map((user) => ({
				id: user.id as string,
				role: user.role || "Not specified",
				public: user.session_public as PublicSession,
				email: user.data.email as string,
				created_at: user.created_at,
			})) || [];

		return {
			success: true,
			data: userRoled,
		};
	} catch (error) {
		console.error("Error fetching users:", error);
		await logError({
			context: context as never,
			error: error as Error,
			endpoint: "/admin/api/user",
			method: "GET",
			severity: "error",
			additionalContext: { params },
		});
		return { success: false, error: "Failed to fetch users" };
	}
}

export type UserUpdateFields = {
	role?: Roles;
};

// ============================================================================
// PUT - Update an existing user
// ============================================================================
export async function PUT(
	userId: string,
	updates: Partial<UserUpdateFields>,
): Promise<ApiResponse<UserInfoResponse>> {
	const context = getContext<Cloudflare.Env, never, { client: ClientType }>(
		arguments,
	);

	try {
		if (updates.role && !RolesList.includes(updates.role)) {
			return { success: false, error: "Invalid role" };
		}

		const client = context.data.client;

		const updatedUser = await client.updateUserById(userId, {
			session_private: {
				...client.data.private,
				role: updates.role || client.userMeta.role || "Not specified",
			},
		});

		if (updatedUser instanceof Error) {
			return {
				success: false,
				error: `Error updating user in auth system: ${updatedUser instanceof Error ? updatedUser.message : "Unknown error"}`,
			};
		}

		const user = updatedUser?.users.at(0);

		if (!user) {
			return {
				success: false,
				error: `User not found after update in auth system: id: ${userId}`,
			};
		}

		return {
			success: true,
			data: {
				id: user.id,
				role:
					(user.session_private?.role as Roles | undefined) || "Not specified",
				created_at: user.created_at,
				email: user.data.email as string,
				public: user.session_public as PublicSession,
			},
		};
	} catch (error) {
		console.error("Error updating user:", error);
		await logError({
			context: context as never,
			error: error as Error,
			endpoint: "/admin/api/user",
			method: "PUT",
			severity: "error",
			additionalContext: { userId, updates },
		});
		return { success: false, error: "Failed to update user" };
	}
}

// ============================================================================
// DELETE - Delete a user
// ============================================================================
export async function DELETE(
	userId: string,
): Promise<ApiResponse<{ deleted: boolean }>> {
	const context = getContext<Cloudflare.Env, never, { client: ClientType }>(
		arguments,
	);

	try {
		return deleteUser(userId, context.env.DB, context.data.client);
	} catch (error) {
		console.error("Error deleting user:", error);
		await logError({
			context: context as never,
			error: error as Error,
			endpoint: "/admin/api/user",
			method: "DELETE",
			severity: "error",
			additionalContext: { userId },
		});
		return { success: false, error: "Failed to delete user" };
	}
}
