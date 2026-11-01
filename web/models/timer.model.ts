import mongoose, {
  Schema,
  type HydratedDocument,
  type Model,
} from "mongoose";

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

export const SHOP_MAX_LENGTH = 255;
export const NAME_MAX_LENGTH = 120;
export const URGENCY_MESSAGE_MAX_LENGTH = 280;
export const RESOURCE_ID_MAX_LENGTH = 128;

const HEX_COLOR_PATTERN =
  /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

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

export interface Timer {
  shop: string;
  name: string;
  type: TimerType;
  enabled: boolean;
  startAt?: Date;
  endAt?: Date;
  durationSeconds?: number;
  targeting: TimerTargeting;
  appearance: TimerAppearance;
  urgencyMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type TimerDocument = HydratedDocument<Timer>;

function isHexColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value);
}

function isResourceIdList(ids: string[]): boolean {
  return ids.every(
    (id) =>
      id.length > 0 &&
      id.length <= RESOURCE_ID_MAX_LENGTH &&
      id.trim() === id
  );
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isValidDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

const targetingSchema = new Schema<TimerTargeting>(
  {
    type: {
      type: String,
      required: true,
      enum: TARGETING_TYPES,
    },
    productIds: {
      type: [String],
      default: () => [],
      validate: {
        validator: isResourceIdList,
        message: `Each product ID must be a non-empty string of at most ${RESOURCE_ID_MAX_LENGTH} characters`,
      },
    },
    collectionIds: {
      type: [String],
      default: () => [],
      validate: {
        validator: isResourceIdList,
        message: `Each collection ID must be a non-empty string of at most ${RESOURCE_ID_MAX_LENGTH} characters`,
      },
    },
  },
  { _id: false }
);

const appearanceSchema = new Schema<TimerAppearance>(
  {
    backgroundColor: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: isHexColor,
        message:
          "backgroundColor must be a hex color (#RGB, #RGBA, #RRGGBB, or #RRGGBBAA)",
      },
    },
    textColor: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: isHexColor,
        message:
          "textColor must be a hex color (#RGB, #RGBA, #RRGGBB, or #RRGGBBAA)",
      },
    },
    timerSize: {
      type: String,
      required: true,
      enum: TIMER_SIZES,
      default: "MEDIUM",
    },
    position: {
      type: String,
      required: true,
      enum: TIMER_POSITIONS,
      default: "BELOW_PRICE",
    },
  },
  { _id: false }
);

const timerSchema = new Schema<Timer>(
  {
    shop: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: SHOP_MAX_LENGTH,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: NAME_MAX_LENGTH,
    },
    type: {
      type: String,
      required: true,
      enum: TIMER_TYPES,
    },
    enabled: {
      type: Boolean,
      required: true,
      default: true,
    },
    startAt: {
      type: Date,
    },
    endAt: {
      type: Date,
    },
    durationSeconds: {
      type: Number,
      validate: {
        validator: isPositiveInteger,
        message: "durationSeconds must be a positive integer",
      },
    },
    targeting: {
      type: targetingSchema,
      required: true,
    },
    appearance: {
      type: appearanceSchema,
      required: true,
    },
    urgencyMessage: {
      type: String,
      trim: true,
      maxlength: URGENCY_MESSAGE_MAX_LENGTH,
    },
  },
  { timestamps: true }
);

timerSchema.index({ shop: 1, createdAt: -1 });
timerSchema.index({ shop: 1, enabled: 1 });

timerSchema.pre("validate", function () {
  if (this.type === "FIXED") {
    if (!isValidDate(this.startAt)) {
      this.invalidate("startAt", "FIXED timers require startAt");
    }
    if (!isValidDate(this.endAt)) {
      this.invalidate("endAt", "FIXED timers require endAt");
    }
    if (
      isValidDate(this.startAt) &&
      isValidDate(this.endAt) &&
      this.endAt.getTime() <= this.startAt.getTime()
    ) {
      this.invalidate("endAt", "endAt must be later than startAt");
    }
  }

  if (this.type === "EVERGREEN" && this.durationSeconds == null) {
    this.invalidate(
      "durationSeconds",
      "EVERGREEN timers require a positive durationSeconds"
    );
  }

  if (this.targeting?.type === "PRODUCTS" && this.targeting.productIds.length === 0) {
    this.invalidate(
      "targeting.productIds",
      "PRODUCTS targeting requires at least one product ID"
    );
  }

  if (
    this.targeting?.type === "COLLECTIONS" &&
    this.targeting.collectionIds.length === 0
  ) {
    this.invalidate(
      "targeting.collectionIds",
      "COLLECTIONS targeting requires at least one collection ID"
    );
  }
});

const registeredTimerModel = mongoose.models.Timer;

export const TimerModel: Model<Timer> = registeredTimerModel
  ? (registeredTimerModel as Model<Timer>)
  : mongoose.model<Timer>("Timer", timerSchema);
