import { Router, type Request, type Response } from "express";
import {
  summarizeImpressions,
  utcDateKey,
} from "../storefront/impressions.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const router = Router();

router.get("/impressions", (req, res) => {
  void handleImpressionSummary(req, res);
});

async function handleImpressionSummary(req: Request, res: Response): Promise<void> {
  const shop = res.locals.shopify?.session?.shop;
  if (typeof shop !== "string" || shop.trim().length === 0) {
    res.status(401).json({ error: "Shop session is required" });
    return;
  }

  const range = readDateRange(req.query.from, req.query.to);
  if (!range) {
    res.status(400).json({ error: "Invalid date range" });
    return;
  }

  try {
    const summary = await summarizeImpressions(shop, range.from, range.to);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(summary);
  } catch (error: unknown) {
    console.error(
      `Impression summary failed: ${error instanceof Error ? error.message.slice(0, 200) : "Unknown error"}`
    );
    res.status(500).json({ error: "Unable to load impression analytics" });
  }
}

function readDateRange(fromValue: unknown, toValue: unknown): { from: string; to: string } | null {
  const today = utcDateKey(new Date());
  const from = typeof fromValue === "string" && fromValue.length > 0 ? fromValue : daysBefore(today, 29);
  const to = typeof toValue === "string" && toValue.length > 0 ? toValue : today;
  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to) || from > to) {
    return null;
  }
  return { from, to };
}

function daysBefore(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return utcDateKey(new Date(parsed.getTime() - days * DAY_MS));
}

export default router;
