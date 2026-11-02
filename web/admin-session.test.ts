import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { guardAdminSession, safeErrorMessage } from "./admin-session.js";

interface MockResponse {
  statusCode: number;
  headersSent: boolean;
  body: unknown;
  headers: Record<string, string>;
  status: (code: number) => MockResponse;
  json: (body: unknown) => MockResponse;
  send: (body: unknown) => MockResponse;
  setHeader: (name: string, value: string) => void;
}

const originalError = console.error;
const logged: string[] = [];

afterEach(() => {
  console.error = originalError;
  logged.length = 0;
});

describe("guardAdminSession", () => {
  it("rejects a missing bearer without calling Shopify auth", () => {
    let called = false;
    const guard = guardAdminSession(() => {
      called = true;
    });
    const res = mockResponse();

    guard(mockRequest(), res as unknown as Response, () => {
      throw new Error("next should not run");
    });

    assert.equal(called, false);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: "Shop session is required" });
  });

  it("continues when the Shopify session check succeeds", async () => {
    let continued = false;
    const guard = guardAdminSession((_req, _res, next) => {
      next();
    });
    const res = mockResponse();

    guard(mockRequest("Bearer session-token"), res as unknown as Response, (() => {
      continued = true;
    }) as NextFunction);
    await flush();

    assert.equal(continued, true);
    assert.equal(res.body, undefined);
  });

  it("replaces a library 401 body so the session token is not returned", async () => {
    const guard = guardAdminSession((_req, res) => {
      res.status(401).send("Failed to parse session token 'header.payload.signature'");
    });
    const res = mockResponse();

    guard(mockRequest("Bearer header.payload.signature"), res as unknown as Response, () => {
      throw new Error("next should not run");
    });
    await flush();

    assert.equal(res.statusCode, 401);
    assert.equal(
      res.body,
      JSON.stringify({ error: "Shop session is required" })
    );
    assert.equal(String(res.body).includes("header.payload.signature"), false);
  });

  it("returns JSON when Shopify auth rejects and keeps the process alive", async () => {
    console.error = (message?: unknown) => {
      logged.push(String(message));
    };
    const guard = guardAdminSession(() => {
      return Promise.reject(
        new Error(
          "Http request error, no response available: request failed, reason: read ECONNRESET Bearer shop-secret"
        )
      );
    });
    const res = mockResponse();
    let continued = false;

    guard(mockRequest("Bearer shop-secret"), res as unknown as Response, (() => {
      continued = true;
    }) as NextFunction);
    await flush();

    assert.equal(continued, false);
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, { error: "Shop session could not be verified" });
    assert.equal(logged.length, 1);
    assert.match(logged[0], /Admin session check failed:.*ECONNRESET/);
    assert.equal(logged[0].includes("shop-secret"), false);
  });

  it("returns JSON when Shopify auth throws before sending a response", async () => {
    console.error = (message?: unknown) => {
      logged.push(String(message));
    };
    const guard = guardAdminSession(() => {
      throw new Error("read ECONNRESET");
    });
    const res = mockResponse();

    guard(mockRequest("Bearer present"), res as unknown as Response, () => undefined);
    await flush();

    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, { error: "Shop session could not be verified" });
  });
});

describe("safeErrorMessage", () => {
  it("redacts bearer tokens and Shopify access tokens", () => {
    const message = safeErrorMessage(
      new Error("failed Bearer abc.def.ghi with shpat_secretvalue and shpss_signingsecret")
    );
    assert.equal(message.includes("abc.def.ghi"), false);
    assert.equal(message.includes("shpat_secretvalue"), false);
    assert.equal(message.includes("shpss_signingsecret"), false);
    assert.match(message, /\[redacted\]/);
  });
});

function mockRequest(authorization?: string): Request {
  return {
    headers: authorization ? { authorization } : {},
  } as Request;
}

function mockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    headersSent: false,
    body: undefined,
    headers: {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      this.headersSent = true;
      return this;
    },
    send(body: unknown) {
      this.body = body;
      this.headersSent = true;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  };
  return res;
}

function flush(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}
