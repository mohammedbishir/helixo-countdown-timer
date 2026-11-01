import type {
  TimerAppearance,
  TimerPosition,
  TimerSize,
  TimerType,
  TargetingType,
} from "../models/timer.model.js";

export interface StoredStorefrontTimer {
  id: string;
  shop: string;
  type: TimerType;
  enabled: boolean;
  startAt?: Date;
  endAt?: Date;
  durationSeconds?: number;
  targeting: {
    type: TargetingType;
    productIds: string[];
    collectionIds: string[];
  };
  appearance: TimerAppearance;
}

export interface StorefrontTimer {
  id: string;
  type: TimerType;
  startAt?: string;
  endAt?: string;
  durationSeconds?: number;
  appearance: {
    backgroundColor: string;
    textColor: string;
    timerSize: TimerSize;
    position: TimerPosition;
  };
}

const PRODUCT_GID_PATTERN = /^gid:\/\/shopify\/Product\/(\d+)$/;
const NUMERIC_ID_PATTERN = /^\d+$/;

export function normalizeProductId(value: string): string | null {
  const trimmed = value.trim();
  const gidMatch = PRODUCT_GID_PATTERN.exec(trimmed);
  if (gidMatch) {
    return `gid://shopify/Product/${gidMatch[1]}`;
  }
  if (NUMERIC_ID_PATTERN.test(trimmed)) {
    return `gid://shopify/Product/${trimmed}`;
  }
  return null;
}

export function selectStorefrontTimers(
  timers: StoredStorefrontTimer[],
  shop: string,
  productId: string,
  collectionIds: ReadonlySet<string>,
  now: Date
): StorefrontTimer[] {
  const selected: StorefrontTimer[] = [];

  for (const timer of timers) {
    if (timer.shop !== shop || !isScheduleEligible(timer, now)) {
      continue;
    }
    if (!matchesProduct(timer, productId, collectionIds)) {
      continue;
    }
    selected.push(toStorefrontTimer(timer));
  }

  return selected;
}

export function hasCollectionCandidates(
  timers: StoredStorefrontTimer[],
  shop: string,
  now: Date
): boolean {
  return timers.some(
    (timer) =>
      timer.shop === shop &&
      timer.targeting.type === "COLLECTIONS" &&
      isScheduleEligible(timer, now)
  );
}

function isScheduleEligible(timer: StoredStorefrontTimer, now: Date): boolean {
  if (!timer.enabled) {
    return false;
  }

  if (timer.type === "EVERGREEN") {
    return (
      typeof timer.durationSeconds === "number" &&
      Number.isInteger(timer.durationSeconds) &&
      timer.durationSeconds > 0
    );
  }

  if (timer.type !== "FIXED") {
    return false;
  }

  if (!isValidDate(timer.startAt) || !isValidDate(timer.endAt)) {
    return false;
  }

  const time = now.getTime();
  return timer.startAt.getTime() <= time && time < timer.endAt.getTime();
}

function matchesProduct(
  timer: StoredStorefrontTimer,
  productId: string,
  collectionIds: ReadonlySet<string>
): boolean {
  if (timer.targeting.type === "ALL") {
    return true;
  }

  if (timer.targeting.type === "PRODUCTS") {
    return timer.targeting.productIds.some((id) => idsMatch(id, productId));
  }

  if (timer.targeting.type === "COLLECTIONS") {
    return timer.targeting.collectionIds.some((id) => collectionIds.has(id));
  }

  return false;
}

function idsMatch(storedId: string, productId: string): boolean {
  if (storedId === productId) {
    return true;
  }
  const numericId = productId.slice("gid://shopify/Product/".length);
  return storedId === numericId;
}

function toStorefrontTimer(timer: StoredStorefrontTimer): StorefrontTimer {
  const appearance = {
    backgroundColor: timer.appearance.backgroundColor,
    textColor: timer.appearance.textColor,
    timerSize: timer.appearance.timerSize,
    position: timer.appearance.position,
  };

  if (timer.type === "EVERGREEN") {
    return {
      id: timer.id,
      type: timer.type,
      durationSeconds: timer.durationSeconds,
      appearance,
    };
  }

  return {
    id: timer.id,
    type: "FIXED",
    startAt: timer.startAt?.toISOString(),
    endAt: timer.endAt?.toISOString(),
    appearance,
  };
}

function isValidDate(value: Date | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}
