import { Router, type Request, type Response } from "express";
import mongoose from "mongoose";
import {
  TARGETING_TYPES,
  TIMER_POSITIONS,
  TIMER_SIZES,
  TIMER_TYPES,
  TimerModel,
  type TimerAppearance,
  type TimerDocument,
  type TimerPosition,
  type TimerSize,
  type TargetingType,
  type TimerTargeting,
  type TimerType,
} from "../models/timer.model.js";

const TIMER_FIELDS = new Set([
  "name",
  "type",
  "enabled",
  "startAt",
  "endAt",
  "durationSeconds",
  "targeting",
  "appearance",
  "urgencyMessage",
]);

const BLOCKED_FIELDS = new Set([
  "shop",
  "_id",
  "id",
  "createdAt",
  "updatedAt",
  "__v",
]);

const QUERY_FIELDS = new Set(["enabled", "type"]);
const TARGETING_FIELDS = new Set(["type", "productIds", "collectionIds"]);
const APPEARANCE_FIELDS = new Set([
  "backgroundColor",
  "textColor",
  "timerSize",
  "position",
]);

interface TargetingWrite {
  type?: TargetingType;
  productIds?: string[];
  collectionIds?: string[];
}

interface AppearanceWrite {
  backgroundColor?: string;
  textColor?: string;
  timerSize?: TimerSize;
  position?: TimerPosition;
}

interface TimerWrite {
  name?: string;
  type?: TimerType;
  enabled?: boolean;
  startAt?: Date | null;
  endAt?: Date | null;
  durationSeconds?: number | null;
  targeting?: TargetingWrite;
  appearance?: AppearanceWrite;
  urgencyMessage?: string | null;
}

interface TimerListFilter {
  shop: string;
  enabled?: boolean;
  type?: TimerType;
}

const router = Router();

router.get("/", (req, res) => {
  void run(res, () => listTimers(req, res));
});

router.post("/", (req, res) => {
  void run(res, () => createTimer(req, res));
});

router.get("/:id", (req, res) => {
  void run(res, () => getTimer(req, res));
});

router.patch("/:id", (req, res) => {
  void run(res, () => updateTimer(req, res));
});

router.delete("/:id", (req, res) => {
  void run(res, () => deleteTimer(req, res));
});

async function listTimers(req: Request, res: Response): Promise<void> {
  const shop = requireShop(res);
  if (!shop) {
    return;
  }

  const parsed = parseListQuery(req.query);
  if (isParseFailure(parsed)) {
    sendError(res, 400, "Invalid query parameters", parsed.details);
    return;
  }

  const filter: TimerListFilter = { shop };
  if (parsed.value.enabled !== undefined) {
    filter.enabled = parsed.value.enabled;
  }
  if (parsed.value.type !== undefined) {
    filter.type = parsed.value.type;
  }

  const timers = await TimerModel.find(filter).sort({ createdAt: -1 });
  res.status(200).json({ timers });
}

async function createTimer(req: Request, res: Response): Promise<void> {
  const shop = requireShop(res);
  if (!shop) {
    return;
  }

  const parsed = parseTimerWrite(requestBody(req), "create");
  if (isParseFailure(parsed)) {
    sendError(res, 400, "Invalid timer data", parsed.details);
    return;
  }

  const name = parsed.value.name;
  const type = parsed.value.type;
  const targeting = parsed.value.targeting;
  const appearance = parsed.value.appearance;
  if (!name || !type || !targeting?.type || !appearance?.backgroundColor || !appearance.textColor) {
    sendError(res, 400, "Invalid timer data", ["Timer is missing required fields"]);
    return;
  }

  const timer = await TimerModel.create({
    shop,
    name,
    type,
    targeting: {
      type: targeting.type,
      productIds: targeting.productIds ?? [],
      collectionIds: targeting.collectionIds ?? [],
    },
    appearance: {
      backgroundColor: appearance.backgroundColor,
      textColor: appearance.textColor,
      ...(appearance.timerSize ? { timerSize: appearance.timerSize } : {}),
      ...(appearance.position ? { position: appearance.position } : {}),
    },
    ...(parsed.value.enabled !== undefined ? { enabled: parsed.value.enabled } : {}),
    ...(parsed.value.startAt ? { startAt: parsed.value.startAt } : {}),
    ...(parsed.value.endAt ? { endAt: parsed.value.endAt } : {}),
    ...(parsed.value.durationSeconds != null
      ? { durationSeconds: parsed.value.durationSeconds }
      : {}),
    ...(parsed.value.urgencyMessage !== undefined
      ? { urgencyMessage: parsed.value.urgencyMessage }
      : {}),
  });

  res.status(201).json({ timer });
}

