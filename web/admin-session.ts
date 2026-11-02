import type { NextFunction, Request, Response } from "express";

const BEARER = /^Bearer\s+\S+/;
const SENSITIVE =
  /Bearer\s+\S+|shpat_[A-Za-z0-9]+|shpss_[A-Za-z0-9]+|shpca_[A-Za-z0-9]+/gi;

type Authenticate = (req: Request, res: Response, next: NextFunction) => unknown;

/**
 * Requires an admin bearer token, then runs Shopify session validation.
 * A thrown or rejected check is answered with JSON and does not crash the process.
 * Library 401 bodies are replaced so session tokens are not returned to the browser.
 */
export function guardAdminSession(authenticate: Authenticate) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authorization = req.headers.authorization;
    if (typeof authorization !== "string" || !BEARER.test(authorization)) {
      res.status(401).json({ error: "Shop session is required" });
      return;
    }

    const send = res.send.bind(res);
    const status = res.status.bind(res);
    let statusCode = res.statusCode;
    let restored = false;
    const restore = () => {
      if (restored) {
        return;
      }
      restored = true;
      res.send = send;
      res.status = status;
    };

    res.status = ((code: number) => {
      statusCode = code;
      return status(code);
    }) as Response["status"];
    res.send = ((body?: unknown) => {
      restore();
      if (statusCode === 401) {
        res.statusCode = 401;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        return send(JSON.stringify({ error: "Shop session is required" }));
      }
      return send(body);
    }) as Response["send"];

    void Promise.resolve()
      .then(() =>
        authenticate(req, res, (error?: unknown) => {
          restore();
          if (error) {
            failClosed(res, error);
            return;
          }
          next();
        })
      )
      .catch((error: unknown) => {
        restore();
        failClosed(res, error);
      });
  };
}

export function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown error";
  return message.replace(SENSITIVE, "[redacted]");
}

function failClosed(res: Response, error: unknown): void {
  console.error(`Admin session check failed: ${safeErrorMessage(error)}`);
  if (res.headersSent) {
    return;
  }
  res.status(503).json({ error: "Shop session could not be verified" });
}
