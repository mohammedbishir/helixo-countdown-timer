import type { TimerRecord } from "./types";

export type TimerDisplayStatus = "Disabled" | "Scheduled" | "Active" | "Ended";

/**
 * Display label for the dashboard. The API still decides what can be changed;
 * this value is never sent as authorization.
 */
export function timerDisplayStatus(
  timer: Pick<TimerRecord, "enabled" | "type" | "startAt" | "endAt">,
  now = new Date()
): TimerDisplayStatus {
  if (!timer.enabled) {
    return "Disabled";
  }
  if (timer.type === "EVERGREEN") {
    return "Active";
  }

  const start = parseTime(timer.startAt);
  const end = parseTime(timer.endAt);
  if (start && now.getTime() < start.getTime()) {
    return "Scheduled";
  }
  if (end && now.getTime() >= end.getTime()) {
    return "Ended";
  }
  return "Active";
}

export function formatSchedule(timer: TimerRecord): string {
  if (timer.type === "EVERGREEN") {
    return formatDuration(timer.durationSeconds ?? 0);
  }

  const start = formatDateTime(timer.startAt);
  const end = formatDateTime(timer.endAt);
  return `${start} – ${end}`;
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (remainingSeconds > 0 || parts.length === 0) {
    parts.push(`${remainingSeconds}s`);
  }

  return parts.join(" ");
}

function formatDateTime(value: string | undefined): string {
  const date = parseTime(value);
  if (!date) {
    return "Not set";
  }
  return date.toLocaleString();
}

function parseTime(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}