async function getTimer(req: Request, res: Response): Promise<void> {
  const shop = requireShop(res);
  if (!shop) {
    return;
  }

  const id = readTimerId(req.params.id);
  if (!id) {
    sendError(res, 400, "Invalid timer id");
    return;
  }

  const timer = await TimerModel.findOne({ _id: id, shop });
  if (!timer) {
    sendNotFound(res);
    return;
  }

  res.status(200).json({ timer });
}

async function updateTimer(req: Request, res: Response): Promise<void> {
  const shop = requireShop(res);
  if (!shop) {
    return;
  }

  const id = readTimerId(req.params.id);
  if (!id) {
    sendError(res, 400, "Invalid timer id");
    return;
  }

  const parsed = parseTimerWrite(requestBody(req), "update");
  if (isParseFailure(parsed)) {
    sendError(res, 400, "Invalid timer data", parsed.details);
    return;
  }

  const timer = await TimerModel.findOne({ _id: id, shop });
  if (!timer) {
    sendNotFound(res);
    return;
  }

  applyTimerWrite(timer, parsed.value);
  await timer.save();
  res.status(200).json({ timer });
}

async function deleteTimer(req: Request, res: Response): Promise<void> {
  const shop = requireShop(res);
  if (!shop) {
    return;
  }

  const id = readTimerId(req.params.id);
  if (!id) {
    sendError(res, 400, "Invalid timer id");
    return;
  }

  const timer = await TimerModel.findOneAndDelete({ _id: id, shop });
  if (!timer) {
    sendNotFound(res);
    return;
  }

  res.status(200).json({ success: true });
}

function requireShop(res: Response): string | null {
  const shop = res.locals.shopify?.session?.shop;
  if (typeof shop !== "string" || shop.trim().length === 0) {
    sendError(res, 401, "Shop session is required");
    return null;
  }
  return shop;
}

function readTimerId(id: string | undefined): string | null {
  if (!id || !/^[a-fA-F0-9]{24}$/.test(id)) {
    return null;
  }
  return id;
}

function requestBody(req: Request): unknown {
  return req.body;
}

type Parsed<T> =
  | { ok: true; value: T }
  | { ok: false; details: string[] };

function isParseFailure<T>(
  parsed: Parsed<T>
): parsed is { ok: false; details: string[] } {
  return parsed.ok === false;
}

function parseListQuery(query: Request["query"]): Parsed<{
  enabled?: boolean;
  type?: TimerType;
}> {
  const details: string[] = [];
  const unknown = Object.keys(query).filter((key) => !QUERY_FIELDS.has(key));
  if (unknown.length > 0) {
    details.push(`Unknown query parameters: ${unknown.join(", ")}`);
  }

  const enabled = readQueryFlag(query.enabled, "enabled", details);
  const type = readQueryEnum(query.type, "type", TIMER_TYPES, details);

  if (details.length > 0 || enabled instanceof ParseStop || type instanceof ParseStop) {
    return { ok: false, details };
  }

  return {
    ok: true,
    value: {
      ...(enabled !== undefined ? { enabled } : {}),
      ...(type !== undefined ? { type } : {}),
    },
  };
}

class ParseStop {}

function readQueryFlag(
  value: unknown,
  field: string,
  details: string[]
): boolean | undefined | ParseStop {
  if (value === undefined) {
    return undefined;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  details.push(`${field} must be true or false`);
  return new ParseStop();
}

function readQueryEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  details: string[]
): T | undefined | ParseStop {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string" && allowed.some((item) => item === value)) {
    return value as T;
  }
  details.push(`${field} must be ${allowed.join(" or ")}`);
  return new ParseStop();
}

