import { Router, type Request, type Response } from "express";
import type { Session, Shopify } from "@shopify/shopify-api";
import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import shopify from "../shopify.js";
import { TimerModel, type TimerDocument } from "../models/timer.model.js";
import { isAppProxyFailure, verifyAppProxyRequest } from "../storefront/app-proxy.js";
import { loadProductCollectionIds } from "../storefront/collection-membership.js";
import {
  allowImpression,
  incrementImpression,
  isTimerObjectId,
  timerBelongsToShop,
  utcDateKey,
} from "../storefront/impressions.js";
import {
  hasCollectionCandidates,
  normalizeProductId,
  selectStorefrontTimers,
  type StoredStorefrontTimer,
} from "../storefront/timer-selection.js";

interface StorefrontTimerDependencies {
  api: Shopify;
  sessionStorage: SessionStorage;
  findEnabledTimers: (shop: string) => Promise<StoredStorefrontTimer[]>;
  loadCollectionIds: (session: Session, productId: string) => Promise<string[]>;
  now: () => Date;
}

const CACHE_CONTROL = "public, max-age=30";

export function createStorefrontTimerRouter(
  dependencies: StorefrontTimerDependencies
): Router {
  const router = Router();

  router.get("/", (req, res) => {
    void handleStorefrontTimers(req, res, dependencies);
  });
  router.post("/impressions", (req, res) => {
    void handleStorefrontImpression(req, res, dependencies);
  });
  router.use((_req, res) => {
    sendJson(res, 405, { error: "Method not allowed" }, "no-store");
  });

  return router;
}

export async function handleStorefrontImpression(
  req: Request,
  res: Response,
  dependencies: StorefrontTimerDependencies
): Promise<void> {
  try {
    const verified = await verifyAppProxyRequest(
      dependencies.api.utils,
      req.query,
      normalizeProductId
    );
    if (isAppProxyFailure(verified)) {
      sendJson(res, verified.status, { error: verified.error }, "no-store");
      return;
    }

    const timerId = readSignedTimerId(req.query.timer_id);
    if (!timerId) {
      sendJson(res, 400, { error: "Timer ID is invalid" }, "no-store");
      return;
    }

    const owned = await timerBelongsToShop(verified.shop, timerId);
    if (!owned) {
      sendJson(res, 404, { error: "Timer not found" }, "no-store");
      return;
    }

    const now = dependencies.now();
    const rateKey = `${verified.shop}:${timerId}:${clientAddress(req)}`;
    if (!allowImpression(rateKey, now.getTime())) {
      sendJson(res, 200, { recorded: false }, "no-store");
      return;
    }

    await incrementImpression(verified.shop, timerId, utcDateKey(now));
    sendJson(res, 200, { recorded: true }, "no-store");
  } catch (error: unknown) {
    console.error(`Storefront impression failed: ${safeErrorText(error)}`);
    sendJson(res, 503, { error: "Impression could not be recorded" }, "no-store");
  }
}

function readSignedTimerId(value: unknown): string | null {
  if (typeof value !== "string" || !isTimerObjectId(value)) {
    return null;
  }
  return value.toLowerCase();
}

function clientAddress(req: Request): string {
  const address = req.ip?.trim();
  return address && address.length > 0 ? address : "unknown";
}

export async function handleStorefrontTimers(
  req: Request,
  res: Response,
  dependencies: StorefrontTimerDependencies
): Promise<void> {
  try {
    const verified = await verifyAppProxyRequest(
      dependencies.api.utils,
      req.query,
      normalizeProductId
    );
    if (isAppProxyFailure(verified)) {
      sendJson(res, verified.status, { error: verified.error }, "no-store");
      return;
    }

    const session = await loadOfflineSession(
      dependencies.api,
      dependencies.sessionStorage,
      verified.shop
    );
    if (!session) {
      sendJson(res, 404, { error: "Shop not found" }, "no-store");
      return;
    }

    const now = dependencies.now();
    const timers = await dependencies.findEnabledTimers(verified.shop);
    let collectionIds = new Set<string>();

    if (hasCollectionCandidates(timers, verified.shop, now)) {
      const membership = await dependencies.loadCollectionIds(session, verified.productId);
      collectionIds = new Set(membership);
    }

    const selected = selectStorefrontTimers(
      timers,
      verified.shop,
      verified.productId,
      collectionIds,
      now
    );
    sendJson(res, 200, { timers: selected }, "public");
  } catch (error: unknown) {
    console.error(`Storefront timer lookup failed: ${safeErrorText(error)}`);
    sendJson(
      res,
      503,
      { error: "Timer data is temporarily unavailable" },
      "no-store"
    );
  }
}

async function loadOfflineSession(
  api: Shopify,
  sessionStorage: SessionStorage,
  shop: string
): Promise<Session | undefined> {
  const session = await sessionStorage.loadSession(api.session.getOfflineId(shop));
  if (!session || session.isOnline || !session.accessToken) {
    return undefined;
  }
  if (session.shop !== shop) {
    return undefined;
  }
  return session;
}

async function findEnabledTimers(shop: string): Promise<StoredStorefrontTimer[]> {
  const timers = await TimerModel.find({ shop, enabled: true }).sort({ createdAt: -1 });
  return timers.map(readTimer);
}

async function loadCollectionIds(session: Session, productId: string): Promise<string[]> {
  const client = new shopify.api.clients.Graphql({ session });
  return loadProductCollectionIds(
    (query, options) => client.request(query, options),
    productId
  );
}

function readTimer(timer: TimerDocument): StoredStorefrontTimer {
  return {
    id: timer._id.toString(),
    shop: timer.shop,
    type: timer.type,
    enabled: timer.enabled,
    startAt: timer.startAt,
    endAt: timer.endAt,
    durationSeconds: timer.durationSeconds,
    urgencyMessage: timer.urgencyMessage,
    targeting: {
      type: timer.targeting.type,
      productIds: [...timer.targeting.productIds],
      collectionIds: [...timer.targeting.collectionIds],
    },
    appearance: {
      backgroundColor: timer.appearance.backgroundColor,
      textColor: timer.appearance.textColor,
      timerSize: timer.appearance.timerSize,
      position: timer.appearance.position,
    },
  };
}

function sendJson(
  res: Response,
  status: number,
  body: { timers?: unknown; error?: string; recorded?: boolean },
  cache: "public" | "no-store"
): void {
  res.setHeader("Cache-Control", cache === "public" ? CACHE_CONTROL : "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(status).json(body);
}

function safeErrorText(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unknown error";
  }
  return error.message.replace(/shpat_\S+/g, "[redacted]").slice(0, 300);
}

const router = createStorefrontTimerRouter({
  api: shopify.api,
  sessionStorage: shopify.config.sessionStorage,
  findEnabledTimers,
  loadCollectionIds,
  now: () => new Date(),
});

export default router;
