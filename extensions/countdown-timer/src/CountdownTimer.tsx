import { useEffect, useState } from "preact/hooks";
import { phaseForTimer, resolveEvergreenExpiry, padTime } from "./countdown";
import { loadStorefrontTimer } from "./load-timer";
import type { StorefrontTimer, WidgetPhase } from "./types";

interface CountdownTimerAppProps {
  productId: string;
  proxyUrl: string;
}

const SIZE_CLASS: Record<StorefrontTimer["appearance"]["timerSize"], string> = {
  SMALL: "helixo-countdown--small",
  MEDIUM: "helixo-countdown--medium",
  LARGE: "helixo-countdown--large",
};

const POSITION_CLASS: Record<StorefrontTimer["appearance"]["position"], string> = {
  ABOVE_BUTTON: "helixo-countdown--above-button",
  BELOW_PRICE: "helixo-countdown--below-price",
  BELOW_TITLE: "helixo-countdown--below-title",
};

export function CountdownTimerApp({ productId, proxyUrl }: CountdownTimerAppProps) {
  const [timer, setTimer] = useState<StorefrontTimer | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "empty" | "error" | "ready">(
    "loading"
  );
  const [now, setNow] = useState(() => Date.now());
  const [evergreenExpiresAt, setEvergreenExpiresAt] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoadState("loading");
    setTimer(null);
    setEvergreenExpiresAt(null);

    void loadStorefrontTimer(
      proxyUrl,
      productId,
      window.location.origin,
      window.fetch.bind(window),
      controller.signal
    ).then((result) => {
      if (!active || controller.signal.aborted) {
        return;
      }
      if (result.status === "timer") {
        const loaded = result.timer;
        setTimer(loaded);
        setNow(Date.now());
        if (loaded.type === "EVERGREEN" && loaded.durationSeconds !== undefined) {
          setEvergreenExpiresAt(
            resolveEvergreenExpiry(
              loaded,
              Date.now(),
              window.sessionStorage,
              window.localStorage,
              createSessionId
            )
          );
        } else {
          setEvergreenExpiresAt(null);
        }
        setLoadState("ready");
        return;
      }
      setLoadState(result.status);
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [productId, proxyUrl]);

  const phase: WidgetPhase =
    loadState === "loading"
      ? { kind: "loading" }
      : loadState === "error"
        ? { kind: "error" }
        : loadState === "empty"
          ? { kind: "empty" }
          : phaseForTimer(timer, now, evergreenExpiresAt);

  useEffect(() => {
    if (phase.kind !== "running" && phase.kind !== "scheduled") {
      return;
    }
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [phase.kind, timer?.id]);

  if (phase.kind === "loading") {
    return <p className="helixo-countdown__status">Countdown timer loading…</p>;
  }
  if (phase.kind === "empty") {
    return <p className="helixo-countdown__status">No countdown is active for this product.</p>;
  }
  if (phase.kind === "error") {
    return <p className="helixo-countdown__status">Countdown timer couldn't be loaded.</p>;
  }

  const appearance = phase.timer.appearance;
  return (
    <section
      className={`helixo-countdown__panel ${SIZE_CLASS[appearance.timerSize]} ${POSITION_CLASS[appearance.position]}`}
      style={{ backgroundColor: appearance.backgroundColor, color: appearance.textColor }}
      data-position={appearance.position}
      data-size={appearance.timerSize}
    >
      {phase.timer.urgencyMessage ? (
        <p className="helixo-countdown__urgency">{phase.timer.urgencyMessage}</p>
      ) : null}
      {phase.kind === "scheduled" ? (
        <p className="helixo-countdown__status">This offer has not started.</p>
      ) : null}
      {phase.kind === "expired" ? (
        <p className="helixo-countdown__status">This offer has ended.</p>
      ) : null}
      {phase.kind === "running" ? <CountdownUnits parts={phase.parts} /> : null}
    </section>
  );
}

function CountdownUnits({
  parts,
}: {
  parts: { days: number; hours: number; minutes: number; seconds: number };
}) {
  const label = `${parts.days} days, ${parts.hours} hours, ${parts.minutes} minutes, ${parts.seconds} seconds`;
  return (
    <div className="helixo-countdown__units" role="timer" aria-label={label}>
      <TimeUnit value={parts.days} label={parts.days === 1 ? "day" : "days"} />
      <TimeUnit value={parts.hours} label={parts.hours === 1 ? "hour" : "hours"} />
      <TimeUnit value={parts.minutes} label={parts.minutes === 1 ? "minute" : "minutes"} />
      <TimeUnit value={parts.seconds} label={parts.seconds === 1 ? "second" : "seconds"} />
    </div>
  );
}

function TimeUnit({ value, label }: { value: number; label: string }) {
  return (
    <span className="helixo-countdown__unit">
      <span className="helixo-countdown__value">{padTime(value)}</span>
      <span className="helixo-countdown__unit-label">{label}</span>
    </span>
  );
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
