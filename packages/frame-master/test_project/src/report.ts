import { releaseNotes } from "./math";
import { inspectorCards, releaseChannel } from "./shared-data";

const summary = inspectorCards
	.map((card) => `${card.label}:${card.severity}`)
	.join(", ");

console.log(`Release channel: ${releaseChannel}`);
console.log(summary);
console.log(`Highlights: ${releaseNotes.join(" | ")}`);
