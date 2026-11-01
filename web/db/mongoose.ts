import { existsSync, readFileSync } from "fs";
import { join } from "path";
import mongoose from "mongoose";

let connectPromise: Promise<void> | undefined;
let statusLoggingRegistered = false;

function readMongoUriFromEnvFile(filePath: string): string | undefined {
  if (!existsSync(filePath)) {
    return undefined;
  }

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    if (key !== "MONGODB_URI") {
      continue;
    }

    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    return value || undefined;
  }

  return undefined;
}

function resolveMongoUri(): string | undefined {
  if (process.env.MONGODB_URI) {
    return process.env.MONGODB_URI;
  }

  // Local Shopify CLI starts this process in web/ and does not forward custom
  // variables. Docker and other hosts set MONGODB_URI directly, so this file
  // lookup is skipped when the variable is already present.
  const candidates = [
    join(process.cwd(), ".env"),
    join(process.cwd(), "..", ".env"),
  ];

  for (const filePath of candidates) {
    const uri = readMongoUriFromEnvFile(filePath);
    if (uri) {
      return uri;
    }
  }

  return undefined;
}

function registerStatusLogging(): void {
  if (statusLoggingRegistered) {
    return;
  }
  statusLoggingRegistered = true;

  mongoose.connection.on("connected", () => {
    console.log(
      `MongoDB connected to database "${mongoose.connection.name}"`
    );
  });

  mongoose.connection.on("disconnected", () => {
    console.log("MongoDB disconnected");
  });

  mongoose.connection.on("error", (error: Error) => {
    console.error(`MongoDB connection error: ${error.message}`);
  });
}

export function connectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === mongoose.ConnectionStates.connected) {
    return Promise.resolve();
  }

  if (connectPromise) {
    return connectPromise;
  }

  const uri = resolveMongoUri();
  if (!uri) {
    return Promise.reject(
      new Error(
        "MONGODB_URI is not set. Set it in the environment before starting the server."
      )
    );
  }

  registerStatusLogging();

  connectPromise = mongoose
    .connect(uri, { serverSelectionTimeoutMS: 10000 })
    .then(() => undefined)
    .catch((error: unknown) => {
      connectPromise = undefined;
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`MongoDB connection failed: ${message}`);
      throw error;
    });

  return connectPromise;
}
