// src/math.ts
var __debugPipeline = "preview";
function buildGreeting(name) {
  return `${name} is rendering a live debug build trace.`;
}
console.log(__debugPipeline);

// src/shared-data.ts
var __debugPipeline2 = "preview";
var inspectorCards = [
  { label: "build-list", severity: "low", count: 3 },
  { label: "pipeline", severity: "medium", count: 8 },
  { label: "registry", severity: "high", count: 5 }
];
console.log(__debugPipeline2);

// src/admin.ts
var __debugPipeline3 = "preview";
var adminBanner = buildGreeting("Admin entrypoint");
var failingCards = inspectorCards.filter((card) => card.severity !== "low");
console.log(adminBanner);
console.log(`Admin dashboard is tracking ${failingCards.length} active alerts.`);
console.log(__debugPipeline3);
