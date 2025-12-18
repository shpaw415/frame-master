import type { FrameMasterConfig } from "frame-master/server/types";

export default {
  HTTPServer: {
    port: 3001,
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
            console.log("Deploying to CloudFlare Pages...");
          }),
    },
  ],
} satisfies FrameMasterConfig;
