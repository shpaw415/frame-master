import {
	DELETE as deleteUser,
	GET as GetUser,
	type UserInfoResponse,
	type UserUpdateFields,
	PUT as updateUser,
} from "@api/admin/user";
import { useState } from "react";
import { type ClientType, type Roles, RolesList } from "@/auth";
import { useAuthEffect } from "@/hooks";

// ============================================================================
// USER CARD COMPONENT (Mobile)
// ============================================================================

function UserCard({
	user,
	onEdit,
	onDelete,
}: {
	user: UserInfoResponse;
	onEdit: (user: UserInfoResponse) => void;
	onDelete: (id: UserInfoResponse["id"]) => void;
}) {
	const [showMenu, setShowMenu] = useState(false);

	const getRoleBadgeClass = (role: UserInfoResponse["role"]) => {
		switch (role) {
			case "admin":
				return "bg-red-900/50 text-red-200 border border-red-700";
			case "moderator":
				return "bg-yellow-900/50 text-yellow-200 border border-yellow-700";
			default:
				return "bg-blue-900/50 text-blue-200 border border-blue-700";
		}
	};

	return (
		<div className="bg-theme-card border border-theme-border rounded-lg p-4">
			{/* User Header */}
			<div className="flex items-start justify-between gap-3 mb-3">
				<div className="flex items-center gap-3 min-w-0 flex-1">
					{user.public?.avatarUrl ? (
						<img
							src={user.public.avatarUrl}
							alt={user.public.name || "Avatar"}
							className="w-12 h-12 rounded-full shrink-0"
						/>
					) : (
						<div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center font-semibold text-white shrink-0">
							{user.public.name?.charAt(0).toUpperCase() || "U"}
						</div>
					)}
					<div className="min-w-0 flex-1">
						<div className="font-medium text-theme-text truncate">
							{user.public.name ?? "Unnamed User"}
						</div>
						<div className="text-sm text-theme-muted truncate">
							{user.email}
						</div>
					</div>
				</div>

				{/* Action Menu */}
				<div className="relative shrink-0">
					<button
						type="button"
						onClick={() => setShowMenu(!showMenu)}
						className="p-2 hover:bg-theme-input rounded-lg transition-colors"
					>
						<svg
							className="w-5 h-5 text-theme-muted"
							fill="currentColor"
							viewBox="0 0 20 20"
						>
							<title>More options</title>
							<path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
						</svg>
					</button>
					{showMenu && (
						<>
							<button
								type="button"
								className="fixed inset-0 z-10"
								onClick={() => setShowMenu(false)}
							/>
							<div className="absolute right-0 top-full mt-1 bg-theme-card border border-theme-border rounded-lg shadow-lg z-20 min-w-30">
								<button
									type="button"
									onClick={() => {
										onEdit(user);
										setShowMenu(false);
									}}
									className="w-full px-4 py-2 text-left text-sm hover:bg-theme-input transition-colors text-theme-text rounded-t-lg"
								>
									Edit
								</button>
								<button
									type="button"
									onClick={() => {
										onDelete(user.id);
										setShowMenu(false);
									}}
									className="w-full px-4 py-2 text-left text-sm hover:bg-red-900/30 transition-colors text-red-400 rounded-b-lg"
								>
									Delete
								</button>
							</div>
						</>
					)}
				</div>
			</div>

			{/* User Details */}
			<div className="space-y-2 text-sm">
				<div className="flex items-center justify-between">
					<span className="text-theme-muted">Role</span>
					<span
						className={`px-2 py-0.5 text-xs rounded ${getRoleBadgeClass(
							user.role,
						)}`}
					>
						{user.role}
					</span>
				</div>
				<div className="flex items-center justify-between">
					<span className="text-theme-muted">Joined</span>
					<span className="text-theme-text">
						{new Date(user.created_at || "").toLocaleDateString()}
					</span>
				</div>
				{user.public.githubUrl && (
					<div className="flex items-center justify-between">
						<span className="text-theme-muted">GitHub</span>
						<a
							href={user.public.githubUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="text-blue-400 hover:underline truncate max-w-37.5"
						>
							Profile →
						</a>
					</div>
				)}
			</div>
		</div>
	);
}

// ============================================================================
// FILTER DRAWER COMPONENT (Mobile)
// ============================================================================

function MobileFilterDrawer({
	isOpen,
	onClose,
	roleFilter,
	onRoleChange,
}: {
	isOpen: boolean;
	onClose: () => void;
	roleFilter: Roles | "all";
	onRoleChange: (role: Roles | "all") => void;
}) {
	if (!isOpen) return null;

	return (
		<>
			<button
				type="button"
				className="fixed inset-0 bg-black/50 z-40 md:hidden"
				onClick={onClose}
			/>
			<div className="fixed bottom-0 left-0 right-0 bg-theme-card border-t border-theme-border rounded-t-2xl z-50 md:hidden animate-slide-up">
				<div className="p-4">
					<div className="flex items-center justify-between mb-4">
						<h3 className="font-semibold text-theme-text">Filter Users</h3>
						<button
							type="button"
							onClick={onClose}
							className="p-2 hover:bg-theme-input rounded-lg"
						>
							<svg
								className="w-5 h-5 text-theme-muted"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<title>Close</title>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M6 18L18 6M6 6l12 12"
								/>
							</svg>
						</button>
					</div>

					<div className="space-y-3">
						<label
							className="block text-sm font-medium text-theme-muted mb-2"
							htmlFor="role-buttons"
						>
							Role
						</label>
						{(
							["all", "user", "moderator", "admin"] as Array<Roles | "all">
						).map((role) => (
							<button
								type="button"
								key={role}
								onClick={() => {
									onRoleChange(role);
									onClose();
								}}
								className={`w-full px-4 py-3 text-left rounded-lg transition-colors ${
									roleFilter === role
										? "bg-blue-600 text-white"
										: "bg-theme-input text-theme-text hover:bg-theme-border"
								}`}
							>
								{role === "all"
									? "All Roles"
									: role.charAt(0).toUpperCase() + role.slice(1)}
							</button>
						))}
					</div>
				</div>
			</div>
		</>
	);
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AdminPanel() {
	const [isLoading, setIsLoading] = useState(true);
	const [showModal, setShowModal] = useState(false);
	const [modalMode, setModalMode] = useState<"edit">("edit");
	const [users, setUsers] = useState<Array<UserInfoResponse>>([]);
	const [selectedUser, setSelectedUser] = useState<
		ClientType["userMeta"]["id"] | null
	>(null);
	const [searchTerm, setSearchTerm] = useState("");
	const [roleFilter, setRoleFilter] = useState<Roles | "all">("all");
	const [error, setError] = useState<string | null>(null);
	const [showFilterDrawer, setShowFilterDrawer] = useState(false);

	const [formData, setFormData] = useState<UserUpdateFields>({
		role: "user",
	});

	// Check authentication
	useAuthEffect(() => {
		loadUsers();
	});

	// Load users
	const loadUsers = async (filter?: { role: Roles }) => {
		setIsLoading(true);
		setError(null);
		try {
			const response = filter
				? await GetUser({ page: 1, perPage: 100, filter })
				: await GetUser();
			if (response.success && Array.isArray(response.data)) {
				setUsers(response.data);
			} else {
				setError(response.error || "Failed to load users");
			}
		} catch (err) {
			setError("An error occurred while loading users");
			console.error(err);
		} finally {
			setIsLoading(false);
		}
	};

	// Handle role filter change
	const handleRoleFilterChange = (role: Roles | "all") => {
		setRoleFilter(role);
		if (role === "all") {
			loadUsers();
		} else {
			loadUsers({ role });
		}
	};

	// Open modal for editing a user
	const handleEditUser = (user: UserInfoResponse) => {
		setModalMode("edit");
		setSelectedUser(user.id);
		setFormData({
			role: user.role as Roles,
		});
		setShowModal(true);
	};

	// Delete user
	const handleDeleteUser = async (userId: string) => {
		if (!confirm("Are you sure you want to delete this user?")) return;

		try {
			const response = await deleteUser(userId);
			if (response.success) {
				setUsers(users.filter((u) => u.id !== userId));
			} else {
				alert(response.error || "Failed to delete user");
			}
		} catch (err) {
			alert("An error occurred while deleting the user");
			console.error(err);
		}
	};

	// Submit form (add or edit)
	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);

		try {
			const fd = formData;
			// Filter out empty values
			const updates: Partial<UserUpdateFields> = {};
			if (fd.role) updates.role = fd.role;
			const response = await updateUser(selectedUser as string, updates);
			if (response.success && response.data) {
				const updatedUser = response.data;
				setUsers(users.map((u) => (u.id === selectedUser ? updatedUser : u)));
				setShowModal(false);
			} else {
				setError(response.error || "Failed to update user");
			}
		} catch (err) {
			setError("An error occurred while saving the user");
			console.error(err);
		}
	};

	// Filter users based on search
	const filteredUsers = users.filter(
		(user) =>
			user.public.name?.toLowerCase().includes(searchTerm?.toLowerCase()) ||
			user.email?.toLowerCase().includes(searchTerm?.toLowerCase()),
	);

	const getRoleBadgeClass = (role: UserInfoResponse["role"]) => {
		switch (role) {
			case "admin":
				return "bg-red-900/50 text-red-200 border border-red-700";
			case "moderator":
				return "bg-yellow-900/50 text-yellow-200 border border-yellow-700";
			default:
				return "bg-blue-900/50 text-blue-200 border border-blue-700";
		}
	};

	return (
		<div className="p-4 md:p-8">
			<div className="max-w-7xl mx-auto">
				{/* Header */}
				<div className="mb-6 md:mb-8">
					<h1 className="text-2xl md:text-4xl font-bold mb-2 text-theme-text">
						User Management
					</h1>
					<p className="text-sm md:text-base text-theme-muted mb-4">
						Manage system users and permissions
					</p>
				</div>

				{/* Error Message */}
				{error && (
					<div className="mb-4 md:mb-6 p-3 md:p-4 bg-red-900/50 border border-red-600 rounded-lg text-sm md:text-base">
						{error}
					</div>
				)}

				{/* Search and Filter */}
				<div className="mb-4 md:mb-6 flex gap-2 md:gap-4">
					<div className="relative flex-1">
						<svg
							className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<title>Search</title>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
							/>
						</svg>
						<input
							type="text"
							placeholder="Search users..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							className="w-full pl-10 pr-4 py-2.5 md:py-3 bg-theme-card border border-theme-border rounded-lg focus:outline-none focus:border-blue-500 transition-colors text-sm md:text-base"
						/>
					</div>

					{/* Mobile Filter Button */}
					<button
						type="button"
						onClick={() => setShowFilterDrawer(true)}
						className="md:hidden px-3 py-2.5 bg-theme-card border border-theme-border rounded-lg flex items-center gap-2"
					>
						<svg
							className="w-5 h-5 text-theme-muted"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<title>Filter</title>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
							/>
						</svg>
						{roleFilter !== "all" && (
							<span className="w-2 h-2 bg-blue-500 rounded-full" />
						)}
					</button>

					{/* Desktop Filter */}
					<select
						value={roleFilter}
						onChange={(e) =>
							handleRoleFilterChange(e.target.value as Roles | "all")
						}
						className="hidden md:block px-4 py-3 bg-theme-card border border-theme-border rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
					>
						<option value="all">All Roles</option>
						<option value="user">User</option>
						<option value="moderator">Moderator</option>
						<option value="admin">Admin</option>
					</select>
				</div>

				{/* Stats Summary */}
				<div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 md:mb-6">
					<div className="bg-theme-card border border-theme-border rounded-lg p-3 md:p-4">
						<div className="text-lg md:text-2xl font-bold text-theme-text">
							{users.length}
						</div>
						<div className="text-xs md:text-sm text-theme-muted">
							Total Users
						</div>
					</div>
					<div className="bg-theme-card border border-theme-border rounded-lg p-3 md:p-4">
						<div className="text-lg md:text-2xl font-bold text-red-400">
							{users.filter((u) => u.role === "admin").length}
						</div>
						<div className="text-xs md:text-sm text-theme-muted">Admins</div>
					</div>
					<div className="bg-theme-card border border-theme-border rounded-lg p-3 md:p-4">
						<div className="text-lg md:text-2xl font-bold text-yellow-400">
							{users.filter((u) => u.role === "moderator").length}
						</div>
						<div className="text-xs md:text-sm text-theme-muted">
							Moderators
						</div>
					</div>
					<div className="bg-theme-card border border-theme-border rounded-lg p-3 md:p-4">
						<div className="text-lg md:text-2xl font-bold text-blue-400">
							{users.filter((u) => u.role === "user").length}
						</div>
						<div className="text-xs md:text-sm text-theme-muted">Users</div>
					</div>
				</div>

				{/* Loading State */}
				{isLoading ? (
					<div className="flex items-center justify-center py-12">
						<div className="flex items-center gap-2 text-theme-muted">
							<div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
							Loading users...
						</div>
					</div>
				) : filteredUsers.length === 0 ? (
					<div className="text-center py-12 text-theme-disabled">
						{searchTerm
							? "No users found matching your search"
							: "No users available"}
					</div>
				) : (
					<>
						{/* Mobile Card View */}
						<div className="md:hidden space-y-3">
							{filteredUsers.map((user) => (
								<UserCard
									key={user.id}
									user={user}
									onEdit={handleEditUser}
									onDelete={handleDeleteUser}
								/>
							))}
						</div>

						{/* Desktop Table View */}
						<div className="hidden md:block bg-theme-card rounded-lg border border-theme-border overflow-hidden">
							<table className="w-full">
								<thead className="bg-theme-input">
									<tr>
										<th className="px-6 py-4 text-left text-sm font-semibold text-theme-text">
											User
										</th>
										<th className="px-6 py-4 text-left text-sm font-semibold text-theme-text">
											Email
										</th>
										<th className="px-6 py-4 text-left text-sm font-semibold text-theme-text">
											Role
										</th>
										<th className="px-6 py-4 text-left text-sm font-semibold text-theme-text">
											Joined
										</th>
										<th className="px-6 py-4 text-right text-sm font-semibold text-theme-text">
											Actions
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-theme-border">
									{filteredUsers.map((user) => (
										<tr
											key={user.id}
											className="hover:bg-theme-input/50 transition-colors"
										>
											<td className="px-6 py-4">
												<div className="flex items-center gap-3">
													{user.public.avatarUrl ? (
														<img
															src={user.public.avatarUrl}
															alt={user.public.name || "Avatar"}
															className="w-10 h-10 rounded-full"
														/>
													) : (
														<div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-semibold text-white">
															{user.public.name?.charAt(0).toUpperCase() || "U"}
														</div>
													)}
													<div>
														<div className="font-medium text-theme-text">
															{user.public.name ?? "Unnamed User"}
														</div>
														{user.public.githubUrl && (
															<a
																href={user.public.githubUrl}
																target="_blank"
																rel="noopener noreferrer"
																className="text-xs text-blue-400 hover:underline"
															>
																GitHub
															</a>
														)}
													</div>
												</div>
											</td>
											<td className="px-6 py-4 text-theme-secondary">
												{user.email}
											</td>
											<td className="px-6 py-4">
												<span
													className={`px-2 py-1 text-xs rounded ${getRoleBadgeClass(
														user.role,
													)}`}
												>
													{user.role}
												</span>
											</td>
											<td className="px-6 py-4 text-theme-muted text-sm">
												{new Date(user.created_at).toLocaleDateString()}
											</td>
											<td className="px-6 py-4">
												<div className="flex justify-end gap-2">
													<button
														type="button"
														onClick={() => handleEditUser(user)}
														className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors text-sm"
													>
														Edit
													</button>
													<button
														type="button"
														onClick={() => handleDeleteUser(user.id)}
														className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors text-sm"
													>
														Delete
													</button>
												</div>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</>
				)}
			</div>

			{/* Mobile Filter Drawer */}
			<MobileFilterDrawer
				isOpen={showFilterDrawer}
				onClose={() => setShowFilterDrawer(false)}
				roleFilter={roleFilter}
				onRoleChange={handleRoleFilterChange}
			/>

			{/* Modal */}
			{showModal && (
				<div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
					<div className="bg-theme-card rounded-t-2xl md:rounded-lg w-full md:max-w-2xl max-h-[90vh] flex flex-col">
						<div className="shrink-0 bg-theme-card border-b border-theme-border px-4 md:px-6 py-4 rounded-t-2xl md:rounded-t-lg">
							<div className="flex justify-between items-center">
								<h2 className="text-xl md:text-2xl font-bold text-theme-text">
									{modalMode === "edit" ? "Edit User" : "No action"}
								</h2>
								<button
									type="button"
									onClick={() => setShowModal(false)}
									className="p-2 hover:bg-theme-input rounded-lg text-theme-muted hover:text-theme-text"
								>
									<svg
										className="w-6 h-6"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<title>Close</title>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M6 18L18 6M6 6l12 12"
										/>
									</svg>
								</button>
							</div>
						</div>

						<form
							onSubmit={handleSubmit}
							className="p-4 md:p-6 overflow-y-auto flex-1"
						>
							{/* Error in modal */}
							{error && (
								<div className="mb-4 p-3 bg-red-900/50 border border-red-600 rounded-lg text-sm">
									{error}
								</div>
							)}

							{/* Role */}
							<div className="mb-6">
								<label
									className="block text-sm font-semibold mb-2 text-theme-text"
									htmlFor="role-selector"
								>
									Role
								</label>
								<select
									id="role-selector"
									value={formData.role}
									onChange={(e) =>
										setFormData({ ...formData, role: e.target.value as Roles })
									}
									className="w-full px-4 py-2.5 md:py-2 bg-theme-input border border-theme-border-input rounded-lg focus:outline-none focus:border-blue-500 text-base"
								>
									{RolesList.map((role) => (
										<option key={role} value={role}>
											{role.charAt(0).toUpperCase() + role.slice(1)}
										</option>
									))}
								</select>
							</div>

							{/* Form Buttons */}
							<div className="flex flex-col-reverse md:flex-row justify-end gap-3 pt-4 border-t border-theme-border">
								<button
									type="button"
									onClick={() => setShowModal(false)}
									className="w-full md:w-auto px-6 py-3 md:py-2 bg-theme-input hover:bg-theme-border-input text-theme-text rounded-lg transition-colors"
								>
									Cancel
								</button>
								<button
									type="submit"
									className="w-full md:w-auto px-6 py-3 md:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-semibold"
								>
									{modalMode === "edit" ? "Save Changes" : "Not supported"}
								</button>
							</div>
						</form>
					</div>
				</div>
			)}
		</div>
	);
}
