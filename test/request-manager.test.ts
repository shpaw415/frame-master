import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { masterRequest } from "../src/server/request-manager";
import { webToken } from "@shpaw415/webtoken";
import { setMockConfig } from "../src/server/config";
import serve from "../src/server";

let master: masterRequest;
let server: Bun.Server<undefined>;
process.env.WEB_TOKEN_SECRET = webToken.generateSecureSecret();

// Track execution order and state for tests
let executionOrder: string[] = [];
let beforeRequestCalled = false;
let contextTest = { testKey: "", requestKey: "" };
let counterValue = 0;

beforeAll(async () => {
  setMockConfig({
    HTTPServer: {
      port: 3005,
    },
    plugins: [
      // Lifecycle test plugins
      {
        name: "before-test",
        version: "1.0.0",
        priority: 100,
        router: {
          before_request(req) {
            beforeRequestCalled = true;
            if (req.request.url.includes("/before-test")) {
              expect(req.currentState).toBe("before_request");
            }
          },
        },
      },
      {
        name: "order-test",
        version: "1.0.0",
        priority: 99,
        router: {
          before_request(req) {
            if (req.request.url.includes("/order-test")) {
              executionOrder.push("before_request");
            }
          },
          request(req) {
            if (req.request.url.includes("/order-test")) {
              executionOrder.push("request");
            }
          },
        },
      },
      {
        name: "after-test",
        version: "1.0.0",
        priority: 98,
        router: {
          before_request(req) {
            if (req.request.url.includes("/after-test")) {
              executionOrder.push("before");
            }
          },
          request(req) {
            if (req.request.url.includes("/after-test")) {
              executionOrder.push("request");
            }
          },
          after_request(req) {
            if (req.request.url.includes("/after-test")) {
              executionOrder.push("after");
              expect(req.currentState).toBe("after_request");
            }
          },
        },
      },
      {
        name: "early-response",
        version: "1.0.0",
        priority: 97,
        router: {
          before_request(req) {
            if (req.request.url.includes("/early-response")) {
              req.setResponse("Early response", { status: 403 });
            }
          },
          request(req) {
            if (req.request.url.includes("/early-response")) {
              req.setResponse("Should not appear", { status: 200 });
            }
          },
        },
      },
      {
        name: "context-test",
        version: "1.0.0",
        priority: 96,
        router: {
          before_request(req) {
            if (req.request.url.includes("/context-test")) {
              req.setContext({ testKey: "testValue" } as any);
            }
          },
          request(req) {
            if (req.request.url.includes("/context-test")) {
              const context = req.getContext() as any;
              contextTest.testKey = context.testKey;
              req.setContext({ requestKey: "requestValue" } as any);
            }
          },
          after_request(req) {
            if (req.request.url.includes("/context-test")) {
              const context = req.getContext() as any;
              contextTest.requestKey = context.requestKey;
            }
          },
        },
      },
      {
        name: "global-test",
        version: "1.0.0",
        priority: 95,
        router: {
          before_request(req) {
            if (req.request.url.includes("/global-test")) {
              req.globalDataInjection.rawData.counter = 1;
            }
          },
          request(req) {
            if (req.request.url.includes("/global-test")) {
              const counter = req.globalDataInjection.rawData.counter as number;
              req.globalDataInjection.rawData.counter = counter + 1;
            }
          },
          after_request(req) {
            if (req.request.url.includes("/global-test")) {
              counterValue = req.globalDataInjection.rawData.counter as number;
            }
          },
        },
      },
      {
        name: "response-check",
        version: "1.0.0",
        priority: 94,
        router: {
          before_request(req) {
            if (req.request.url.includes("/response-check")) {
              expect(req.isResponseSetted()).toBe(false);
            }
          },
          request(req) {
            if (req.request.url.includes("/response-check")) {
              req.setResponse("Test", { status: 200 });
              expect(req.isResponseSetted()).toBe(true);
            }
          },
          after_request(req) {
            if (req.request.url.includes("/response-check")) {
              expect(req.isResponseSetted()).toBe(true);
            }
          },
        },
      },
      {
        name: "error-test",
        version: "1.0.0",
        priority: 93,
        router: {
          request(req) {
            if (req.request.url.includes("/error-test")) {
              throw new Error("Test error");
            }
          },
        },
      },
      {
        name: "plugin-low-priority",
        version: "1.0.0",
        priority: 1,
        router: {
          request(req) {
            if (req.request.url.includes("/priority-test")) {
              executionOrder.push("low");
            }
          },
        },
      },
      {
        name: "plugin-high-priority",
        version: "1.0.0",
        priority: 10,
        router: {
          request(req) {
            if (req.request.url.includes("/priority-test")) {
              executionOrder.push("high");
            }
          },
        },
      },
      {
        name: "plugin-medium-priority",
        version: "1.0.0",
        priority: 5,
        router: {
          request(req) {
            if (req.request.url.includes("/priority-test")) {
              executionOrder.push("medium");
            }
          },
        },
      },
      {
        name: "header-test",
        version: "1.0.0",
        priority: 92,
        router: {
          request(req) {
            if (req.request.url.includes("/header-test")) {
              req.setResponse("header-test", {
                status: 200,
                headers: {
                  "X-Custom-Header": "custom-value",
                  "Content-Type": "application/json",
                },
              });
            }
          },
        },
      },
      {
        name: "default-response-plugin",
        version: "1.0.0",
        priority: undefined,
        router: {
          request(req) {
            if (!req.isResponseSetted())
              req.setResponse("Default Response", { status: 200 });
          },
        },
      },
    ],
  });
  server = await serve();
});

