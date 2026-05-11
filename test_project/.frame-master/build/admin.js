import {
  buildGreeting,
  inspectorCards
} from "./chunk-d299nn00.js";

// src/admin.ts
var adminBanner = buildGreeting("Admin entrypoint");
var failingCards = inspectorCards.filter((card) => card.severity !== "low");
console.log(adminBanner);
console.log(`Admin dashboard is tracking ${failingCards.length} active alerts.`);
console.log("debug-ui-demo pipeline ready");
console.log("debug-ui-demo pipeline ready");
