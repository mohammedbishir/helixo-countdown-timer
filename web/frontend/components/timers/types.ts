export const TIMER_TYPES = ["FIXED", "EVERGREEN"] as const;
export type TimerType = (typeof TIMER_TYPES)[number];

export const TARGETING_TYPES = ["ALL", "PRODUCTS", "COLLECTIONS"] as const;
export type TargetingType = (typeof TARGETING_TYPES)[number];

export const TIMER_SIZES = ["SMALL", "MEDIUM", "LARGE"] as const;
export type TimerSize = (typeof TIMER_SIZES)[number];

export const TIMER_POSITIONS = [
  "ABOVE_BUTTON",
  "BELOW_PRICE",
  "BELOW_TITLE",
] as const;
export type TimerPosition = (typeof TIMER_POSITIONS)[number];

export const NAME_MAX_LENGTH = 120;
export const URGENCY_MESSAGE_MAX_LENGTH = 280;

export interface TimerTargeting {
  type: TargetingType;
  productIds: string[];
  collectionIds: string[];
}

export interface TimerAppearance {
  backgroundColor: string;
  textColor: string;
  timerSize: TimerSize;
  position: TimerPosition;
}

export interface TimerRecord {
  _id: string;
  shop: string;
  name: string;
  type: TimerType;
  enabled: boolean;
  startAt?: string;
  endAt?: string;
  durationSeconds?: number;
  targeting: TimerTargeting;
  appearance: TimerAppearance;
  urgencyMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimerWritePayload {
  name: string;
  type: TimerType;
  enabled: boolean;
  startAt?: string;
  endAt?: string;
  durationSeconds?: number;
  targeting: TimerTargeting;
  appearance: TimerAppearance;
  urgencyMessage?: string;
}

export type TimerPatch = Partial<TimerWritePayload>;
