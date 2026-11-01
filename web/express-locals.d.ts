import type { Session } from "@shopify/shopify-api";
import "express";

declare global {
  namespace Express {
    interface Locals {
      shopify: {
        session: Session;
      };
    }
  }
}
