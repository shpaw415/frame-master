import { jsxDEV } from "react/jsx-dev-runtime";

declare global {
  var jsxDEV_7x81h0kn: typeof jsxDEV;
  var jsxs_eh6c78nj: typeof jsxDEV;
}

export function fixReactJSXDEV() {
  globalThis.jsxDEV_7x81h0kn ??= jsxDEV;
  globalThis.jsxs_eh6c78nj ??= jsxDEV;
}
