export function buildGreeting(name: string) {
	return `${name} is rendering a live debug build trace.`;
}

export const releaseNotes = [
	"Build list should be easy to scan",
	"Pipeline steps should show loader and byte deltas",
	"Registry inspector should surface plugin activity",
];
