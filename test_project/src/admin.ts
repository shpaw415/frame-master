import { buildGreeting } from "./math";
import { inspectorCards } from "./shared-data";

const adminBanner = buildGreeting("Admin entrypoint");
const failingCards = inspectorCards.filter((card) => card.severity !== "low");

console.log(adminBanner);
console.log(
	`Admin dashboard is tracking ${failingCards.length} active alerts.`,
);
