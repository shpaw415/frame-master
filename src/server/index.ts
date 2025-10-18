import config from "./config";
import { masterRequest } from "./request-manager";
import masterRoutes from "./frame-master-routes";
import { logRequest } from "./log";

const { routes, ...rest } = config.HTTPServer;

export default () =>
  Bun.serve({
    development: {
      chromeDevToolsAutomaticWorkspaceFolders: true,
      hmr: true,
    },
    ...(rest as {}),
    fetch: (request) => {
      // Log the incoming request
      logRequest(request);

      const reqManager = new masterRequest({ request });
      return reqManager.handleRequest();
    },
    routes: { ...routes, ...masterRoutes },
  });
