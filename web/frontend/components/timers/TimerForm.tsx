import { useEffect, useState } from "react";
import type { MutableRefObject, ReactNode } from "react";
import {
  AlphaCard,
  Banner,
  Button,
  ButtonGroup,
  Checkbox,
  FormLayout,
  Select,
  Stack,
  Text,
  TextField,
} from "@shopify/polaris";
import { TimerResourceField } from "./TimerResourceField";
import {
  buildTimerPayload,
  emptyTimerForm,
  isTimerPayload,
  type TimerFieldErrors,
  type TimerFormState,
} from "./timer-form";
import type { TimerWritePayload } from "./types";
import {
  isTargetingType,
  isTimerPosition,
  isTimerSize,
  isTimerType,
} from "./timer-api";

interface TimerFormProps {
  initialState?: TimerFormState;
  submitting: boolean;
  serverError: string | null;
  serverDetails: string[];
  submitAction?: MutableRefObject<(() => void) | null>;
  onSubmit: (payload: TimerWritePayload) => void;
  onCancel: () => void;
}

const TYPE_OPTIONS = [
  { label: "Fixed dates", value: "FIXED" },
  { label: "Evergreen", value: "EVERGREEN" },
];

const TARGETING_OPTIONS = [
  { label: "All products", value: "ALL" },
  { label: "Specific products", value: "PRODUCTS" },
  { label: "Collections", value: "COLLECTIONS" },
];

const SIZE_OPTIONS = [
  { label: "Small", value: "SMALL" },
  { label: "Medium", value: "MEDIUM" },
  { label: "Large", value: "LARGE" },
];

const POSITION_OPTIONS = [
  { label: "Above the add-to-cart button", value: "ABOVE_BUTTON" },
  { label: "Below the price", value: "BELOW_PRICE" },
  { label: "Below the title", value: "BELOW_TITLE" },
];

export function TimerForm({
  initialState,
  submitting,
  serverError,
  serverDetails,
  submitAction,
  onSubmit,
  onCancel,
}: TimerFormProps) {
  const [form, setForm] = useState<TimerFormState>(initialState ?? emptyTimerForm());
  const [errors, setErrors] = useState<TimerFieldErrors>({});

  const update = (patch: Partial<TimerFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const handleSubmit = () => {
    const result = buildTimerPayload(form);
    if (!isTimerPayload(result)) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSubmit(result.payload);
  };

  useEffect(() => {
    if (!submitAction) {
      return;
    }
    submitAction.current = handleSubmit;
    return () => {
      submitAction.current = null;
    };
  });

  return (
    <Stack vertical spacing="loose">
      {serverError ? (
        <Banner title={serverError} status="critical">
          {serverDetails.length > 0 ? (
            <ul>
              {serverDetails.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          ) : (
            <p>Check the form and try again.</p>
          )}
        </Banner>
      ) : null}
      <AlphaCard>
        <FormLayout>
          <TextField
            label="Timer name"
            value={form.name}
            error={errors.name}
            autoComplete="off"
            maxLength={120}
            onChange={(value) => update({ name: value })}
          />
          <Select
            label="Timer type"
            options={TYPE_OPTIONS}
            value={form.type}
            onChange={(value) => {
              if (isTimerType(value)) {
                update({ type: value });
              }
            }}
          />
          <Checkbox
            label="Enabled"
            checked={form.enabled}
            helpText="Disabled timers stay saved but are not treated as active."
            onChange={(checked) => update({ enabled: checked })}
          />
          {form.type === "FIXED" ? (
            <FormLayout.Group>
              <TextField
                label="Start"
                type="datetime-local"
                value={form.startAt}
                error={errors.startAt}
                autoComplete="off"
                onChange={(value) => update({ startAt: value })}
              />
              <TextField
                label="End"
                type="datetime-local"
                value={form.endAt}
                error={errors.endAt}
                autoComplete="off"
                onChange={(value) => update({ endAt: value })}
              />
            </FormLayout.Group>
          ) : (
            <FormLayout.Group>
              <TextField
                label="Hours"
                type="integer"
                value={form.hours}
                error={errors.duration}
                autoComplete="off"
                min={0}
                onChange={(value) => update({ hours: value })}
              />
              <TextField
                label="Minutes"
                type="integer"
                value={form.minutes}
                autoComplete="off"
                min={0}
                max={59}
                onChange={(value) => update({ minutes: value })}
              />
              <TextField
                label="Seconds"
                type="integer"
                value={form.seconds}
                autoComplete="off"
                min={0}
                max={59}
                onChange={(value) => update({ seconds: value })}
              />
            </FormLayout.Group>
          )}
          <Select
            label="Targeting"
            options={TARGETING_OPTIONS}
            value={form.targetingType}
            error={errors.targeting}
            onChange={(value) => {
              if (!isTargetingType(value)) {
                return;
              }
              if (value === "ALL") {
                update({
                  targetingType: value,
                  productIds: [],
                  collectionIds: [],
                });
                return;
              }
              update({ targetingType: value });
            }}
          />
          <TimerResourceField
            targetingType={form.targetingType}
            productIds={form.productIds}
            collectionIds={form.collectionIds}
            error={errors.targeting}
            onChange={(selection) => update(selection)}
          />
          <ColorField
            label="Background color"
            value={form.backgroundColor}
            error={errors.backgroundColor}
            onChange={(backgroundColor) => update({ backgroundColor })}
          />
          <ColorField
            label="Text color"
            value={form.textColor}
            error={errors.textColor}
            onChange={(textColor) => update({ textColor })}
          />
          <Select
            label="Timer size"
            options={SIZE_OPTIONS}
            value={form.timerSize}
            onChange={(value) => {
              if (isTimerSize(value)) {
                update({ timerSize: value });
              }
            }}
          />
          <Select
            label="Position"
            options={POSITION_OPTIONS}
            value={form.position}
            onChange={(value) => {
              if (isTimerPosition(value)) {
                update({ position: value });
              }
            }}
          />
          <TextField
            label="Urgency message"
            value={form.urgencyMessage}
            error={errors.urgencyMessage}
            autoComplete="off"
            multiline={3}
            maxLength={280}
            helpText="Optional. Shown with the countdown."
            onChange={(value) => update({ urgencyMessage: value })}
          />
          <AppearancePreview form={form} />
          <ButtonGroup>
            <Button primary loading={submitting} onClick={handleSubmit}>
              Save timer
            </Button>
            <Button disabled={submitting} onClick={onCancel}>
              Cancel
            </Button>
          </ButtonGroup>
        </FormLayout>
      </AlphaCard>
    </Stack>
  );
}

function ColorField({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextField
      label={label}
      value={value}
      error={error}
      autoComplete="off"
      helpText="Hex color, such as #111111 or #fff."
      prefix={
        <input
          aria-label={`${label} picker`}
          type="color"
          value={toColorInputValue(value)}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      }
      onChange={onChange}
    />
  );
}

function AppearancePreview({ form }: { form: TimerFormState }) {
  return (
    <Stack vertical spacing="tight">
      <Text as="h3" variant="headingSm">
        Appearance preview
      </Text>
      <div
        style={{
          background: form.backgroundColor,
          color: form.textColor,
          borderRadius: "8px",
          padding: "12px 16px",
        }}
      >
        <PreviewText>{form.name.trim() || "Countdown timer"}</PreviewText>
        <PreviewText>{form.urgencyMessage.trim() || "Offer ends soon"}</PreviewText>
      </div>
    </Stack>
  );
}

function PreviewText({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}

function toColorInputValue(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#111111";
}
