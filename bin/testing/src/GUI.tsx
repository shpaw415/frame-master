import { useState, useEffect, useRef } from "react";

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

const TestGUI = () => {
  const [history, setHistory] = useState<TestResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<TestResult | null>(null);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLog[]>([]);
  const [pathname, setPathname] = useState("/");
  const [method, setMethod] = useState("GET");
  const [testing, setTesting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [htmlView, setHtmlView] = useState<"text" | "preview">("text");
  const [showHeaders, setShowHeaders] = useState(false);
  const [acceptHeader, setAcceptHeader] = useState("text/html");
  const [customHeaders, setCustomHeaders] = useState<
    Array<{ key: string; value: string }>
  >([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:3001/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log("Connected to test server");
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      switch (msg.type) {
        case "history":
          setHistory(msg.data);
          break;
        case "test_result":
          setHistory((prev) => [...prev, msg.data]);
          setSelectedResult(msg.data);
          setTesting(false);
          break;
        case "console_log":
          setConsoleLogs((prev) => [...prev.slice(-99), msg.data]);
          break;
        case "test_start":
          setTesting(true);
          break;
        case "test_error":
          setTesting(false);
          alert(`Test Error: ${msg.error}`);
          break;
      }
    };

    ws.onclose = () => {
      setConnected(false);
      console.log("Disconnected from test server");
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return () => {
      ws.close();
    };
  }, []);

  const executeTest = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      alert("Not connected to test server");
      return;
    }

    // Build headers object
    const headers: Record<string, string> = {
      Accept: acceptHeader,
    };

    // Add custom headers
    customHeaders.forEach(({ key, value }) => {
      if (key.trim() && value.trim()) {
        headers[key.trim()] = value.trim();
      }
    });

    wsRef.current.send(
      JSON.stringify({
        type: "execute_test",
        pathname,
        method,
        headers,
      })
    );
  };

  const addCustomHeader = () => {
    setCustomHeaders([...customHeaders, { key: "", value: "" }]);
  };

  const updateCustomHeader = (
    index: number,
    field: "key" | "value",
    value: string
  ) => {
    const updated = [...customHeaders];
    if (updated[index]) {
      updated[index][field] = value;
      setCustomHeaders(updated);
    }
  };

  const removeCustomHeader = (index: number) => {
    setCustomHeaders(customHeaders.filter((_, i) => i !== index));
  };

  const clearHistory = () => {
    setHistory([]);
    setSelectedResult(null);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "clear_history" }));
    }
  };

  const clearConsole = () => {
    setConsoleLogs([]);
  };

  return (
    <div className="test-gui-container">
      {/* Header */}
      <div className="test-gui-header">
        <h1 className="test-gui-title">🧪 Frame-Master Test GUI</h1>
        <div className="test-gui-status">
          Status:{" "}
          {connected ? (
            <span className="status-connected">● Connected</span>
          ) : (
            <span className="status-disconnected">● Disconnected</span>
          )}
        </div>
      </div>

      {/* Test Controls */}
      <div className="test-controls">
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="method-select"
        >
          <option>GET</option>
          <option>POST</option>
          <option>PUT</option>
          <option>DELETE</option>
          <option>PATCH</option>
        </select>

        <input
          type="text"
          value={pathname}
          onChange={(e) => setPathname(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && executeTest()}
          placeholder="Enter path (e.g., /)"
          className="path-input"
        />

        <button
          onClick={executeTest}
          disabled={testing || !connected}
          className="btn-primary"
        >
          {testing ? "Testing..." : "Execute Test"}
        </button>

        <button onClick={clearHistory} className="btn-secondary">
          Clear History
        </button>

        <button onClick={clearConsole} className="btn-secondary">
          Clear Console
        </button>

        <button
          onClick={() => setShowHeaders(!showHeaders)}
          className="btn-secondary"
          style={{ marginLeft: "auto" }}
        >
          {showHeaders ? "Hide Headers" : "Configure Headers"}
        </button>
      </div>

      {/* Headers Configuration */}
      {showHeaders && (
        <div className="headers-config">
          <div className="headers-config-section">
            <label className="header-label">
              Accept Header:
              <select
                value={acceptHeader}
                onChange={(e) => setAcceptHeader(e.target.value)}
                className="method-select"
                style={{ marginLeft: "10px" }}
              >
                <option value="text/html">text/html</option>
                <option value="application/json">application/json</option>
                <option value="application/xml">application/xml</option>
                <option value="text/plain">text/plain</option>
                <option value="*/*">*/*</option>
                <option value="custom">Custom...</option>
              </select>
              {acceptHeader === "custom" && (
                <input
                  type="text"
                  placeholder="Enter custom Accept value"
                  onChange={(e) => setAcceptHeader(e.target.value)}
                  className="path-input"
                  style={{ marginLeft: "10px", flex: "1" }}
                />
              )}
            </label>
          </div>

          <div className="headers-config-section">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "10px",
              }}
            >
              <label className="header-label">Custom Headers:</label>
              <button
                onClick={addCustomHeader}
                className="btn-secondary"
                style={{ padding: "4px 12px", fontSize: "12px" }}
              >
                + Add Header
              </button>
            </div>
            {customHeaders.length === 0 ? (
              <div
                style={{ color: "#888", fontSize: "12px", fontStyle: "italic" }}
              >
                No custom headers. Click "Add Header" to add one.
              </div>
            ) : (
              <div className="custom-headers-list">
                {customHeaders.map((header, index) => (
                  <div key={index} className="custom-header-row">
                    <input
                      type="text"
                      placeholder="Header name (e.g., Authorization)"
                      value={header.key}
                      onChange={(e) =>
                        updateCustomHeader(index, "key", e.target.value)
                      }
                      className="path-input"
                      style={{ flex: "1" }}
                    />
                    <input
                      type="text"
                      placeholder="Header value"
                      value={header.value}
                      onChange={(e) =>
                        updateCustomHeader(index, "value", e.target.value)
                      }
                      className="path-input"
                      style={{ flex: "1" }}
                    />
                    <button
                      onClick={() => removeCustomHeader(index)}
                      className="btn-remove"
                      title="Remove header"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="main-content">
        {/* History Sidebar */}
        <div className="history-sidebar">
          <div className="history-header">Test History ({history.length})</div>
          <div>
            {history.length === 0 ? (
              <div className="history-empty">No tests yet</div>
            ) : (
              history.map((result, i) => (
                <div
                  key={i}
                  onClick={() => setSelectedResult(result)}
                  className={`history-item ${
                    selectedResult === result ? "selected" : ""
                  } ${result.response.status < 400 ? "success" : "error"}`}
                >
                  <div className="history-item-title">
                    {result.method} {result.pathname}
                  </div>
                  <div className="history-item-meta">
                    <span
                      className={`status-badge ${
                        result.response.status < 400 ? "success" : "error"
                      }`}
                    >
                      {result.response.status}
                    </span>
                    {result.duration.toFixed(2)}ms
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Results Panel */}
        <div className="results-panel">
          <div className="results-content">
            {!selectedResult ? (
              <div className="results-empty">
                <div className="results-empty-icon">🧪</div>
                <div>Select a test from history or run a new test</div>
              </div>
            ) : (
              <div>
                {/* Response Summary */}
                <div className="section">
                  <h2 className="section-title">Response</h2>
                  <div className="response-summary">
                    <span
                      className={`response-status ${
                        selectedResult.response.status < 400
                          ? "success"
                          : "error"
                      }`}
                    >
                      {selectedResult.response.status}{" "}
                      {selectedResult.response.statusText}
                    </span>
                    <span className="response-duration">
                      ⏱ {selectedResult.duration.toFixed(2)}ms
                    </span>
                    <span className="response-size">
                      📦 {selectedResult.response.bodyLength} bytes
                    </span>
                  </div>
                  {selectedResult.error && (
                    <div className="error-box">
                      <strong>Error:</strong> {selectedResult.error}
                    </div>
                  )}
                </div>

                {/* Headers */}
                <div className="section">
                  <h2 className="section-title">Headers</h2>
                  <div className="code-block">
                    {Object.entries(selectedResult.response.headers).map(
                      ([key, value]) => (
                        <div key={key} className="header-line">
                          <span className="header-key">{key}</span>: {value}
                        </div>
                      )
                    )}
                  </div>
                </div>

                {/* Global Values */}
                <div className="section">
                  <h2 className="section-title">Global Values</h2>
                  <div className="code-block scrollable">
                    <pre>
                      {JSON.stringify(
                        selectedResult.states.after_request.globalValues,
                        null,
                        2
                      )}
                    </pre>
                  </div>
                </div>

                {/* Context */}
                <div className="section">
                  <h2 className="section-title">Context</h2>
                  <div className="code-block scrollable">
                    <pre>
                      {JSON.stringify(
                        selectedResult.states.after_request.context,
                        null,
                        2
                      )}
                    </pre>
                  </div>
                </div>

                {/* Body Preview */}
                <div className="section">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "15px",
                    }}
                  >
                    <h2 className="section-title" style={{ marginBottom: 0 }}>
                      Body Preview
                    </h2>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button
                        onClick={() => setHtmlView("text")}
                        className={
                          htmlView === "text" ? "btn-primary" : "btn-secondary"
                        }
                        style={{ padding: "6px 12px", fontSize: "12px" }}
                      >
                        Text View
                      </button>
                      <button
                        onClick={() => setHtmlView("preview")}
                        className={
                          htmlView === "preview"
                            ? "btn-primary"
                            : "btn-secondary"
                        }
                        style={{ padding: "6px 12px", fontSize: "12px" }}
                      >
                        HTML Preview
                      </button>
                    </div>
                  </div>
                  {htmlView === "text" ? (
                    <div className="code-block large">
                      <pre className="wrapped">
                        {selectedResult.response.bodyPreview}
                      </pre>
                    </div>
                  ) : (
                    <div className="html-preview">
                      <iframe
                        srcDoc={selectedResult.response.bodyPreview}
                        title="HTML Preview"
                        sandbox="allow-same-origin"
                        style={{
                          width: "100%",
                          height: "600px",
                          border: "1px solid #555",
                          borderRadius: "4px",
                          background: "white",
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Console Output */}
          <div className="console-container">
            <div className="console-header">
              Console Output ({consoleLogs.length})
            </div>
            <div className="console-content">
              {consoleLogs.length === 0 ? (
                <div className="console-empty">No console output</div>
              ) : (
                consoleLogs.map((log, i) => (
                  <div
                    key={i}
                    className={`console-log ${log.level.toLowerCase()}`}
                  >
                    [{log.timestamp}] {log.level}: {log.message}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestGUI;
