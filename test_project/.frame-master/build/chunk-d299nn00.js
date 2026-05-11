// src/math.ts
function buildGreeting(name) {
  return `${name} is rendering a live debug build trace.`;
}
var releaseNotes = [
  "Build list should be easy to scan",
  "Pipeline steps should show loader and byte deltas",
  "Registry inspector should surface plugin activity"
];
console.log("debug-ui-demo pipeline ready");
console.log("debug-ui-demo pipeline ready");

// src/shared-data.ts
var releaseChannel = "debug-atlas";
var inspectorCards = [
  { label: "build-list", severity: "low", count: 3 },
  { label: "pipeline", severity: "medium", count: 8 },
  { label: "registry", severity: "high", count: 5 }
];
console.log("debug-ui-demo pipeline ready");
console.log("debug-ui-demo pipeline ready");

export { buildGreeting, releaseNotes, releaseChannel, inspectorCards };
