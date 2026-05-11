import { buildGreeting, releaseNotes } from "./math";
import { inspectorCards } from "./shared-data";

const banner = buildGreeting("Frame-Master UI sandbox");

console.log(banner);
console.table(
	releaseNotes.map((item, index) => ({
		index,
		item,
	})),
);
console.table(inspectorCards);
