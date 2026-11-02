import type { StorageArea } from "./types";

const recordedImpressions = new Set<string>();

export function claimImpression(timerId: string, storage: StorageArea): boolean {
  const key = impressionStorageKey(timerId);
  if (recordedImpressions.has(key)) {
    return false;
  }
  recordedImpressions.add(key);
  try {
    if (storage.getItem(key) === "1") {
      return false;
    }
    storage.setItem(key, "1");
  } catch {
    return true;
  }
  return true;
}

export function impressionRequestUrl(
  proxyUrl: string,
  productId: string,
  timerId: string,
  origin: string
): string {
  const url = new URL(`${proxyUrl.replace(/\/$/, "")}/impressions`, origin);
  url.searchParams.set("product_id", productId);
  url.searchParams.set("timer_id", timerId);
  return url.toString();
}

export function sendImpression(
  proxyUrl: string,
  productId: string,
  timerId: string,
  origin: string,
  fetchImpl: typeof fetch
): void {
  const url = impressionRequestUrl(proxyUrl, productId, timerId, origin);
  void fetchImpl(url, {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => undefined);
}

export function resetImpressionClaims(): void {
  recordedImpressions.clear();
}

function impressionStorageKey(timerId: string): string {
  return `helixo-countdown-impression:${timerId}`;
}