beforeEach(() => {
  master = new masterRequest({
    request: new Request("http://localhost/login", { method: "POST" }),
    server,
  });
  // Reset test state
  executionOrder = [];
  beforeRequestCalled = false;
  contextTest = { testKey: "", requestKey: "" };
  counterValue = 0;
});

afterAll(() => server?.stop(true));

test("set cookie to response", async () => {
  master.currentState = "request";
  master.setCookie(
    "sessionId",
    { data: "test" },
    { httpOnly: true, maxAge: 3600, encrypted: true }
  );
  const res = await master.handleRequest();
  expect(res.headers.get("Set-Cookie")).toBeString();
});

test("lifecycle: should execute before_request state", async () => {
  const testMaster = new masterRequest({
    request: new Request("http://localhost/before-test"),
    server,
  });

  await testMaster.handleRequest();
  expect(beforeRequestCalled).toBe(true);
});

test("lifecycle: should execute request state after before_request", async () => {
  const testMaster = new masterRequest({
    request: new Request("http://localhost/order-test"),
    server,
  });

  await testMaster.handleRequest();
  expect(executionOrder).toEqual(["before_request", "request"]);
});

test("lifecycle: should execute after_request state last", async () => {
  const testMaster = new masterRequest({
    request: new Request("http://localhost/after-test"),
    server,
  });

  await testMaster.handleRequest();
  expect(executionOrder).toEqual(["before", "request", "after"]);
});

test("lifecycle: should not allow setting response in before_request", async () => {
  const testMaster = new masterRequest({
    request: new Request("http://localhost/early-response"),
    server,
  });

  const res = await testMaster.handleRequest();
  expect(res.status).toBe(500);
  expect(await res.text()).toContain(
    "This action is only available in the following states: request. Current state: before_request. You can only set the response in the request state."
  );
});

test("lifecycle: should maintain context across states", async () => {
  const testMaster = new masterRequest({
    request: new Request("http://localhost/context-test"),
    server,
  });

  await testMaster.handleRequest();
  expect(contextTest.testKey).toBe("testValue");
  expect(contextTest.requestKey).toBe("requestValue");
});

test("lifecycle: should maintain globalValues across states", async () => {
  const testMaster = new masterRequest({
    request: new Request("http://localhost/global-test"),
    server,
  });

  await testMaster.handleRequest();
  expect(counterValue).toBe(2);
});

test("lifecycle: should check if response is set", async () => {
  const testMaster = new masterRequest({
    request: new Request("http://localhost/response-check"),
    server,
  });

  await testMaster.handleRequest();
});

test("lifecycle: should handle errors gracefully", async () => {
  const testMaster = new masterRequest({
    request: new Request("http://localhost/error-test"),
    server,
  });

  const res = await testMaster.handleRequest();
  expect(res.status).toBe(500);
});

test("lifecycle: should respect plugin priority order", async () => {
  const testMaster = new masterRequest({
    request: new Request("http://localhost/priority-test"),
    server,
  });

  await testMaster.handleRequest();
  expect(executionOrder).toEqual(["low", "medium", "high"]);
});

test("cookies: should get cookie value", async () => {
  const testMaster = new masterRequest({
    request: new Request("http://localhost/test", {
      headers: {
        Cookie: `sessionId=${JSON.stringify("abc123")}; userId=${JSON.stringify(
          "456"
        )}`,
      },
    }),
    server,
  });

  const sessionCookie = testMaster.getCookie<{ sessionId?: string }>(
    "sessionId",
    false
  );
  const userCookie = testMaster.getCookie<{ userId?: string }>("userId");
  const nonexistent = testMaster.getCookie("nonexistent");

  expect(sessionCookie).toBeDefined();
  expect(userCookie).toBeDefined();
  expect(nonexistent).toBeUndefined();
});

test("cookies: should handle encrypted cookies", async () => {
  master.currentState = "request";
  const data = { userId: 123, name: "test" };

  master.setCookie("encrypted", data, { encrypted: true, httpOnly: true });
  const res = await master.handleRequest();

  const setCookieHeader = res.headers.get("Set-Cookie");
  expect(setCookieHeader).toBeString();
  expect(setCookieHeader).toContain("encrypted=");
  expect(setCookieHeader).toContain("HttpOnly");
});

test("response: should set custom headers", async () => {
  const testMaster = new masterRequest({
    request: new Request("http://localhost/header-test"),
    server,
  });

  const res = await testMaster.handleRequest();

  expect((await res.text()).trim()).toBe("header-test");
  expect(res.headers.get("X-Custom-Header")).toBe("custom-value");
  expect(res.headers.get("Content-Type")).toBe("application/json");
});

test("request: should access request method and URL", async () => {
  const testMaster = new masterRequest({
    request: new Request("http://localhost/api/users?id=123", {
      method: "POST",
    }),
    server,
  });

  expect(testMaster.request.method).toBe("POST");
  const url = new URL(testMaster.request.url);
  expect(url.pathname).toBe("/api/users");
  expect(url.searchParams.get("id")).toBe("123");
});

test("request: should parse JSON body", async () => {
  const body = { username: "test", password: "secret" };

  const testMaster = new masterRequest({
    request: new Request("http://localhost/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    server,
  });

  const parsedBody = await testMaster.request.json();
  expect(parsedBody).toEqual(body);
});
