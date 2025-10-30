#!/usr/bin/env bun
import Blessed from "blessed";
import {
  masterRequest,
  type RequestState,
} from "../../src/server/request-manager";
import { getConfig } from "../../src/server/config";
import { InitAll } from "../../src/server/init";
import type { Server } from "bun";
import { Command } from "commander";

export const testCommand = new Command("plugin");

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
};

type StateSnapshot = {
  context: Record<string, unknown>;
  globalValues: Record<string, unknown>;
  responseSetted: boolean;
};

class FrameMasterTester {
  private screen: Blessed.Widgets.Screen;
  private history: TestResult[] = [];
  private server: Server<undefined>;
  private wsClients: Set<any> = new Set();
  private guiServer?: Server<undefined>;

  // UI Components
  private pathInput!: Blessed.Widgets.TextboxElement;
  private methodSelect!: Blessed.Widgets.ListElement;
  private resultBox!: Blessed.Widgets.BoxElement;
  private historyList!: Blessed.Widgets.ListElement;
  private statusBar!: Blessed.Widgets.BoxElement;
  private globalValuesBox!: Blessed.Widgets.BoxElement;
  private contextBox!: Blessed.Widgets.BoxElement;
  private currentFocusIndex = 0;
  private focusableElements: Blessed.Widgets.BlessedElement[] = [];

  constructor() {
    this.screen = Blessed.screen({
      smartCSR: true,
      title: "Frame-Master Interactive Tester",
    });

    // Create dummy server for testing
    this.server = Bun.serve({
      port: 0,
      fetch: () => new Response(),
    });

    this.setupUI();
    this.setupKeyBindings();
  }

