#!/usr/bin/env bun
import {
  masterRequest,
  type RequestState,
} from "../../src/server/request-manager";
import { getConfig } from "../../src/server/config";
import { InitAll } from "../../src/server/init";
import type { Server } from "bun";
import { Command } from "commander";
import { fileURLToPath, serve } from "bun";
import { runOnStartMainPlugins } from "../../src/server";

export const testCommand = new Command("test");

type TestResult = {
  pathname: string;
  method: string;
  timestamp: Date;
  states: {
    before_request: StateSnapshot;
    request: StateSnapshot;
    after_request: StateSnapshot;
  };
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    bodyPreview: string;
    bodyLength: number;
  };
  duration: number;
  error?: string;
};

type StateSnapshot = {
  context: Record<string, unknown>;
  globalValues: Record<string, unknown>;
  responseSetted: boolean;
};

type ConsoleLog = {
  timestamp: string;
  level: string;
  message: string;
};

class TestServer {
  private history: TestResult[] = [];
  private server: Server<undefined>;
  private guiServer: Server<undefined>;
  private wsClients: Set<any> = new Set();
  private consoleLogs: ConsoleLog[] = [];
  private originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug,
  };

  constructor() {
    // Create dummy server for testing
    this.server = serve({
      fetch: () => new Response(),
      port: 0,
    });

    // Intercept console methods
    this.interceptConsole();

    // Start GUI server
    this.guiServer = this.startGUIServer();
  }

  public cleanup() {
    // Restore original console methods
    console.log = this.originalConsole.log;
    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
    console.info = this.originalConsole.info;
    console.debug = this.originalConsole.debug;

    this.server.stop();
    this.guiServer.stop();
  }

  public async start() {
    if (!getConfig()) await InitAll();
    const config = getConfig();
    if (!config) {
      console.error("Failed to load configuration");
      process.exit(1);
    }

    console.log(`\n🧪 Frame-Master Test Server Started`);
    console.log(`\n📊 GUI available at: http://localhost:3001`);
    console.log(`\nPress Ctrl+C to stop\n`);
  }
  public stop() {
    this.cleanup();
  }

  private interceptConsole() {
    const createInterceptor = (level: string) => {
      return (...args: any[]) => {
        const timestamp = new Date().toLocaleTimeString();
        const message = args
          .map((arg) => {
            if (arg !== null && typeof arg === "object") {
              try {
                return JSON.stringify(arg, null, 2);
              } catch {
                return "[Non-serializable Object]";
              }
            }
            return String(arg);
          })
          .join(" ");

        const logEntry: ConsoleLog = { timestamp, level, message };
        this.consoleLogs.push(logEntry);

        // Keep last 100 logs
        if (this.consoleLogs.length > 100) {
          this.consoleLogs = this.consoleLogs.slice(-100);
        }

        // Broadcast to GUI
        this.broadcastToGUI({ type: "console_log", data: logEntry });

        // Call original console method
        this.originalConsole[
          level.toLowerCase() as keyof typeof this.originalConsole
        ](...args);
      };
    };

    console.log = createInterceptor("LOG");
    console.error = createInterceptor("ERROR");
    console.warn = createInterceptor("WARN");
    console.info = createInterceptor("INFO");
    console.debug = createInterceptor("DEBUG");
  }

  private startGUIServer() {
    const port = 3001;
    return Bun.serve({
      port,
      routes: {
        "/*": async () =>
          new Response(
            await Bun.file(
              fileURLToPath(import.meta.resolve("./src/index.html"))
            ).text(),
            {
              headers: { "Content-Type": "text/html" },
            }
          ),
        "/index.css": async () =>
          new Response(
            await Bun.file(
              fileURLToPath(import.meta.resolve("./src/index.css"))
            ).text(),
            {
              headers: { "Content-Type": "text/css" },
            }
          ),
        "/frontend.js": async () =>
          new Response(
            await Bun.file(
              fileURLToPath(import.meta.resolve("./src/frontend.js"))
            ).text(),
            {
              headers: { "Content-Type": "application/javascript" },
            }
          ),
        "/ws": (req, server) =>
          server.upgrade(req)
            ? new Response("Welcome!", { status: 101 })
            : new Response("Upgrade failed", { status: 500 }),
      },
      websocket: {
        open: (ws) => {
          this.wsClients.add(ws);
          // Send current history on connect
          ws.send(JSON.stringify({ type: "history", data: this.history }));
        },
        message: async (ws, message) => {
          try {
            const msg = JSON.parse(message as string);

            switch (msg.type) {
              case "execute_test":
                await this.executeTest(msg.pathname, msg.method, msg.headers);
                break;
              case "clear_history":
                this.history = [];
                this.broadcastToGUI({ type: "history", data: [] });
                break;
            }
          } catch (error) {
            console.error("WebSocket message error:", error);
          }
        },
        close: (ws) => {
          this.wsClients.delete(ws);
        },
      },
    });
  }

  private async executeTest(
    pathname: string,
    method: string,
    customHeaders?: Record<string, string>
  ) {
    if (!pathname.startsWith("/")) {
      pathname = "/" + pathname;
    }

    this.broadcastToGUI({ type: "test_start" });

    const startTime = performance.now();
    const config = getConfig()!;
    const baseUrl = `http://localhost:${config.HTTPServer.port}`;

    try {
      const requestHeaders: Record<string, string> = {
        "User-Agent": "Frame-Master-Tester/1.0",
        ...customHeaders,
      };

      const request = new Request(new URL(pathname, baseUrl).toString(), {
        method,
        headers: requestHeaders,
      });

      const master = new masterRequest({ request, server: this.server });

      // Capture states
      const stateSnapshots: TestResult["states"] = {
        before_request: this.captureState(master),
        request: this.captureState(master),
        after_request: this.captureState(master),
      };

      let response: Response;
      let errorOccurred = false;
      let errorMessage = "";
      let bodyText = "";

      try {
        response = await master.handleRequest();
        bodyText = await response.text();
      } catch (error) {
        errorOccurred = true;
        errorMessage = error instanceof Error ? error.message : String(error);
        bodyText = JSON.stringify({ error: errorMessage }, null, 2);
        response = new Response(bodyText, {
          status: 500,
          statusText: "Internal Server Error",
          headers: { "Content-Type": "application/json" },
        });
      }

      stateSnapshots.after_request = this.captureState(master);

      const duration = performance.now() - startTime;
      const bodyPreview =
        bodyText.length > 2000 ? bodyText.slice(0, 2000) + "..." : bodyText;

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      const result: TestResult = {
        pathname,
        method,
        timestamp: new Date(),
        states: stateSnapshots,
        response: {
          status: response.status,
          statusText: response.statusText,
          headers,
          bodyPreview,
          bodyLength: bodyText.length,
        },
        duration,
        error: errorOccurred ? errorMessage : undefined,
      };

      this.history.push(result);
      this.broadcastToGUI({ type: "test_result", data: result });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.broadcastToGUI({ type: "test_error", error: errorMsg });
    }
  }

  private captureState(master: masterRequest): StateSnapshot {
    return {
      context: { ...master.getContext() },
      globalValues: { ...master.globalDataInjection.rawData },
      responseSetted: master.isResponseSetted(),
    };
  }

  private broadcastToGUI(message: any) {
    const data = JSON.stringify(message);
    this.wsClients.forEach((ws) => ws.send(data));
  }
}

testCommand
  .command("start")
  .description("Start the test server with web GUI")
  .action(async () => {
    if (!getConfig()) await InitAll();
    await runOnStartMainPlugins();
    const server = new TestServer();
    await server.start();

    // Keep process alive
    process.on("SIGINT", () => {
      console.log("\n\nShutting down test server...");
      server.stop();
      process.exit(0);
    });
  });
