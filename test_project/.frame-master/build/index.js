import {
  buildGreeting,
  inspectorCards,
  releaseNotes
} from "./chunk-d299nn00.js";

// src/index.ts
var banner = buildGreeting("Frame-Master UI sandbox");
console.log(banner);
console.table(releaseNotes.map((item, index) => ({
  index,
  item
})));
console.table(inspectorCards);
console.log("debug-ui-demo pipeline ready");
console.log("debug-ui-demo pipeline ready");
