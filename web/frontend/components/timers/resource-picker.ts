import type { ShopifyGlobal } from "@shopify/app-bridge-types";

export interface TimerResourcePickerRequest {
  resourceType: "product" | "collection";
  selectedIds: string[];
}

export interface PickedTimerResource {
  id: string;
  title: string;
}

export type TimerResourcePickerOutcome =
  | { status: "selected"; resources: PickedTimerResource[] }
  | { status: "cancelled" }
  | { status: "error"; message: string };

/**
 * Opens the embedded app's Shopify resource picker.
 * Cancel resolves to no change. A confirmed selection, including an empty one,
 * returns Shopify resource ids. Titles are display-only and are not identifiers.
 */
export async function requestTimerResources(
  shopify: ShopifyGlobal,
  request: TimerResourcePickerRequest
): Promise<TimerResourcePickerOutcome> {
  try {
    const selected = await openResourcePicker(shopify, request);
    if (!selected) {
      return { status: "cancelled" };
    }
    return { status: "selected", resources: uniqueResources(selected) };
  } catch (error: unknown) {
    return { status: "error", message: pickerErrorMessage(error) };
  }
}

async function openResourcePicker(
  shopify: ShopifyGlobal,
  request: TimerResourcePickerRequest
): Promise<PickedTimerResource[] | undefined> {
  const selectionIds = request.selectedIds.map((id) => ({ id }));

  if (request.resourceType === "product") {
    const selected = await shopify.resourcePicker({
      type: "product",
      action: "select",
      multiple: true,
      filter: { variants: false },
      selectionIds,
    });
    return selected?.map((resource) => ({
      id: resource.id,
      title: resource.title,
    }));
  }

  const selected = await shopify.resourcePicker({
    type: "collection",
    action: "select",
    multiple: true,
    selectionIds,
  });
  return selected?.map((resource) => ({
    id: resource.id,
    title: resource.title,
  }));
}

function uniqueResources(resources: PickedTimerResource[]): PickedTimerResource[] {
  const seen = new Set<string>();
  const unique: PickedTimerResource[] = [];

  for (const resource of resources) {
    if (resource.id.length === 0 || seen.has(resource.id)) {
      continue;
    }
    seen.add(resource.id);
    unique.push({ id: resource.id, title: resource.title });
  }

  return unique;
}

function pickerErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message.length > 0 && message.length <= 240 && !message.includes("\n")) {
      return message;
    }
  }
  return "The resource picker could not be opened. Open the app in the Shopify admin and try again.";
}
