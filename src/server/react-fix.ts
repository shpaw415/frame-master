import { jsxDEV } from "react/jsx-dev-runtime";

declare global {
  var jsxDEV_7x81h0kn: typeof jsxDEV;
}

export function fixReactJSXDEV() {
  globalThis.jsxDEV_7x81h0kn ??= jsxDEV;
}
