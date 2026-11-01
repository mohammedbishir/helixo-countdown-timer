export type TimerSize = "SMALL" | "MEDIUM" | "LARGE";
export type TimerPosition = "ABOVE_BUTTON" | "BELOW_PRICE" | "BELOW_TITLE";

export interface TimerAppearance {
  backgroundColor: string;
  textColor: string;
  timerSize: TimerSize;
  position: TimerPosition;
}

export interface StorefrontTimer {
  id: string;
  type: "FIXED" | "EVERGREEN";
  startAt?: string;
  endAt?: string;
  durationSeconds?: number;
  urgencyMessage?: string;
  appearance: TimerAppearance;
}

export interface TimeParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export interface StorageArea {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type WidgetPhase =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error" }
  | { kind: "scheduled"; timer: StorefrontTimer }
  | { kind: "expired"; timer: StorefrontTimer }
  | { kind: "running"; timer: StorefrontTimer; parts: TimeParts };
