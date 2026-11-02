import { join } from "path";
import { readFileSync } from "fs";
import express from "express";
import serveStatic from "serve-static";

import shopify from "./shopify.js";
import productCreator from "./product-creator.js";
import PrivacyWebhookHandlers from "./privacy.js";
import { guardAdminSession } from "./admin-session.js";
import { connectDatabase } from "./db/mongoose.js";
import timerRoutes from "./routes/timer.routes.js";
import storefrontTimerRoutes from "./routes/storefront-timer.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";

interface ProductCountQueryData {
  productsCount: {
    count: number;
  };
}

const PORT = parseInt(
  process.env.BACKEND_PORT || process.env.PORT || "3000",
  10
);

const STATIC_PATH =
  process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`;

const app = express();

// Set up Shopify authentication and webhook handling
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  shopify.redirectToShopifyOrAppRoot()
);
app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({ webhookHandlers: PrivacyWebhookHandlers })
);

// App Proxy requests are signed by Shopify and do not carry an admin session token.
// This route must stay ahead of validateAuthenticatedSession.
app.use("/api/storefront/timers", storefrontTimerRoutes);

// If you are adding routes outside of the /api path, remember to
// also add a proxy rule for them in web/frontend/vite.config.js

const authenticateAdmin = shopify.validateAuthenticatedSession();
app.use("/api/*", guardAdminSession(authenticateAdmin));

app.use(express.json());

app.use("/api/timers", timerRoutes);
app.use("/api/analytics", analyticsRoutes);

app.get("/api/products/count", async (_req, res) => {
  const client = new shopify.api.clients.Graphql({
    session: res.locals.shopify.session,
  });

  const countData = await client.request<ProductCountQueryData>(`
    query shopifyProductCount {
      productsCount {
        count
      }
    }
  `);

  res.status(200).send({ count: countData.data!.productsCount.count });
});

app.post("/api/products", async (_req, res) => {
  let status = 200;
  let error: string | null = null;

  try {
    await productCreator(res.locals.shopify.session);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : undefined;
    console.log(`Failed to process products/create: ${message}`);
    status = 500;
    error = message ?? null;
  }
  res.status(status).send({ success: status === 200, error });
});

app.use(shopify.cspHeaders());
app.use(serveStatic(STATIC_PATH, { index: false }));

app.use("/*", shopify.ensureInstalledOnShop(), async (_req, res, _next) => {
  return res
    .status(200)
    .set("Content-Type", "text/html")
    .send(
      readFileSync(join(STATIC_PATH, "index.html"))
        .toString()
        .replace("%VITE_SHOPIFY_API_KEY%", process.env.SHOPIFY_API_KEY || "")
    );
});

connectDatabase()
  .then(() => {
    const server = app.listen(PORT, "127.0.0.1");
    server.on("error", (error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`HTTP server failed to start: ${message}`);
      process.exit(1);
    });
    server.on("listening", () => {
      console.log(`HTTP server listening on 127.0.0.1:${PORT}`);
    });
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Server failed to start: ${message}`);
    process.exit(1);
  });
