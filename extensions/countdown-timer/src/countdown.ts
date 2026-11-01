import type { StorageArea, StorefrontTimer, TimeParts, WidgetPhase } from "./types";

const SESSION_KEY = "helixo-countdown-session";
const EXPIRY_PREFIX = "helixo-countdown-expiry:";
const HEX_COLOR =
  /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const SIZES = new Set(["SMALL", "MEDIUM", "LARGE"]);
const POSITIONS = new Set(["ABOVE_BUTTON", "BELOW_PRICE", "BELOW_TITLE"]);

interface StoredExpiry {
  sessionId: string;
  expiresAt: number;
}

export function timerRequestUrl(proxyUrl: string, productId: string, origin: string): string {
  const url = new URL(proxyUrl, origin);
  url.searchParams.set("product_id", productId);
  return url.toString();
}

export function parseTimerPayload(value: unknown): StorefrontTimer[] | null {
  if (!value || typeof value !== "object" || !("timers" in value)) {
    return null;
  }
  const timers = (value as { timers: unknown }).timers;
  if (!Array.isArray(timers)) {
    return null;
  }

  const parsed: StorefrontTimer[] = [];
  for (const entry of timers) {
    const timer = parseTimer(entry);
    if (timer) {
      parsed.push(timer);
    }
  }
  if (timers.length > 0 && parsed.length === 0) {
    return null;
  }
  return parsed;
}

export function chooseTimer(timers: StorefrontTimer[]): StorefrontTimer | null {
  return timers[0] ?? null;
}

export function remainingParts(endAtMs: number, nowMs: number): TimeParts {
  const totalSeconds = Math.max(0, Math.floor((endAtMs - nowMs) / 1000));
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export function resolveEvergreenExpiry(
  timer: StorefrontTimer,
  nowMs: number,
  sessionStore: StorageArea,
  localStore: StorageArea,
  createId: () => string
): number {
  const durationMs = (timer.durationSeconds ?? 0) * 1000;
  const sessionId = readSessionId(sessionStore, createId);
  const stored = readExpiry(localStore, timer.id);

  if (stored && stored.expiresAt > nowMs) {
    return stored.expiresAt;
  }

  if (stored && stored.sessionId === sessionId) {
    return stored.expiresAt;
  }

  const expiresAt = nowMs + durationMs;
  writeExpiry(localStore, timer.id, { sessionId, expiresAt });
  return expiresAt;
}

export function phaseForTimer(
  timer: StorefrontTimer | null,
  nowMs: number,
  evergreenExpiresAt: number | null
): WidgetPhase {
  if (!timer) {
    return { kind: "empty" };
  }

  if (timer.type === "FIXED") {
    const endAt = Date.parse(timer.endAt ?? "");
    const startAt = timer.startAt ? Date.parse(timer.startAt) : Number.NaN;
    if (!Number.isFinite(endAt)) {
      return { kind: "error" };
    }
    if (Number.isFinite(startAt) && nowMs < startAt) {
      return { kind: "scheduled", timer };
    }
    if (nowMs >= endAt) {
      return { kind: "expired", timer };
    }
    return { kind: "running", timer, parts: remainingParts(endAt, nowMs) };
  }

  if (evergreenExpiresAt === null) {
    return { kind: "loading" };
  }
  if (nowMs >= evergreenExpiresAt) {
    return { kind: "expired", timer };
  }
  return {
    kind: "running",
    timer,
    parts: remainingParts(evergreenExpiresAt, nowMs),
  };
}

export function padTime(value: number): string {
  return String(value).padStart(2, "0");
}

function parseTimer(value: unknown): StorefrontTimer | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || record.id.length === 0) {
    return null;
  }
  const appearance = parseAppearance(record.appearance);
  if (!appearance) {
    return null;
  }
  const urgencyMessage = parseUrgency(record.urgencyMessage);

  if (record.type === "FIXED" && typeof record.endAt === "string") {
    return {
      id: record.id,
      type: "FIXED",
      ...(typeof record.startAt === "string" ? { startAt: record.startAt } : {}),
      endAt: record.endAt,
      appearance,
      ...(urgencyMessage ? { urgencyMessage } : {}),
    };
  }

  if (
    record.type === "EVERGREEN" &&
    typeof record.durationSeconds === "number" &&
    Number.isInteger(record.durationSeconds) &&
    record.durationSeconds > 0
  ) {
    return {
      id: record.id,
      type: "EVERGREEN",
      durationSeconds: record.durationSeconds,
      appearance,
      ...(urgencyMessage ? { urgencyMessage } : {}),
    };
  }

  return null;
}

function parseAppearance(value: unknown): StorefrontTimer["appearance"] | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const appearance = value as Record<string, unknown>;
  if (
    typeof appearance.backgroundColor !== "string" ||
    !HEX_COLOR.test(appearance.backgroundColor) ||
    typeof appearance.textColor !== "string" ||
    !HEX_COLOR.test(appearance.textColor) ||
    typeof appearance.timerSize !== "string" ||
    !SIZES.has(appearance.timerSize) ||
    typeof appearance.position !== "string" ||
    !POSITIONS.has(appearance.position)
  ) {
    return null;
  }

  return {
    backgroundColor: appearance.backgroundColor,
    textColor: appearance.textColor,
    timerSize: appearance.timerSize as StorefrontTimer["appearance"]["timerSize"],
    position: appearance.position as StorefrontTimer["appearance"]["position"],
  };
}

function parseUrgency(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const message = value.trim().slice(0, 280);
  return message.length > 0 ? message : undefined;
}

function readSessionId(store: StorageArea, createId: () => string): string {
  const existing = safeGet(store, SESSION_KEY);
  if (existing && existing.length > 0) {
    return existing;
  }
  const created = createId();
  safeSet(store, SESSION_KEY, created);
  return created;
}

function readExpiry(store: StorageArea, timerId: string): StoredExpiry | null {
  const raw = safeGet(store, expiryKey(timerId));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredExpiry>;
    if (
      typeof parsed.sessionId !== "string" ||
      parsed.sessionId.length === 0 ||
      typeof parsed.expiresAt !== "number" ||
      !Number.isFinite(parsed.expiresAt)
    ) {
      return null;
    }
    return { sessionId: parsed.sessionId, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

function writeExpiry(store: StorageArea, timerId: string, value: StoredExpiry): void {
  safeSet(store, expiryKey(timerId), JSON.stringify(value));
}

function expiryKey(timerId: string): string {
  return `${EXPIRY_PREFIX}${timerId}`;
}

function safeGet(store: StorageArea, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(store: StorageArea, key: string, value: string): void {
  try {
    store.setItem(key, value);
  } catch {
    // Private browsing can reject storage. The countdown still runs in memory.
  }
}
