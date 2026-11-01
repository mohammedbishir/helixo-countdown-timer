import { InvalidHmacError, type AuthQuery, type Shopify } from "@shopify/shopify-api";
import type { Request } from "express";

export type AppProxyFailure = {
  ok: false;
  status: 400 | 401;
  error: string;
};

export type VerifiedAppProxy = {
  ok: true;
  shop: string;
  productId: string;
};

export type AppProxyVerification = VerifiedAppProxy | AppProxyFailure;

export function isAppProxyFailure(
  result: AppProxyVerification
): result is AppProxyFailure {
  return result.ok === false;
}

export async function verifyAppProxyRequest(
  utils: Shopify["utils"],
  query: Request["query"],
  normalizeProductId: (value: string) => string | null
): Promise<AppProxyVerification> {
  const authQuery = toAuthQuery(query);
  if (!authQuery) {
    return { ok: false, status: 401, error: "Invalid app proxy signature" };
  }

  try {
    const valid = await utils.validateHmac(authQuery, { signator: "appProxy" });
    if (!valid) {
      return { ok: false, status: 401, error: "Invalid app proxy signature" };
    }
  } catch (error: unknown) {
    if (error instanceof InvalidHmacError) {
      return { ok: false, status: 401, error: "Invalid app proxy signature" };
    }
    throw error;
  }

  const shop = typeof authQuery.shop === "string" ? utils.sanitizeShop(authQuery.shop) : null;
  if (!shop) {
    return { ok: false, status: 400, error: "Shop is invalid" };
  }

  const rawProductId = authQuery.product_id;
  if (typeof rawProductId !== "string" || rawProductId.trim().length === 0) {
    return { ok: false, status: 400, error: "Product ID is required" };
  }

  const productId = normalizeProductId(rawProductId);
  if (!productId) {
    return { ok: false, status: 400, error: "Product ID is invalid" };
  }

  return { ok: true, shop, productId };
}

function toAuthQuery(query: Request["query"]): AuthQuery | null {
  const authQuery: AuthQuery = {};

  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") {
      authQuery[key] = value;
      continue;
    }

    if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      authQuery[key] = value.join(",");
      continue;
    }

    return null;
  }

  return authQuery;
}
