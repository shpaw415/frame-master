import { beforeEach, expect, test } from "bun:test";
import { masterRequest } from "../src/server/request-manager";
import { webToken } from "@shpaw415/webtoken";

let master: masterRequest;

process.env.WEB_TOKEN_SECRET = webToken.generateSecureSecret();
process.env.WEB_TOKEN_IV = webToken.generateSecureIV();

beforeEach(() => {
  master = new masterRequest({
    request: new Request("http://localhost/login", { method: "POST" }),
    server: Bun.serve({ port: 6574, fetch: () => new Response() }),
  });
});

test("set cookie to response", async () => {
  master.currentState = "request";
  master.setResponse("Test Cookie", { status: 200 });
  master.setCookie(
    "sessionId",
    { data: "test" },
    { httpOnly: true, maxAge: 3600, encrypted: true }
  );
  const res = await master.handleRequest();
  expect(res.headers.get("Set-Cookie")).toBeDefined();
});
