import type { parsedReleaseNote } from "db/schema";
import MarkdownIt from "markdown-it";
import { useState } from "react";
import { toast } from "react-toastify";
import {
	POST as createReleaseNote,
	DELETE as deleteReleaseNote,
	GET as getReleaseNotes,
	PUT as updateReleaseNote,
} from "@api/admin/release";
import { useAuthEffect } from "@/hooks";

// ============================================================================
// TYPES
// ============================================================================

type FormMode = "create" | "edit" | null;

interface ReleaseNoteFormData {
	id?: number;
	version: string;
	title: string;
	content: string;
	githubUrl: string;
	releasedAt: Date;
}

// ============================================================================
// MARKDOWN RENDERER
// ============================================================================

const md = new MarkdownIt({
	html: false,
	linkify: true,
	typographer: true,
});

// ============================================================================
// RELEASE NOTE CARD COMPONENT (Mobile)
// ============================================================================

function ReleaseNoteCard({
	note,
	onEdit,
	onDelete,
	formatDate,
}: {
	note: parsedReleaseNote;
	onEdit: (note: parsedReleaseNote) => void;
	onDelete: (id: number) => void;
	formatDate: (date: Date) => string;
}) {
	const [showMenu, setShowMenu] = useState(false);

	return (
		<div className="bg-theme-card border border-theme-border rounded-lg p-4">
			{/* Header with version and menu */}
			<div className="flex items-start justify-between gap-3 mb-3">
				<div className="min-w-0 flex-1">
					<span className="inline-flex items-center px-2.5 py-1 rounded-full bg-blue-900/30 text-blue-400 font-mono text-sm mb-2">
						v{note.version}
					</span>
					<h3 className="font-medium text-theme-text line-clamp-2">
						{note.title}
					</h3>
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
							<title>Options</title>
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
										onEdit(note);
										setShowMenu(false);
									}}
									className="w-full px-4 py-2 text-left text-sm hover:bg-theme-input transition-colors text-theme-text rounded-t-lg flex items-center gap-2"
								>
									<span>✏️</span> Edit
								</button>
								<button
									type="button"
									onClick={() => {
										onDelete(note.id);
										setShowMenu(false);
									}}
									className="w-full px-4 py-2 text-left text-sm hover:bg-red-900/30 transition-colors text-red-400 rounded-b-lg flex items-center gap-2"
								>
									<span>🗑️</span> Delete
								</button>
							</div>
						</>
					)}
				</div>
			</div>

			{/* Details */}
			<div className="space-y-2 text-sm">
				<div className="flex items-center justify-between">
					<span className="text-theme-muted">Released</span>
					<span className="text-theme-text">{formatDate(note.releasedAt)}</span>
				</div>
				<div className="flex items-center justify-between">
					<span className="text-theme-muted">GitHub</span>
					<a
						href={note.githubUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="text-blue-400 hover:underline"
					>
						View Release →
					</a>
				</div>
			</div>
		</div>
	);
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AdminReleaseNotesPage() {
	const [releaseNotes, setReleaseNotes] = useState<parsedReleaseNote[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [formMode, setFormMode] = useState<FormMode>(null);
	const [currentNote, setCurrentNote] = useState<ReleaseNoteFormData | null>(
		null,
	);
	const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [showPreview, setShowPreview] = useState(false);

	// ============================================================================
	// FETCH RELEASE NOTES
	// ============================================================================

	const fetchReleaseNotes = async () => {
		setIsLoading(true);
		try {
			const response = await getReleaseNotes();
			if (response.success) {
				setReleaseNotes(response.data);
				setError(null);
			} else {
				setError(response.message);
				toast.error(`Error fetching release notes: ${response.message}`);
			}
		} catch (_err) {
			setError("Failed to fetch release notes");
			toast.error("Failed to fetch release notes");
		} finally {
			setIsLoading(false);
		}
	};

	useAuthEffect(() => {
		fetchReleaseNotes();
	}, []);

	// ============================================================================
	// FORM HANDLERS
	// ============================================================================

	const handleCreate = () => {
		setCurrentNote({
			version: "",
			title: "",
			content: "",
			githubUrl: "",
			releasedAt: new Date(),
		});
		setFormMode("create");
		setShowPreview(false);
	};

	const handleEdit = (note: parsedReleaseNote) => {
		setCurrentNote(note);
		setFormMode("edit");
		setShowPreview(false);
	};

	const handleCancel = () => {
		setCurrentNote(null);
		setFormMode(null);
		setShowPreview(false);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!currentNote) return;

		setIsSubmitting(true);
		try {
			if (formMode === "create") {
				const response = await createReleaseNote(currentNote as any);
				if (response.success) {
					toast.success("Release note created successfully");
					fetchReleaseNotes();
					handleCancel();
				} else {
					toast.error(`Failed to create: ${response.message}`);
				}
			} else if (formMode === "edit" && currentNote.id) {
				const response = await updateReleaseNote(currentNote.id, currentNote);
				if (response.success) {
					toast.success("Release note updated successfully");
					fetchReleaseNotes();
					handleCancel();
				} else {
					toast.error(`Failed to update: ${response.message}`);
				}
			}
		} catch (_err) {
			toast.error("An error occurred while saving");
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleDelete = async (id: number) => {
		setIsSubmitting(true);
		try {
			const response = await deleteReleaseNote(id);
			if (response.success) {
				toast.success("Release note deleted successfully");
				fetchReleaseNotes();
				setDeleteConfirm(null);
			} else {
				toast.error(`Failed to delete: ${response.message}`);
			}
		} catch (_err) {
			toast.error("An error occurred while deleting");
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleInputChange = (
		field: keyof ReleaseNoteFormData,
		value: string | Date,
	) => {
		if (!currentNote) return;
		setCurrentNote({ ...currentNote, [field]: value });
	};

	// ============================================================================
	// RENDER HELPERS
	// ============================================================================

	const formatDate = (date: Date) => {
		return new Date(date).toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	};

	const formatDateLong = (date: Date) => {
		return new Date(date).toLocaleDateString("en-US", {
			year: "numeric",
			month: "long",
			day: "numeric",
		});
	};

	const renderMarkdown = (content: string) => {
		return { __html: md.render(content) };
	};

	const getFormatedDate = (currentNote: ReleaseNoteFormData) => {
		return currentNote.releasedAt instanceof Date
			? currentNote.releasedAt.toISOString().split("T")[0]
			: new Date(currentNote.releasedAt).toISOString().split("T")[0];
	};

	// ============================================================================
	// RENDER FORM
	// ============================================================================

	if (formMode && currentNote) {
		return (
			<div className="p-4 md:p-6 max-w-6xl mx-auto">
				{/* Form Header */}
				<div className="flex items-center justify-between mb-4 md:mb-6">
					<h1 className="text-xl md:text-3xl font-bold text-theme-text">
						{formMode === "create" ? "Create" : "Edit"} Release Note
					</h1>
					<button
						type="button"
						onClick={handleCancel}
						className="p-2 md:px-4 md:py-2 bg-theme-input hover:bg-theme-border-input rounded-lg transition-colors text-theme-text"
					>
						<span className="hidden md:inline">← Back to List</span>
						<svg
							className="w-5 h-5 md:hidden"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<title>Back to List</title>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>

				<form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
						{/* Version */}
						<div>
							<label
								className="block text-sm font-medium mb-2 text-theme-text"
								htmlFor="version"
							>
								Version <span className="text-red-500">*</span>
							</label>
							<input
								type="text"
								id="version"
								value={currentNote.version}
								onChange={(e) => handleInputChange("version", e.target.value)}
								placeholder="e.g., 2.1.0"
								required
								className="w-full px-4 py-2.5 md:py-2 bg-theme-card border border-theme-border-input rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
							/>
						</div>

						{/* Release Date */}
						<div>
							<label
								className="block text-sm font-medium mb-2 text-theme-text"
								htmlFor="release-date"
							>
								Release Date <span className="text-red-500">*</span>
							</label>
							<input
								type="date"
								id="release-date"
								value={getFormatedDate(currentNote)}
								onChange={(e) => {
									const dateValue = e.target.value;
									if (dateValue) {
										// Parse as UTC to avoid timezone issues
										const parts = dateValue.split("-");
										if (parts.length === 3) {
											const year = Number(parts[0]);
											const month = Number(parts[1]);
											const day = Number(parts[2]);
											if (
												!Number.isNaN(year) &&
												!Number.isNaN(month) &&
												!Number.isNaN(day)
											) {
												const date = new Date(Date.UTC(year, month - 1, day));
												handleInputChange("releasedAt", date);
											}
										}
									}
								}}
								required
								className="w-full px-4 py-2.5 md:py-2 bg-theme-card border border-theme-border-input rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-theme-text text-base"
								style={{ colorScheme: "dark" }}
							/>
						</div>
					</div>

					{/* Title */}
					<div>
						<label
							className="block text-sm font-medium mb-2 text-theme-text"
							htmlFor="title"
						>
							Title <span className="text-red-500">*</span>
						</label>
						<input
							type="text"
							id="title"
							value={currentNote.title}
							onChange={(e) => handleInputChange("title", e.target.value)}
							placeholder="e.g., New Features and Bug Fixes"
							required
							className="w-full px-4 py-2.5 md:py-2 bg-theme-card border border-theme-border-input rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
						/>
					</div>

					{/* GitHub URL */}
					<div>
						<label
							className="block text-sm font-medium mb-2 text-theme-text"
							htmlFor="github-url"
						>
							GitHub Release URL <span className="text-red-500">*</span>
						</label>
						<input
							type="url"
							id="github-url"
							value={currentNote.githubUrl}
							onChange={(e) => handleInputChange("githubUrl", e.target.value)}
							placeholder="https://github.com/user/repo/releases/tag/v2.1.0"
							required
							className="w-full px-4 py-2.5 md:py-2 bg-theme-card border border-theme-border-input rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
						/>
					</div>

					{/* Content with Preview Toggle */}
					<div>
						<div className="flex items-center justify-between mb-2">
							<label
								className="block text-sm font-medium text-theme-text"
								htmlFor="content"
							>
								Content (Markdown) <span className="text-red-500">*</span>
							</label>
							<div className="flex bg-theme-input rounded-lg p-0.5">
								<button
									type="button"
									onClick={() => setShowPreview(false)}
									className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
										!showPreview
											? "bg-blue-600 text-white"
											: "text-theme-muted hover:text-theme-text"
									}`}
								>
									Edit
								</button>
								<button
									type="button"
									onClick={() => setShowPreview(true)}
									className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
										showPreview
											? "bg-blue-600 text-white"
											: "text-theme-muted hover:text-theme-text"
									}`}
								>
									Preview
								</button>
							</div>
						</div>
						{showPreview ? (
							<div className="w-full min-h-[200px] md:min-h-[300px] px-4 py-3 bg-theme-card border border-theme-border-input rounded-lg prose prose-invert max-w-none overflow-auto">
								{currentNote.content ? (
									<div
										dangerouslySetInnerHTML={renderMarkdown(
											currentNote.content,
										)}
									/>
								) : (
									<p className="text-theme-muted italic">
										No content to preview
									</p>
								)}
							</div>
						) : (
							<textarea
								value={currentNote.content}
								onChange={(e) => handleInputChange("content", e.target.value)}
								placeholder="## New Features&#10;- Feature 1&#10;- Feature 2&#10;&#10;## Bug Fixes&#10;- Fix 1"
								required
								rows={10}
								className="w-full px-4 py-3 bg-theme-card border border-theme-border-input rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm min-h-[200px] md:min-h-[300px]"
							/>
						)}
					</div>

					{/* Submit Buttons */}
					<div className="flex flex-col-reverse md:flex-row gap-3 pt-4 border-t border-theme-border">
						<button
							type="button"
							onClick={handleCancel}
							disabled={isSubmitting}
							className="w-full md:w-auto px-6 py-3 md:py-2 bg-theme-input hover:bg-theme-border-input disabled:bg-theme-card disabled:cursor-not-allowed rounded-lg font-medium transition-colors text-theme-text"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={isSubmitting}
							className="w-full md:w-auto px-6 py-3 md:py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed rounded-lg font-medium transition-colors text-white"
						>
							{isSubmitting
								? "Saving..."
								: formMode === "create"
									? "Create Release Note"
									: "Update Release Note"}
						</button>
					</div>
				</form>
			</div>
		);
	}

	// ============================================================================
	// RENDER LIST
	// ============================================================================

	return (
		<div className="p-4 md:p-6">
			{/* Header */}
			<div className="mb-4 md:mb-6">
				<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
					<div>
						<h1 className="text-2xl md:text-3xl font-bold mb-1 md:mb-2 text-theme-text">
							Release Notes
						</h1>
						<p className="text-sm md:text-base text-theme-muted">
							Manage release notes for frame-master
						</p>
					</div>
					{/* Desktop Create Button */}
					<button
						type="button"
						onClick={handleCreate}
						className="hidden md:flex px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors items-center gap-2 text-white"
					>
						<span className="text-xl">+</span>
						Create Release Note
					</button>
				</div>
			</div>

			{/* Stats */}
			<div className="grid grid-cols-2 gap-3 mb-4 md:mb-6">
				<div className="bg-theme-card border border-theme-border rounded-lg p-3 md:p-4">
					<div className="text-lg md:text-2xl font-bold text-theme-text">
						{releaseNotes.length}
					</div>
					<div className="text-xs md:text-sm text-theme-muted">
						Total Releases
					</div>
				</div>
				<div className="bg-theme-card border border-theme-border rounded-lg p-3 md:p-4">
					<div className="text-lg md:text-2xl font-bold text-blue-400">
						{releaseNotes[0]?.version ? `v${releaseNotes[0].version}` : "N/A"}
					</div>
					<div className="text-xs md:text-sm text-theme-muted">
						Latest Version
					</div>
				</div>
			</div>

			{/* Error State */}
			{error && (
				<div className="mb-4 md:mb-6 p-3 md:p-4 bg-red-900/20 border border-red-700 rounded-lg text-red-400 text-sm md:text-base">
					{error}
				</div>
			)}

			{/* Loading State */}
			{isLoading ? (
				<div className="text-center py-12">
					<div className="inline-block animate-spin rounded-full h-10 w-10 md:h-12 md:w-12 border-b-2 border-blue-500"></div>
					<p className="mt-4 text-theme-muted">Loading release notes...</p>
				</div>
			) : releaseNotes.length === 0 ? (
				/* Empty State */
				<div className="text-center py-12 bg-theme-card rounded-lg border border-theme-border">
					<span className="text-5xl md:text-6xl mb-4 block">📝</span>
					<h2 className="text-xl md:text-2xl font-bold mb-2 text-theme-text">
						No Release Notes Yet
					</h2>
					<p className="text-sm md:text-base text-theme-muted mb-6">
						Create your first release note to get started
					</p>
					<button
						type="button"
						onClick={handleCreate}
						className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors inline-flex items-center gap-2 text-white"
					>
						<span className="text-xl">+</span>
						Create Release Note
					</button>
				</div>
			) : (
				<>
					{/* Mobile Card View */}
					<div className="md:hidden space-y-3">
						{releaseNotes.map((note) => (
							<ReleaseNoteCard
								key={note.id}
								note={note}
								onEdit={handleEdit}
								onDelete={(id) => setDeleteConfirm(id)}
								formatDate={formatDate}
							/>
						))}
					</div>

					{/* Desktop Table View */}
					<div className="hidden md:block bg-theme-card rounded-lg border border-theme-border overflow-hidden">
						<table className="w-full">
							<thead className="bg-theme-input">
								<tr>
									<th className="px-6 py-4 text-left text-sm font-semibold text-theme-text">
										Version
									</th>
									<th className="px-6 py-4 text-left text-sm font-semibold text-theme-text">
										Title
									</th>
									<th className="px-6 py-4 text-left text-sm font-semibold text-theme-text">
										Release Date
									</th>
									<th className="px-6 py-4 text-left text-sm font-semibold text-theme-text">
										GitHub
									</th>
									<th className="px-6 py-4 text-right text-sm font-semibold text-theme-text">
										Actions
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-theme-border">
								{releaseNotes.map((note) => (
									<tr
										key={note.id}
										className="hover:bg-theme-input/50 transition-colors"
									>
										<td className="px-6 py-4">
											<span className="inline-flex items-center px-3 py-1 rounded-full bg-blue-900/30 text-blue-400 font-mono text-sm">
												v{note.version}
											</span>
										</td>
										<td className="px-6 py-4">
											<div className="font-medium text-theme-text">
												{note.title}
											</div>
										</td>
										<td className="px-6 py-4 text-theme-muted">
											{formatDateLong(note.releasedAt)}
										</td>
										<td className="px-6 py-4">
											<a
												href={note.githubUrl}
												target="_blank"
												rel="noopener noreferrer"
												className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1"
											>
												View Release →
											</a>
										</td>
										<td className="px-6 py-4">
											<div className="flex items-center justify-end gap-2">
												<button
													type="button"
													onClick={() => handleEdit(note)}
													className="px-3 py-1.5 bg-theme-border-input hover:bg-theme-muted rounded text-sm transition-colors"
													title="Edit"
												>
													✏️ Edit
												</button>
												<button
													type="button"
													onClick={() => setDeleteConfirm(note.id)}
													className="px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded text-sm transition-colors"
													title="Delete"
												>
													🗑️ Delete
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

			{/* Mobile FAB */}
			<button
				type="button"
				onClick={handleCreate}
				className="md:hidden fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center z-30"
			>
				<svg
					className="w-6 h-6"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<title>Create New Release</title>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M12 4v16m8-8H4"
					/>
				</svg>
			</button>

			{/* Delete Confirmation Modal */}
			{deleteConfirm && (
				<div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50">
					<div className="bg-theme-card border border-theme-border-input rounded-t-2xl md:rounded-lg p-4 md:p-6 w-full md:max-w-md mx-0 md:mx-4">
						<h2 className="text-lg md:text-xl font-bold mb-3 md:mb-4 text-theme-text">
							Confirm Deletion
						</h2>
						<p className="text-sm md:text-base text-theme-muted mb-4 md:mb-6">
							Are you sure you want to delete this release note? This action
							cannot be undone.
						</p>
						<div className="flex flex-col-reverse md:flex-row gap-3 md:gap-4">
							<button
								type="button"
								onClick={() => setDeleteConfirm(null)}
								disabled={isSubmitting}
								className="w-full md:flex-1 px-4 py-3 md:py-2 bg-theme-input hover:bg-theme-border-input disabled:bg-theme-card disabled:cursor-not-allowed rounded-lg font-medium transition-colors text-theme-text"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={() => handleDelete(deleteConfirm)}
								disabled={isSubmitting}
								className="w-full md:flex-1 px-4 py-3 md:py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:cursor-not-allowed rounded-lg font-medium transition-colors text-white"
							>
								{isSubmitting ? "Deleting..." : "Delete"}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
