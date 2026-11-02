import type { StorefrontTimer } from "./types";
import { chooseTimer, parseTimerPayload, timerRequestUrl } from "./countdown";

export type TimerLoadResult =
  | { status: "timer"; timer: StorefrontTimer }
  | { status: "empty" }
  | { status: "error" };

export async function loadStorefrontTimer(
  proxyUrl: string,
  productId: string,
  origin: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal
): Promise<TimerLoadResult> {
  if (proxyUrl.trim().length === 0 || productId.trim().length === 0) {
    return { status: "error" };
  }

  let response: Response;
  try {
    response = await fetchImpl(timerRequestUrl(proxyUrl, productId, origin), {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      signal,
    });
  } catch (error: unknown) {
    if (isAbortError(error)) {
      return { status: "error" };
    }
    return { status: "error" };
  }

  if (!response.ok) {
    return { status: "error" };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { status: "error" };
  }

  const timers = parseTimerPayload(payload);
  if (!timers) {
    return { status: "error" };
  }

  const timer = chooseTimer(timers);
  return timer ? { status: "timer", timer } : { status: "empty" };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
