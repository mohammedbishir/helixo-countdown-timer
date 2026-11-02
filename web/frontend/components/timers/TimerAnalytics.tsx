import { AlphaCard, Banner, Stack, Text } from "@shopify/polaris";
import { useQuery } from "react-query";
import { TimerApiError } from "./timer-api";

interface ImpressionDay {
  date: string;
  impressions: number;
}

interface ImpressionTimer {
  timerId: string;
  name: string;
  impressions: number;
}

interface ImpressionSummary {
  from: string;
  to: string;
  totalImpressions: number;
  days: ImpressionDay[];
  timers: ImpressionTimer[];
}

export function TimerAnalytics() {
  const analyticsQuery = useQuery<ImpressionSummary, TimerApiError>({
    queryKey: ["timer-impressions"],
    queryFn: loadImpressionSummary,
    refetchOnWindowFocus: false,
  });

  if (analyticsQuery.isLoading) {
    return (
      <AlphaCard>
        <Text as="p" variant="bodyMd">
          Loading impressions…
        </Text>
      </AlphaCard>
    );
  }

  if (analyticsQuery.isError) {
    return (
      <Banner
        title="Impressions could not be loaded."
        status="warning"
        action={{ content: "Try again", onAction: () => void analyticsQuery.refetch() }}
      >
        <p>The countdown list is still available.</p>
      </Banner>
    );
  }

  const summary = analyticsQuery.data;
  if (!summary) {
    return null;
  }

  return (
    <AlphaCard>
      <Stack vertical spacing="loose">
        <Text as="h2" variant="headingMd">
          Impressions
        </Text>
        <Text as="p" variant="bodyMd">
          {summary.from} to {summary.to}: {summary.totalImpressions} total
        </Text>
        <Text as="h3" variant="headingSm">
          By timer
        </Text>
        {summary.timers.length === 0 ? (
          <Text as="p" variant="bodyMd">
            No impressions yet.
          </Text>
        ) : (
          summary.timers.map((timer) => (
            <Text key={timer.timerId} as="p" variant="bodyMd">
              {timer.name}: {timer.impressions}
            </Text>
          ))
        )}
        <Text as="h3" variant="headingSm">
          Daily counts
        </Text>
        {summary.days.length === 0 ? (
          <Text as="p" variant="bodyMd">
            No daily impressions in this range.
          </Text>
        ) : (
          summary.days.map((day) => (
            <Text key={day.date} as="p" variant="bodyMd">
              {day.date}: {day.impressions}
            </Text>
          ))
        )}
      </Stack>
    </AlphaCard>
  );
}

async function loadImpressionSummary(): Promise<ImpressionSummary> {
  const response = await fetch("/api/analytics/impressions");
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !isSummary(payload)) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "Impressions could not be loaded.";
    throw new TimerApiError(response.status, message);
  }
  return payload;
}

function isSummary(value: unknown): value is ImpressionSummary {
  if (!value || typeof value !== "object") {
    return false;
  }
  const summary = value as Partial<ImpressionSummary>;
  return (
    typeof summary.from === "string" &&
    typeof summary.to === "string" &&
    typeof summary.totalImpressions === "number" &&
    Array.isArray(summary.days) &&
    Array.isArray(summary.timers)
  );
}
