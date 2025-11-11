import type { FrameMasterConfig } from "frame-master/server/types";

export default {
  HTTPServer: {
    port: 3000,
  },
  plugins: [
    {
      name: "extend-cli",
      version: "1.0.0",
      cli: (prog) =>
        prog
          .command("deploy")
          .description("Deploy to cloudFlare Pages")
          .action(() => {
            console.log("Dwploying to CloudFlare Pages...");
          }),
    },
  ],
} satisfies FrameMasterConfig;