function parseTimerWrite(
  body: unknown,
  mode: "create" | "update"
): Parsed<TimerWrite> {
  if (!isRecord(body)) {
    return { ok: false, details: ["Request body must be a JSON object"] };
  }

  const details: string[] = [];
  const keys = Object.keys(body);
  const blocked = keys.filter((key) => BLOCKED_FIELDS.has(key));
  const unknown = keys.filter(
    (key) => !BLOCKED_FIELDS.has(key) && !TIMER_FIELDS.has(key)
  );

  if (blocked.length > 0) {
    details.push(`Cannot set ${blocked.join(", ")}`);
  }
  if (unknown.length > 0) {
    details.push(`Unknown fields: ${unknown.join(", ")}`);
  }
  if (mode === "update" && keys.length === 0) {
    details.push("At least one timer field is required");
  }

  const name = readOptionalString(body.name, "name", details);
  const type = readEnum(body.type, "type", TIMER_TYPES, details);
  const enabled = readOptionalBoolean(body.enabled, "enabled", details);
  const startAt = readIsoDate(body.startAt, "startAt", mode === "update", details);
  const endAt = readIsoDate(body.endAt, "endAt", mode === "update", details);
  const durationSeconds = readDuration(body.durationSeconds, mode === "update", details);
  const urgencyMessage = readOptionalString(
    body.urgencyMessage,
    "urgencyMessage",
    details,
    mode === "update"
  );
  const targeting = readTargeting(body.targeting, mode, details);
  const appearance = readAppearance(body.appearance, mode, details);

  if (mode === "create") {
    if (body.name === undefined) {
      details.push("name is required");
    }
    if (body.type === undefined) {
      details.push("type is required");
    }
    if (body.targeting === undefined) {
      details.push("targeting is required");
    }
    if (body.appearance === undefined) {
      details.push("appearance is required");
    }
  }

  if (
    details.length > 0 ||
    name instanceof ParseStop ||
    type instanceof ParseStop ||
    enabled instanceof ParseStop ||
    startAt instanceof ParseStop ||
    endAt instanceof ParseStop ||
    durationSeconds instanceof ParseStop ||
    urgencyMessage instanceof ParseStop ||
    targeting instanceof ParseStop ||
    appearance instanceof ParseStop
  ) {
    return { ok: false, details };
  }

  return {
    ok: true,
    value: {
      ...(name !== undefined ? { name } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
      ...(startAt !== undefined ? { startAt } : {}),
      ...(endAt !== undefined ? { endAt } : {}),
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      ...(urgencyMessage !== undefined ? { urgencyMessage } : {}),
      ...(targeting !== undefined ? { targeting } : {}),
      ...(appearance !== undefined ? { appearance } : {}),
    },
  };
}

function readTargeting(
  value: unknown,
  mode: "create" | "update",
  details: string[]
): TargetingWrite | undefined | ParseStop {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    details.push("targeting must be an object");
    return new ParseStop();
  }

  const unknown = Object.keys(value).filter((key) => !TARGETING_FIELDS.has(key));
  if (unknown.length > 0) {
    details.push(`Unknown targeting fields: ${unknown.join(", ")}`);
  }

  const type = readEnum(value.type, "targeting.type", TARGETING_TYPES, details);
  const productIds = readStringArray(value.productIds, "targeting.productIds", details);
  const collectionIds = readStringArray(
    value.collectionIds,
    "targeting.collectionIds",
    details
  );

  if (mode === "create" && value.type === undefined) {
    details.push("targeting.type is required");
  }
  if (
    type instanceof ParseStop ||
    productIds instanceof ParseStop ||
    collectionIds instanceof ParseStop
  ) {
    return new ParseStop();
  }

  return {
    ...(type !== undefined ? { type } : {}),
    ...(productIds !== undefined ? { productIds } : {}),
    ...(collectionIds !== undefined ? { collectionIds } : {}),
  };
}

function readAppearance(
  value: unknown,
  mode: "create" | "update",
  details: string[]
): AppearanceWrite | undefined | ParseStop {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    details.push("appearance must be an object");
    return new ParseStop();
  }

  const unknown = Object.keys(value).filter((key) => !APPEARANCE_FIELDS.has(key));
  if (unknown.length > 0) {
    details.push(`Unknown appearance fields: ${unknown.join(", ")}`);
  }

  const backgroundColor = readOptionalString(
    value.backgroundColor,
    "appearance.backgroundColor",
    details
  );
  const textColor = readOptionalString(value.textColor, "appearance.textColor", details);
  const timerSize = readEnum(value.timerSize, "appearance.timerSize", TIMER_SIZES, details);
  const position = readEnum(value.position, "appearance.position", TIMER_POSITIONS, details);

  if (mode === "create" && value.backgroundColor === undefined) {
    details.push("appearance.backgroundColor is required");
  }
  if (mode === "create" && value.textColor === undefined) {
    details.push("appearance.textColor is required");
  }
  if (
    backgroundColor instanceof ParseStop ||
    textColor instanceof ParseStop ||
    timerSize instanceof ParseStop ||
    position instanceof ParseStop
  ) {
    return new ParseStop();
  }

  return {
    ...(backgroundColor !== undefined ? { backgroundColor } : {}),
    ...(textColor !== undefined ? { textColor } : {}),
    ...(timerSize !== undefined ? { timerSize } : {}),
    ...(position !== undefined ? { position } : {}),
  };
}

