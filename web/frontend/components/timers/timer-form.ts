import type {
  TimerPosition,
  TimerRecord,
  TimerSize,
  TimerType,
  TimerWritePayload,
  TargetingType,
} from "./types";
import { NAME_MAX_LENGTH, URGENCY_MESSAGE_MAX_LENGTH } from "./types";

const HEX_COLOR_PATTERN =
  /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export interface TimerFormState {
  name: string;
  type: TimerType;
  enabled: boolean;
  startAt: string;
  endAt: string;
  hours: string;
  minutes: string;
  seconds: string;
  targetingType: TargetingType;
  productIds: string[];
  collectionIds: string[];
  backgroundColor: string;
  textColor: string;
  timerSize: TimerSize;
  position: TimerPosition;
  urgencyMessage: string;
}

export type TimerFieldErrors = Partial<Record<keyof TimerFormState | "duration" | "targeting", string>>;

export type TimerPayloadResult =
  | { ok: true; payload: TimerWritePayload }
  | { ok: false; errors: TimerFieldErrors };

export function emptyTimerForm(): TimerFormState {
  return {
    name: "",
    type: "FIXED",
    enabled: true,
    startAt: "",
    endAt: "",
    hours: "0",
    minutes: "15",
    seconds: "0",
    targetingType: "ALL",
    productIds: [],
    collectionIds: [],
    backgroundColor: "#111111",
    textColor: "#ffffff",
    timerSize: "MEDIUM",
    position: "BELOW_PRICE",
    urgencyMessage: "",
  };
}

export function timerToForm(timer: TimerRecord): TimerFormState {
  const duration = splitDuration(timer.durationSeconds ?? 0);
  return {
    name: timer.name,
    type: timer.type,
    enabled: timer.enabled,
    startAt: toDateTimeLocal(timer.startAt),
    endAt: toDateTimeLocal(timer.endAt),
    hours: duration.hours,
    minutes: duration.minutes,
    seconds: duration.seconds,
    targetingType: timer.targeting.type,
    productIds: [...timer.targeting.productIds],
    collectionIds: [...timer.targeting.collectionIds],
    backgroundColor: timer.appearance.backgroundColor,
    textColor: timer.appearance.textColor,
    timerSize: timer.appearance.timerSize,
    position: timer.appearance.position,
    urgencyMessage: timer.urgencyMessage ?? "",
  };
}

export function isTimerPayload(
  result: TimerPayloadResult
): result is { ok: true; payload: TimerWritePayload } {
  return result.ok === true;
}

export function buildTimerPayload(form: TimerFormState): TimerPayloadResult {
  const errors: TimerFieldErrors = {};
  const name = form.name.trim();

  if (name.length === 0) {
    errors.name = "Enter a timer name.";
  } else if (name.length > NAME_MAX_LENGTH) {
    errors.name = `Name must be ${NAME_MAX_LENGTH} characters or fewer.`;
  }

  const urgencyMessage = form.urgencyMessage.trim();
  if (urgencyMessage.length > URGENCY_MESSAGE_MAX_LENGTH) {
    errors.urgencyMessage = `Urgency message must be ${URGENCY_MESSAGE_MAX_LENGTH} characters or fewer.`;
  }

  if (!HEX_COLOR_PATTERN.test(form.backgroundColor.trim())) {
    errors.backgroundColor = "Enter a hex color such as #111111.";
  }
  if (!HEX_COLOR_PATTERN.test(form.textColor.trim())) {
    errors.textColor = "Enter a hex color such as #ffffff.";
  }

  if (form.targetingType === "PRODUCTS" && form.productIds.length === 0) {
    errors.targeting = "Select at least one product.";
  }
  if (form.targetingType === "COLLECTIONS" && form.collectionIds.length === 0) {
    errors.targeting = "Select at least one collection.";
  }

  let startAt: string | undefined;
  let endAt: string | undefined;
  let durationSeconds: number | undefined;

  if (form.type === "FIXED") {
    startAt = fromDateTimeLocal(form.startAt) ?? undefined;
    endAt = fromDateTimeLocal(form.endAt) ?? undefined;
    if (!startAt) {
      errors.startAt = "Enter a start date and time.";
    }
    if (!endAt) {
      errors.endAt = "Enter an end date and time.";
    }
    if (startAt && endAt && new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      errors.endAt = "End time must be later than the start time.";
    }
  } else {
    const duration = readDuration(form);
    if (duration.error) {
      errors.duration = duration.error;
    } else {
      durationSeconds = duration.seconds;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    payload: {
      name,
      type: form.type,
      enabled: form.enabled,
      ...(startAt ? { startAt } : {}),
      ...(endAt ? { endAt } : {}),
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      targeting: {
        type: form.targetingType,
        productIds: [...form.productIds],
        collectionIds: [...form.collectionIds],
      },
      appearance: {
        backgroundColor: form.backgroundColor.trim(),
        textColor: form.textColor.trim(),
        timerSize: form.timerSize,
        position: form.position,
      },
      ...(urgencyMessage.length > 0 ? { urgencyMessage } : { urgencyMessage: "" }),
    },
  };
}

export function toDateTimeLocal(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDateTimeLocal(value: string): string | null {
  if (value.trim().length === 0) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function readDuration(form: TimerFormState): { seconds?: number; error?: string } {
  const hours = readWholeNumber(form.hours);
  const minutes = readWholeNumber(form.minutes);
  const seconds = readWholeNumber(form.seconds);

  if (hours == null || minutes == null || seconds == null) {
    return { error: "Enter hours, minutes, and seconds as whole numbers." };
  }
  if (minutes > 59 || seconds > 59) {
    return { error: "Minutes and seconds must be between 0 and 59." };
  }

  const total = hours * 3600 + minutes * 60 + seconds;
  if (total <= 0) {
    return { error: "Enter a duration greater than zero." };
  }

  return { seconds: total };
}

function readWholeNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  return Number(trimmed);
}

function splitDuration(totalSeconds: number): {
  hours: string;
  minutes: string;
  seconds: string;
} {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  return {
    hours: String(Math.floor(safe / 3600)),
    minutes: String(Math.floor((safe % 3600) / 60)),
    seconds: String(safe % 60),
  };
}
