import { useState } from "react";
import { Button, Stack, Text } from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { requestTimerResources } from "./resource-picker";
import type { TargetingType } from "./types";

interface TimerResourceFieldProps {
  targetingType: TargetingType;
  productIds: string[];
  collectionIds: string[];
  error?: string;
  onChange: (selection: { productIds: string[]; collectionIds: string[] }) => void;
}

export function TimerResourceField({
  targetingType,
  productIds,
  collectionIds,
  error,
  onChange,
}: TimerResourceFieldProps) {
  const shopify = useAppBridge();
  const [picking, setPicking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const resourceType = targetingType === "COLLECTIONS" ? "collection" : "product";
  const selectedIds = resourceType === "collection" ? collectionIds : productIds;
  const resourceLabel = resourceType === "collection" ? "collection" : "product";

  if (targetingType === "ALL") {
    return (
      <Text as="p" variant="bodyMd">
        This timer can appear on every product.
      </Text>
    );
  }

  const handleChoose = () => {
    setPicking(true);
    setNotice(null);
    void requestTimerResources(shopify, {
      resourceType,
      selectedIds,
    })
      .then((outcome) => {
        if (outcome.status === "cancelled") {
          setNotice("Selection cancelled. The current resources were kept.");
          return;
        }
        if (outcome.status === "error") {
          setNotice(outcome.message);
          return;
        }

        setTitles((current) => {
          const next = { ...current };
          for (const resource of outcome.resources) {
            if (resource.title.trim().length > 0) {
              next[resource.id] = resource.title;
            }
          }
          return next;
        });
        setNotice(null);
        const ids = outcome.resources.map((resource) => resource.id);
        if (resourceType === "collection") {
          onChange({ productIds, collectionIds: ids });
          return;
        }
        onChange({ productIds: ids, collectionIds });
      })
      .finally(() => {
        setPicking(false);
      });
  };

  return (
    <Stack vertical spacing="tight">
      <Text as="p" variant="bodyMd">
        {selectedIds.length === 0
          ? `No ${resourceLabel}s selected.`
          : `${selectedIds.length} ${resourceLabel}${selectedIds.length === 1 ? "" : "s"} selected.`}
      </Text>
      {selectedIds.length > 0 ? (
        <Stack vertical spacing="extraTight">
          {selectedIds.map((id) => (
            <Text key={id} as="p" variant="bodyMd">
              {titles[id] ? `${titles[id]} (${id})` : id}
            </Text>
          ))}
        </Stack>
      ) : null}
      <Button loading={picking} onClick={handleChoose}>
        {resourceType === "collection" ? "Choose collections" : "Choose products"}
      </Button>
      {notice ? (
        <Text as="p" variant="bodyMd" color="subdued">
          {notice}
        </Text>
      ) : null}
      {error ? (
        <Text as="p" variant="bodyMd" color="critical">
          {error}
        </Text>
      ) : null}
    </Stack>
  );
}
