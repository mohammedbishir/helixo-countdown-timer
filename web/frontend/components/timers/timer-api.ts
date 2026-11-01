import type { TimerPatch, TimerRecord, TimerWritePayload } from "./types";
import {
  TARGETING_TYPES,
  TIMER_POSITIONS,
  TIMER_SIZES,
  TIMER_TYPES,
  type TargetingType,
  type TimerAppearance,
  type TimerPosition,
  type TimerSize,
  type TimerTargeting,
  type TimerType,
} from "./types";

export class TimerApiError extends Error {
  readonly status: number;
  readonly details: string[];

  constructor(status: number, message: string, details: string[] = []) {
    super(message);
    this.name = "TimerApiError";
    this.status = status;
    this.details = details;
  }
}

export async function listTimers(): Promise<TimerRecord[]> {
  const body = await request("/api/timers");
  if (!isRecord(body) || !Array.isArray(body.timers)) {
    throw unexpectedResponse();
  }
  return body.timers.map((timer) => readTimer(timer));
}

export async function getTimer(id: string): Promise<TimerRecord> {
  const body = await request(`/api/timers/${encodeURIComponent(id)}`);
  if (!isRecord(body)) {
    throw unexpectedResponse();
  }
  return readTimer(body.timer);
}

export async function createTimer(payload: TimerWritePayload): Promise<TimerRecord> {
  const body = await request("/api/timers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!isRecord(body)) {
    throw unexpectedResponse();
  }
  return readTimer(body.timer);
}

export async function updateTimer(
  id: string,
  payload: TimerPatch
): Promise<TimerRecord> {
  const body = await request(`/api/timers/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!isRecord(body)) {
    throw unexpectedResponse();
  }
  return readTimer(body.timer);
}

export async function deleteTimer(id: string): Promise<void> {
  const body = await request(`/api/timers/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!isRecord(body) || body.success !== true) {
    throw unexpectedResponse();
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const headers = new Headers(init?.headers);
  if (init?.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers,
  });
  const text = await response.text();
  const payload = text.length > 0 ? parseJson(text) : null;

  if (!response.ok) {
    throw errorFromPayload(response.status, payload);
  }

  return payload;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw unexpectedResponse();
  }
}

function errorFromPayload(status: number, payload: unknown): TimerApiError {
  if (!isRecord(payload)) {
    return new TimerApiError(status, "The timer request failed.");
  }

  const message =
    typeof payload.error === "string" && payload.error.trim().length > 0
      ? payload.error
      : "The timer request failed.";
  const details = Array.isArray(payload.details)
    ? payload.details.filter((item): item is string => typeof item === "string")
    : [];

  return new TimerApiError(status, message, details);
}

function unexpectedResponse(): TimerApiError {
  return new TimerApiError(500, "The server returned an unexpected timer response.");
}

function readTimer(value: unknown): TimerRecord {
  if (!isRecord(value)) {
    throw unexpectedResponse();
  }

  const durationSeconds = readOptionalNumber(value.durationSeconds);
  const urgencyMessage = readOptionalString(value.urgencyMessage);

  return {
    _id: readString(value._id),
    shop: readString(value.shop),
    name: readString(value.name),
    type: readEnum(value.type, TIMER_TYPES),
    enabled: readBoolean(value.enabled),
    ...(readOptionalString(value.startAt) !== undefined
      ? { startAt: readOptionalString(value.startAt) }
      : {}),
    ...(readOptionalString(value.endAt) !== undefined
      ? { endAt: readOptionalString(value.endAt) }
      : {}),
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    targeting: readTargeting(value.targeting),
    appearance: readAppearance(value.appearance),
    ...(urgencyMessage !== undefined ? { urgencyMessage } : {}),
    createdAt: readString(value.createdAt),
    updatedAt: readString(value.updatedAt),
  };
}

function readTargeting(value: unknown): TimerTargeting {
  if (!isRecord(value)) {
    throw unexpectedResponse();
  }

  return {
    type: readEnum(value.type, TARGETING_TYPES),
    productIds: readStringArray(value.productIds),
    collectionIds: readStringArray(value.collectionIds),
  };
}

function readAppearance(value: unknown): TimerAppearance {
  if (!isRecord(value)) {
    throw unexpectedResponse();
  }

  return {
    backgroundColor: readString(value.backgroundColor),
    textColor: readString(value.textColor),
    timerSize: readEnum(value.timerSize, TIMER_SIZES),
    position: readEnum(value.position, TIMER_POSITIONS),
  };
}

function readString(value: unknown): string {
  if (typeof value !== "string") {
    throw unexpectedResponse();
  }
  return value;
}

function readOptionalString(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }
  return readString(value);
}

function readBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw unexpectedResponse();
  }
  return value;
}

function readOptionalNumber(value: unknown): number | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw unexpectedResponse();
  }
  return value;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw unexpectedResponse();
  }
  return value.map((item) => readString(item));
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value === "string" && allowed.some((item) => item === value)) {
    return value as T;
  }
  throw unexpectedResponse();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isTimerType(value: string): value is TimerType {
  return TIMER_TYPES.some((item) => item === value);
}

export function isTargetingType(value: string): value is TargetingType {
  return TARGETING_TYPES.some((item) => item === value);
}

export function isTimerSize(value: string): value is TimerSize {
  return TIMER_SIZES.some((item) => item === value);
}

export function isTimerPosition(value: string): value is TimerPosition {
  return TIMER_POSITIONS.some((item) => item === value);
}
