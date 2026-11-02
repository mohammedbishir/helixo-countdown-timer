import { ImpressionModel } from "../models/impression.model.js";
import { TimerModel } from "../models/timer.model.js";

const RATE_WINDOW_MS = 60_000;
const recentImpressions = new Map<string, number>();

export function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isTimerObjectId(value: string): boolean {
  return /^[a-fA-F0-9]{24}$/.test(value);
}

export function allowImpression(key: string, nowMs: number): boolean {
  const previous = recentImpressions.get(key);
  if (previous !== undefined && nowMs - previous < RATE_WINDOW_MS) {
    return false;
  }
  recentImpressions.set(key, nowMs);
  if (recentImpressions.size > 5000) {
    for (const [entry, time] of recentImpressions) {
      if (nowMs - time >= RATE_WINDOW_MS) {
        recentImpressions.delete(entry);
      }
    }
  }
  return true;
}

export function clearImpressionRateLimit(): void {
  recentImpressions.clear();
}

export async function incrementImpression(
  shop: string,
  timerId: string,
  date: string
): Promise<number> {
  const normalizedTimerId = timerId.toLowerCase();
  try {
    const updated = await ImpressionModel.findOneAndUpdate(
      { shop, timerId: normalizedTimerId, date },
      { $inc: { count: 1 } },
      { upsert: true, new: true }
    );
    return updated?.count ?? 1;
  } catch (error: unknown) {
    if (!isDuplicateKey(error)) {
      throw error;
    }
    const updated = await ImpressionModel.findOneAndUpdate(
      { shop, timerId: normalizedTimerId, date },
      { $inc: { count: 1 } },
      { new: true }
    );
    return updated?.count ?? 0;
  }
}

export async function timerBelongsToShop(shop: string, timerId: string): Promise<boolean> {
  const timer = await TimerModel.exists({ _id: timerId, shop });
  return timer !== null;
}

export interface ImpressionSummary {
  from: string;
  to: string;
  totalImpressions: number;
  days: { date: string; impressions: number }[];
  timers: { timerId: string; name: string; impressions: number }[];
}

export async function summarizeImpressions(
  shop: string,
  from: string,
  to: string
): Promise<ImpressionSummary> {
  const [days, timers] = await Promise.all([
    ImpressionModel.aggregate<{ _id: string; impressions: number }>([
      { $match: { shop, date: { $gte: from, $lte: to } } },
      { $group: { _id: "$date", impressions: { $sum: "$count" } } },
      { $sort: { _id: 1 } },
    ]),
    ImpressionModel.aggregate<{ _id: string; impressions: number }>([
      { $match: { shop, date: { $gte: from, $lte: to } } },
      { $group: { _id: "$timerId", impressions: { $sum: "$count" } } },
      { $sort: { impressions: -1, _id: 1 } },
    ]),
  ]);

  const names = await timerNames(
    shop,
    timers.map((row) => row._id)
  );
  const daily = days.map((row) => ({ date: row._id, impressions: row.impressions }));
  const totalImpressions = daily.reduce((sum, row) => sum + row.impressions, 0);

  return {
    from,
    to,
    totalImpressions,
    days: daily,
    timers: timers.map((row) => ({
      timerId: row._id,
      name: names.get(row._id) ?? "Deleted timer",
      impressions: row.impressions,
    })),
  };
}

async function timerNames(shop: string, timerIds: string[]): Promise<Map<string, string>> {
  if (timerIds.length === 0) {
    return new Map();
  }
  const timers = await TimerModel.find({ shop, _id: { $in: timerIds } }).select("name");
  return new Map(timers.map((timer) => [timer._id.toString(), timer.name]));
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}
