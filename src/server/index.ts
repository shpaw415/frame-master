import config from "./config";
import { MasterRequest } from "./request-manager";



export default () => Bun.serve({
    ...(config.HTTPServer as {}),
    fetch: async (request) => {
        const reqManager = new MasterRequest({ request });
        return reqManager.handleRequest();
    },
});

