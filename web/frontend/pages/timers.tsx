import { useRef, useState } from "react";
import {
  AlphaCard,
  Badge,
  Banner,
  Button,
  ButtonGroup,
  IndexTable,
  Page,
  Spinner,
  Stack,
  Text,
  TextField,
} from "@shopify/polaris";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { TimerForm } from "../components/timers/TimerForm";
import { TimerAnalytics } from "../components/timers/TimerAnalytics";
import {
  TimerApiError,
  createTimer,
  deleteTimer,
  getTimer,
  listTimers,
  updateTimer,
} from "../components/timers/timer-api";
import { formatSchedule, timerDisplayStatus } from "../components/timers/timer-status";
import { timerToForm } from "../components/timers/timer-form";
import type { TimerRecord, TimerWritePayload } from "../components/timers/types";

type EditorState =
  | { mode: "list" }
  | { mode: "create" }
  | { mode: "edit"; id: string };

const TABLE_HEADINGS: [
  { title: string },
  { title: string },
  { title: string },
  { title: string },
  { title: string },
  { title: string },
] = [
  { title: "Name" },
  { title: "Type" },
  { title: "Status" },
  { title: "Schedule" },
  { title: "Enabled" },
  { title: "Actions" },
];

export default function TimersPage() {
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<EditorState>({ mode: "list" });
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TimerRecord | null>(null);
  const submitTimer = useRef<(() => void) | null>(null);

  const timersQuery = useQuery<TimerRecord[], TimerApiError>({
    queryKey: ["timers"],
    queryFn: listTimers,
    refetchOnWindowFocus: false,
  });

  const editQuery = useQuery<TimerRecord, TimerApiError>({
    queryKey: ["timers", editor.mode === "edit" ? editor.id : "new"],
    queryFn: () => {
      if (editor.mode !== "edit") {
        throw new TimerApiError(400, "No timer selected.");
      }
      return getTimer(editor.id);
    },
    enabled: editor.mode === "edit",
    refetchOnWindowFocus: false,
  });

  const refreshTimers = async () => {
    await queryClient.invalidateQueries(["timers"]);
  };

  const saveMutation = useMutation<
    TimerRecord,
    TimerApiError,
    { id?: string; payload: TimerWritePayload }
  >({
    mutationFn: (input) =>
      input.id ? updateTimer(input.id, input.payload) : createTimer(input.payload),
    onSuccess: async () => {
      await refreshTimers();
      setEditor({ mode: "list" });
    },
  });

  const enabledMutation = useMutation<
    TimerRecord,
    TimerApiError,
    { id: string; enabled: boolean }
  >({
    mutationFn: (input) => updateTimer(input.id, { enabled: input.enabled }),
    onSuccess: refreshTimers,
  });

  const deleteMutation = useMutation<void, TimerApiError, string>({
    mutationFn: deleteTimer,
    onSuccess: async () => {
      setDeleteTarget(null);
      await refreshTimers();
    },
  });

  const timers = timersQuery.data ?? [];
  const normalizedSearch = search.trim().toLowerCase();
  const visibleTimers = timers.filter((timer) =>
    timer.name.toLowerCase().includes(normalizedSearch)
  );

  const closeEditor = () => {
    saveMutation.reset();
    setEditor({ mode: "list" });
  };

  if (editor.mode === "create" || editor.mode === "edit") {
    const editing = editor.mode === "edit";
    const loadingTimer = editing && editQuery.isLoading;
    const editFailed = editing && editQuery.isError;
    const serverError = mutationError(saveMutation.error);
    return (
      <Page
        title={editing ? "Edit timer" : "Create timer"}
        backAction={{ content: "Countdown timers", onAction: closeEditor }}
        primaryAction={{
          content: "Save timer",
          loading: saveMutation.isLoading,
          disabled: loadingTimer || editFailed,
          onAction: () => submitTimer.current?.(),
        }}
      >
        {loadingTimer ? (
          <LoadingState label="Loading timer" />
        ) : editFailed ? (
          <Banner
            title={errorText(editQuery.error, "This timer could not be opened.")}
            status="critical"
            action={{ content: "Back to timers", onAction: closeEditor }}
          >
            <p>This timer could not be opened.</p>
          </Banner>
        ) : (
          <TimerForm
            key={editing ? editor.id : "new"}
            initialState={editing && editQuery.data ? timerToForm(editQuery.data) : undefined}
            submitting={saveMutation.isLoading}
            serverError={serverError.message}
            serverDetails={serverError.details}
            submitAction={submitTimer}
            onCancel={closeEditor}
            onSubmit={(payload) =>
              saveMutation.mutate({
                ...(editing ? { id: editor.id } : {}),
                payload,
              })
            }
          />
        )}
      </Page>
    );
  }

  return (
    <Page
      fullWidth
      title="Countdown Timer Manager"
      primaryAction={{
        content: "Create timer",
        onAction: () => {
          saveMutation.reset();
          setEditor({ mode: "create" });
        },
      }}
    >
      <Stack vertical spacing="loose">
        <TimerAnalytics />
        {timersQuery.isLoading ? <LoadingState label="Loading timers" /> : null}
        {timersQuery.isError ? (
          <Banner
            title={errorText(timersQuery.error, "The timer list could not be loaded.")}
            status="critical"
            action={{ content: "Try again", onAction: () => void timersQuery.refetch() }}
          >
            <p>The timer list could not be loaded.</p>
          </Banner>
        ) : null}
        {enabledMutation.isError ? (
          <Banner
            title={errorText(enabledMutation.error, "The timer could not be updated.")}
            status="critical"
          />
        ) : null}
        {deleteMutation.isError ? (
          <Banner
            title={errorText(deleteMutation.error, "The timer could not be deleted.")}
            status="critical"
          />
        ) : null}
        {deleteTarget ? (
          <Banner
            title={`Delete ${deleteTarget.name}?`}
            status="critical"
            onDismiss={() => setDeleteTarget(null)}
          >
            <p>This removes the timer for this shop.</p>
            <Button
              destructive
              loading={deleteMutation.isLoading}
              onClick={() => deleteMutation.mutate(deleteTarget._id)}
            >
              Delete timer
            </Button>
          </Banner>
        ) : null}
        {!timersQuery.isLoading && !timersQuery.isError && timers.length === 0 ? (
          <AlphaCard>
            <Stack vertical spacing="tight">
              <Text as="h2" variant="headingMd">
                No countdown timers yet
              </Text>
              <Text as="p" variant="bodyMd">
                Create a timer to count down to a fixed end time or for a set duration.
              </Text>
              <Button primary onClick={() => setEditor({ mode: "create" })}>
                Create timer
              </Button>
            </Stack>
          </AlphaCard>
        ) : null}
        {!timersQuery.isLoading && !timersQuery.isError && timers.length > 0 ? (
          <Stack vertical spacing="tight">
            <TextField
              label="Search timers"
              labelHidden
              placeholder="Search by timer name"
              type="search"
              value={search}
              autoComplete="off"
              clearButton
              onClearButtonClick={() => setSearch("")}
              onChange={setSearch}
            />
            {visibleTimers.length === 0 ? (
              <AlphaCard>
                <Text as="p" variant="bodyMd">
                  No timers match that name.
                </Text>
              </AlphaCard>
            ) : (
              <IndexTable
                resourceName={{ singular: "timer", plural: "timers" }}
                itemCount={visibleTimers.length}
                selectedItemsCount={0}
                selectable={false}
                headings={TABLE_HEADINGS}
              >
                {visibleTimers.map((timer, index) => {
                  const status = timerDisplayStatus(timer);
                  const enabledPending =
                    enabledMutation.isLoading && enabledMutation.variables?.id === timer._id;
                  return (
                    <IndexTable.Row id={timer._id} key={timer._id} position={index}>
                      <IndexTable.Cell>
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          {timer.name}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {timer.type === "FIXED" ? "Fixed" : "Evergreen"}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge status={statusTone(status)}>{status}</Badge>
                      </IndexTable.Cell>
                      <IndexTable.Cell>{formatSchedule(timer)}</IndexTable.Cell>
                      <IndexTable.Cell>{timer.enabled ? "Enabled" : "Disabled"}</IndexTable.Cell>
                      <IndexTable.Cell>
                        <ButtonGroup>
                          <Button
                            size="slim"
                            onClick={() => {
                              saveMutation.reset();
                              setEditor({ mode: "edit", id: timer._id });
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            size="slim"
                            loading={enabledPending}
                            onClick={() =>
                              enabledMutation.mutate({
                                id: timer._id,
                                enabled: !timer.enabled,
                              })
                            }
                          >
                            {timer.enabled ? "Disable" : "Enable"}
                          </Button>
                          <Button
                            size="slim"
                            destructive
                            onClick={() => setDeleteTarget(timer)}
                          >
                            Delete
                          </Button>
                        </ButtonGroup>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  );
                })}
              </IndexTable>
            )}
          </Stack>
        ) : null}
      </Stack>
    </Page>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <Stack distribution="center">
      <Spinner accessibilityLabel={label} />
    </Stack>
  );
}

function statusTone(status: ReturnType<typeof timerDisplayStatus>) {
  if (status === "Active") {
    return "success" as const;
  }
  if (status === "Scheduled") {
    return "info" as const;
  }
  if (status === "Ended") {
    return "critical" as const;
  }
  return undefined;
}

function mutationError(error: unknown): {
  message: string | null;
  details: string[];
} {
  if (!error) {
    return { message: null, details: [] };
  }
  if (error instanceof TimerApiError) {
    return { message: error.message, details: error.details };
  }
  return { message: errorText(error, "The timer could not be saved."), details: [] };
}

function errorText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}