function readOptionalString(
  value: unknown,
  field: string,
  details: string[],
  allowNull = false
): string | null | undefined | ParseStop {
  if (value === undefined) {
    return undefined;
  }
  if (value === null && allowNull) {
    return null;
  }
  if (typeof value !== "string") {
    details.push(`${field} must be a string`);
    return new ParseStop();
  }
  return value;
}

function readOptionalBoolean(
  value: unknown,
  field: string,
  details: string[]
): boolean | undefined | ParseStop {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    details.push(`${field} must be a boolean`);
    return new ParseStop();
  }
  return value;
}

function readEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  details: string[]
): T | undefined | ParseStop {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string" && allowed.some((item) => item === value)) {
    return value as T;
  }
  details.push(`${field} must be ${allowed.join(" or ")}`);
  return new ParseStop();
}

function readStringArray(
  value: unknown,
  field: string,
  details: string[]
): string[] | undefined | ParseStop {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    details.push(`${field} must be an array of strings`);
    return new ParseStop();
  }
  return value;
}

function readIsoDate(
  value: unknown,
  field: string,
  allowNull: boolean,
  details: string[]
): Date | null | undefined | ParseStop {
  if (value === undefined) {
    return undefined;
  }
  if (value === null && allowNull) {
    return null;
  }
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    details.push(`${field} must be an ISO date string`);
    return new ParseStop();
  }
  return new Date(value);
}

function readDuration(
  value: unknown,
  allowNull: boolean,
  details: string[]
): number | null | undefined | ParseStop {
  if (value === undefined) {
    return undefined;
  }
  if (value === null && allowNull) {
    return null;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    details.push("durationSeconds must be a positive integer");
    return new ParseStop();
  }
  return value;
}

function applyTimerWrite(timer: TimerDocument, write: TimerWrite): void {
  if (write.name !== undefined && write.name !== null) {
    timer.name = write.name;
  }
  if (write.type !== undefined) {
    timer.type = write.type;
  }
  if (write.enabled !== undefined) {
    timer.enabled = write.enabled;
  }
  if (write.startAt !== undefined) {
    timer.set("startAt", write.startAt ?? undefined);
  }
  if (write.endAt !== undefined) {
    timer.set("endAt", write.endAt ?? undefined);
  }
  if (write.durationSeconds !== undefined) {
    timer.set("durationSeconds", write.durationSeconds ?? undefined);
  }
  if (write.urgencyMessage !== undefined) {
    timer.set("urgencyMessage", write.urgencyMessage ?? undefined);
  }
  if (write.targeting) {
    const current: TimerTargeting = timer.targeting;
    timer.set("targeting", {
      type: write.targeting.type ?? current.type,
      productIds: write.targeting.productIds ?? [...current.productIds],
      collectionIds: write.targeting.collectionIds ?? [...current.collectionIds],
    });
  }
  if (write.appearance) {
    const current: TimerAppearance = timer.appearance;
    timer.set("appearance", {
      backgroundColor: write.appearance.backgroundColor ?? current.backgroundColor,
      textColor: write.appearance.textColor ?? current.textColor,
      timerSize: write.appearance.timerSize ?? current.timerSize,
      position: write.appearance.position ?? current.position,
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function run(res: Response, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error: unknown) {
    if (res.headersSent) {
      logServerError(error);
      return;
    }
    if (error instanceof mongoose.Error.ValidationError) {
      const details = Object.values(error.errors).map((item) => item.message);
      sendError(res, 400, "Invalid timer data", details);
      return;
    }
    if (error instanceof mongoose.Error.CastError) {
      sendError(res, 400, "Invalid timer data");
      return;
    }
    logServerError(error);
    sendError(res, 500, "Unable to complete the timer request");
  }
}

function sendError(
  res: Response,
  status: number,
  error: string,
  details?: string[]
): void {
  if (details && details.length > 0) {
    res.status(status).json({ error, details });
    return;
  }
  res.status(status).json({ error });
}

function sendNotFound(res: Response): void {
  res.status(404).json({ error: "Timer not found" });
}

function logServerError(error: unknown): void {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Timer API error: ${message}`);
}

export default router;
