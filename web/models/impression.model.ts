import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";

export interface TimerImpression {
  shop: string;
  timerId: string;
  date: string;
  count: number;
  createdAt: Date;
  updatedAt: Date;
}

export type TimerImpressionDocument = HydratedDocument<TimerImpression>;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIMER_ID_PATTERN = /^[a-f0-9]{24}$/;

const impressionSchema = new Schema<TimerImpression>(
  {
    shop: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 255,
    },
    timerId: {
      type: String,
      required: true,
      lowercase: true,
      validate: {
        validator: (value: string) => TIMER_ID_PATTERN.test(value),
        message: "timerId must be a 24 character hex id",
      },
    },
    date: {
      type: String,
      required: true,
      validate: {
        validator: (value: string) => DATE_PATTERN.test(value),
        message: "date must be YYYY-MM-DD",
      },
    },
    count: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  { timestamps: true }
);

impressionSchema.index({ shop: 1, timerId: 1, date: 1 }, { unique: true });

const registeredImpressionModel = mongoose.models.TimerImpression;

export const ImpressionModel: Model<TimerImpression> = registeredImpressionModel
  ? (registeredImpressionModel as Model<TimerImpression>)
  : mongoose.model<TimerImpression>("TimerImpression", impressionSchema);