  private setupUI() {
    // Header
    const header = Blessed.box({
      top: 0,
      left: 0,
      width: "100%",
      height: 3,
      content:
        "{center}{bold}🧪 Frame-Master Interactive Tester{/bold}{/center}",
      tags: true,
      style: {
        fg: "white",
        bg: "blue",
        bold: true,
      },
    });

    // Path Input
    this.pathInput = Blessed.textbox({
      top: 3,
      left: 0,
      width: "60%",
      height: 3,
      label: " Path ",
      border: { type: "line" },
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "cyan" },
        focus: { border: { fg: "green" } },
      },
      keys: true,
      mouse: true,
      inputOnFocus: true,
    });

    // Method Selector
    this.methodSelect = Blessed.list({
      top: 3,
      left: "60%",
      width: "40%",
      height: 3,
      label: " Method ",
      border: { type: "line" },
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "cyan" },
        selected: { bg: "blue" },
      },
      items: ["GET", "POST", "PUT", "DELETE", "PATCH"],
      mouse: true,
      keys: true,
      vi: true,
    });

    // History List
    this.historyList = Blessed.list({
      top: 6,
      left: 0,
      width: "30%",
      height: "60%-6",
      label: " History ",
      border: { type: "line" },
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "yellow" },
        selected: { bg: "blue" },
      },
      mouse: true,
      keys: true,
      vi: true,
      scrollbar: {
        ch: "█",
        style: { bg: "yellow" },
      },
    });

    // Result Box
    this.resultBox = Blessed.box({
      top: 6,
      left: "30%",
      width: "70%",
      height: "30%",
      label: " Response ",
      border: { type: "line" },
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "magenta" },
      },
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: true,
      vi: true,
      scrollbar: {
        ch: "█",
        style: { bg: "magenta" },
      },
    });

    // Global Values Box
    this.globalValuesBox = Blessed.box({
      top: "36%",
      left: "30%",
      width: "35%",
      height: "30%-6",
      label: " Global Values ",
      border: { type: "line" },
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "green" },
      },
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: true,
      vi: true,
      scrollbar: {
        ch: "█",
        style: { bg: "green" },
      },
    });

    // Context Box
    this.contextBox = Blessed.box({
      top: "36%",
      left: "65%",
      width: "35%",
      height: "30%-6",
      label: " Context ",
      border: { type: "line" },
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "cyan" },
      },
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: true,
      vi: true,
      scrollbar: {
        ch: "█",
        style: { bg: "cyan" },
      },
    });

    // Status Bar
    this.statusBar = Blessed.box({
      bottom: 0,
      left: 0,
      width: "100%",
      height: 3,
      content:
        " {cyan-fg}F1{/cyan-fg}: Help | {green-fg}Enter{/green-fg}: Test | {yellow-fg}Tab{/yellow-fg}: Focus | {red-fg}Esc/Q{/red-fg}: Quit | {magenta-fg}G{/magenta-fg}: Start GUI",
      tags: true,
      style: {
        fg: "white",
        bg: "black",
      },
    });

    // Append all to screen
    this.screen.append(header);
    this.screen.append(this.pathInput);
    this.screen.append(this.methodSelect);
    this.screen.append(this.historyList);
    this.screen.append(this.resultBox);
    this.screen.append(this.globalValuesBox);
    this.screen.append(this.contextBox);
    this.screen.append(this.statusBar);

    // Set initial focus
    this.focusableElements = [
      this.pathInput,
      this.methodSelect,
      this.historyList,
      this.resultBox,
      this.globalValuesBox,
      this.contextBox,
    ];
    this.pathInput.focus();
  }

  private setupKeyBindings() {
    // Quit
    this.screen.key(["escape", "q", "C-c"], () => {
      this.cleanup();
      return process.exit(0);
    });

    // Tab navigation
    this.screen.key(["tab"], () => {
      this.currentFocusIndex =
        (this.currentFocusIndex + 1) % this.focusableElements.length;
      this.focusableElements[this.currentFocusIndex]?.focus();
      this.screen.render();
    });

    // Test request on Enter
    this.pathInput.on("submit", async (value) => {
      await this.executeTest(value || "/");
    });

    this.screen.key(["enter"], async () => {
      const path = this.pathInput.getValue();
      await this.executeTest(path || "/");
    });

    // History selection
    this.historyList.on("select", (item, index) => {
      this.displayHistoryResult(index);
    });

    // Help
    this.screen.key(["f1"], () => {
      this.showHelp();
    });

    // Start GUI
    this.screen.key(["g"], async () => {
      await this.startGUI();
    });

    // Clear history
    this.screen.key(["c"], () => {
      this.history = [];
      this.historyList.setItems([]);
      this.resultBox.setContent("");
      this.globalValuesBox.setContent("");
      this.contextBox.setContent("");
      this.screen.render();
    });
  }

  private async executeTest(pathname: string) {
    if (!pathname.startsWith("/")) {
      pathname = "/" + pathname;
    }

    const method =
      (this.methodSelect as any).ritems?.[
        (this.methodSelect as any).selected || 0
      ]?.content || "GET";
    this.statusBar.setContent(
      ` Testing {cyan-fg}${method} ${pathname}{/cyan-fg}...`
    );
    this.screen.render();

    const startTime = performance.now();
    const config = getConfig()!;
    const baseUrl = `http://localhost:${config.HTTPServer.port}`;

    try {
      const request = new Request(new URL(pathname, baseUrl).toString(), {
        method,
        headers: {
          Accept: "text/html",
          "User-Agent": "Frame-Master-Tester/1.0",
        },
      });

      const master = new masterRequest({ request, server: this.server });

      // Capture states
      const stateSnapshots: TestResult["states"] = {
        before_request: this.captureState(master),
        request: this.captureState(master),
        after_request: this.captureState(master),
      };

      const response = await master.handleRequest();
      stateSnapshots.after_request = this.captureState(master);

      const duration = performance.now() - startTime;
      const bodyText = await response.text();
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
      };

      this.history.push(result);
      this.updateHistoryList();
      this.displayResult(result);

      // Broadcast to GUI clients
      this.broadcastToGUI({ type: "test_result", data: result });

      this.statusBar.setContent(
        ` {green-fg}✓{/green-fg} Test completed in {yellow-fg}${duration.toFixed(
          2
        )}ms{/yellow-fg} | F1: Help | Enter: Test | Tab: Focus | Esc/Q: Quit | G: Start GUI`
      );
    } catch (error) {
      this.statusBar.setContent(
        ` {red-fg}✗ Error:{/red-fg} ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    this.screen.render();
  }

  private captureState(master: masterRequest): StateSnapshot {
    return {
      context: { ...master.getContext() },
      globalValues: { ...master.globalDataInjection.rawData },
      responseSetted: master.isResponseSetted(),
    };
  }

  private displayResult(result: TestResult) {
    const statusColor =
      result.response.status < 400 ? "{green-fg}" : "{red-fg}";

    this.resultBox.setContent(
      `${statusColor}${result.response.status} ${result.response.statusText}{/}\n` +
        `Duration: {yellow-fg}${result.duration.toFixed(2)}ms{/yellow-fg}\n` +
        `Body Length: {cyan-fg}${result.response.bodyLength} bytes{/cyan-fg}\n\n` +
        `{bold}Headers:{/bold}\n` +
        Object.entries(result.response.headers)
          .map(([k, v]) => `  {gray-fg}${k}:{/gray-fg} ${v}`)
          .join("\n") +
        `\n\n{bold}Body Preview:{/bold}\n${result.response.bodyPreview}`
    );

    this.displayGlobalValues(result.states.after_request.globalValues);
    this.displayContext(result.states.after_request.context);
  }

  private displayGlobalValues(globalValues: Record<string, unknown>) {
    if (Object.keys(globalValues).length === 0) {
      this.globalValuesBox.setContent("{gray-fg}(none){/gray-fg}");
    } else {
      this.globalValuesBox.setContent(
        Object.entries(globalValues)
          .map(([key, value]) => {
            const valueStr = JSON.stringify(value, null, 2);
            return `{yellow-fg}${key}:{/yellow-fg}\n${valueStr}`;
          })
          .join("\n\n")
      );
    }
  }

  private displayContext(context: Record<string, unknown>) {
    if (Object.keys(context).length === 0) {
      this.contextBox.setContent("{gray-fg}(empty){/gray-fg}");
    } else {
      this.contextBox.setContent(JSON.stringify(context, null, 2));
    }
  }

  private updateHistoryList() {
    const items = this.history.map((r, i) => {
      const statusIcon = r.response.status < 400 ? "✓" : "✗";
      return `[${i}] ${statusIcon} ${r.method} ${r.pathname} (${r.response.status})`;
    });
    this.historyList.setItems(items);
  }

  private displayHistoryResult(index: number) {
    const result = this.history[index];
    if (result) {
      this.displayResult(result);
      this.screen.render();
    }
  }

  private showHelp() {
    const helpBox = Blessed.box({
      top: "center",
      left: "center",
      width: "80%",
      height: "80%",
      label: " Help ",
      content:
        "{center}{bold}Frame-Master Interactive Tester{/bold}{/center}\n\n" +
        "{bold}Keyboard Shortcuts:{/bold}\n" +
        "  {cyan-fg}Tab{/cyan-fg}           - Cycle through UI components\n" +
        "  {green-fg}Enter{/green-fg}         - Execute test for current path\n" +
        "  {yellow-fg}↑/↓{/yellow-fg}          - Navigate lists\n" +
        "  {magenta-fg}G{/magenta-fg}            - Start browser GUI (port 3001)\n" +
        "  {cyan-fg}C{/cyan-fg}            - Clear history (when history focused)\n" +
        "  {cyan-fg}F1{/cyan-fg}           - Show this help\n" +
        "  {red-fg}Esc / Q{/red-fg}       - Quit\n\n" +
        "{bold}Features:{/bold}\n" +
        "  • Test any route with GET/POST/PUT/DELETE/PATCH\n" +
        "  • View request state at each lifecycle phase\n" +
        "  • Inspect global values and context\n" +
        "  • Browse test history\n" +
        "  • Real-time browser GUI with WebSocket updates\n\n" +
        "{center}Press any key to close{/center}",
      tags: true,
      border: { type: "line" },
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "green" },
      },
    });

    helpBox.key(["escape", "enter", "space"], () => {
      this.screen.remove(helpBox);
      this.screen.render();
    });

    this.screen.append(helpBox);
    helpBox.focus();
    this.screen.render();
  }

  private async startGUI() {
    if (this.guiServer) {
      this.statusBar.setContent(
        " {yellow-fg}GUI already running at http://localhost:3001{/yellow-fg}"
      );
      this.screen.render();
      return;
    }

    const port = 3001;

    this.guiServer = Bun.serve({
      port,
      fetch: (req, server) => {
        const url = new URL(req.url);

        if (url.pathname === "/ws") {
          if (server.upgrade(req)) {
            return;
          }
          return new Response("Upgrade failed", { status: 500 });
        }

        if (url.pathname === "/") {
          return new Response(this.getGUIHTML(), {
            headers: { "Content-Type": "text/html" },
          });
        }

        return new Response("Not Found", { status: 404 });
      },
      websocket: {
        open: (ws) => {
          this.wsClients.add(ws);
          // Send history on connect
          ws.send(JSON.stringify({ type: "history", data: this.history }));
        },
        message: (ws, message) => {
          // Handle messages from GUI if needed
        },
        close: (ws) => {
          this.wsClients.delete(ws);
        },
      },
    });

    this.statusBar.setContent(
      ` {green-fg}✓ GUI started at http://localhost:${port}{/green-fg} | Open in browser!`
    );
    this.screen.render();
  }

  private broadcastToGUI(message: any) {
    const data = JSON.stringify(message);
    this.wsClients.forEach((ws) => ws.send(data));
  }

  private getGUIHTML(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <title>Frame-Master Testing GUI</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #1e1e1e; color: #d4d4d4; }
    .container { display: grid; grid-template-columns: 300px 1fr; grid-template-rows: 60px 1fr; height: 100vh; gap: 1px; background: #333; }
    .header { grid-column: 1 / -1; background: #2d2d2d; padding: 20px; border-bottom: 2px solid #007acc; }
    .header h1 { color: #007acc; font-size: 24px; }
    .sidebar { background: #252526; padding: 20px; overflow-y: auto; }
    .main { background: #1e1e1e; padding: 20px; overflow-y: auto; }
    .history-item { padding: 10px; margin-bottom: 10px; background: #2d2d2d; border-left: 3px solid #007acc; cursor: pointer; border-radius: 4px; }
    .history-item:hover { background: #3e3e3e; }
    .history-item.success { border-left-color: #4ec9b0; }
    .history-item.error { border-left-color: #f48771; }
    .result-section { margin-bottom: 30px; }
    .result-section h2 { color: #4ec9b0; margin-bottom: 15px; font-size: 18px; }
    .code-block { background: #2d2d2d; padding: 15px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 13px; overflow-x: auto; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
    .badge.success { background: #4ec9b0; color: #1e1e1e; }
    .badge.error { background: #f48771; color: #1e1e1e; }
    .status-line { margin: 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🧪 Frame-Master Testing GUI</h1>
      <p style="color: #888; margin-top: 5px;">Real-time test results</p>
    </div>
    <div class="sidebar">
      <h2 style="color: #d4d4d4; margin-bottom: 15px;">Test History</h2>
      <div id="history"></div>
    </div>
    <div class="main" id="results">
      <p style="color: #888;">Select a test from history or run a test from the TUI to see results...</p>
    </div>
  </div>
  <script>
    const ws = new WebSocket('ws://localhost:3001/ws');
    const historyEl = document.getElementById('history');
    const resultsEl = document.getElementById('results');
    let history = [];

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'history') {
        history = msg.data;
        renderHistory();
      } else if (msg.type === 'test_result') {
        history.push(msg.data);
        renderHistory();
        displayResult(msg.data);
      }
    };

    function renderHistory() {
      historyEl.innerHTML = history.map((r, i) => \`
        <div class="history-item \${r.response.status < 400 ? 'success' : 'error'}" onclick="displayResult(history[\${i}])">
          <div><strong>\${r.method} \${r.pathname}</strong></div>
          <div style="color: #888; font-size: 12px; margin-top: 5px;">
            <span class="badge \${r.response.status < 400 ? 'success' : 'error'}">\${r.response.status}</span>
            <span style="margin-left: 10px;">\${r.duration.toFixed(2)}ms</span>
          </div>
        </div>
      \`).join('');
    }

    function displayResult(result) {
      resultsEl.innerHTML = \`
        <div class="result-section">
          <h2>Response</h2>
          <div class="status-line">
            <span class="badge \${result.response.status < 400 ? 'success' : 'error'}">\${result.response.status} \${result.response.statusText}</span>
            <span style="margin-left: 20px; color: #ce9178;">⏱ \${result.duration.toFixed(2)}ms</span>
            <span style="margin-left: 20px; color: #4ec9b0;">📦 \${result.response.bodyLength} bytes</span>
          </div>
        </div>

        <div class="result-section">
          <h2>Headers</h2>
          <div class="code-block">\${Object.entries(result.response.headers).map(([k,v]) => \`<div><span style="color: #9cdcfe;">\${k}</span>: \${v}</div>\`).join('')}</div>
        </div>

        <div class="result-section">
          <h2>Global Values</h2>
          <div class="code-block"><pre>\${JSON.stringify(result.states.after_request.globalValues, null, 2)}</pre></div>
        </div>

        <div class="result-section">
          <h2>Context</h2>
          <div class="code-block"><pre>\${JSON.stringify(result.states.after_request.context, null, 2)}</pre></div>
        </div>

        <div class="result-section">
          <h2>Body Preview</h2>
          <div class="code-block"><pre>\${result.response.bodyPreview}</pre></div>
        </div>
      \`;
    }
  </script>
</body>
</html>`;
  }

  private cleanup() {
    this.server.stop();
    if (this.guiServer) {
      this.guiServer.stop();
    }
  }

  async start() {
    await InitAll();
    const config = getConfig();

    if (!config) {
      console.error("Failed to load configuration");
      process.exit(1);
    }

    this.screen.render();
  }
}

testCommand
  .command("test")
  .description("Start the interactive tester")
  .action(async () => {
    // Start the tester
    const tester = new FrameMasterTester();
    await tester.start();
  });
