const CSSPaths = {
  "/frame-master-error.css": Bun.file(
    new URL("./fallback/frame-master-error.css", import.meta.url)
  ),
  "/frame-master-not-found.css": Bun.file(
    new URL("./fallback/frame-master-not-found.css", import.meta.url)
  ),
} as const;

export default {
  ...CSSPaths,
};
