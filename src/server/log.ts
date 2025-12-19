import chalk from "chalk";

/**
 * Logs incoming requests with decorative formatting
 */
export function logRequest(request: Request) {
  const url = new URL(request.url);
  const method = request.method;
  const pathname = url.pathname;

  // Method color coding
  const getMethodColor = (method: string) => {
    switch (method) {
      case "GET":
        return chalk.green;
      case "POST":
        return chalk.blue;
      case "PUT":
        return chalk.yellow;
      case "DELETE":
        return chalk.red;
      case "PATCH":
        return chalk.magenta;
      default:
        return chalk.gray;
    }
  };

  const methodColored = getMethodColor(method)(method.padEnd(6));
  const pathColored = chalk.cyan(pathname);
  const arrow = chalk.white("→");

  console.log(`${methodColored} ${arrow} ${pathColored}`);
}
