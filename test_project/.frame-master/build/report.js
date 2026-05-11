import {
  inspectorCards,
  releaseChannel,
  releaseNotes
} from "./chunk-d299nn00.js";

// src/report.ts
var summary = inspectorCards.map((card) => `${card.label}:${card.severity}`).join(", ");
console.log(`Release channel: ${releaseChannel}`);
console.log(summary);
console.log(`Highlights: ${releaseNotes.join(" | ")}`);
console.log("debug-ui-demo pipeline ready");
console.log("debug-ui-demo pipeline ready");
