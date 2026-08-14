import type { Writable } from "node:stream";
import type { Environment } from "../config/env.js";

const REDACTED = "[REDACTED]";

export function createSafeLoggerOptions(
  config: Pick<Environment, "LOG_LEVEL">,
  stream?: Writable,
) {
  return {
    level: config.LOG_LEVEL,
    ...(stream ? { stream } : {}),
    redact: {
      censor: REDACTED,
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers['x-goog-api-key']",
        "request.headers.authorization",
        "request.headers.cookie",
        "request.headers['x-goog-api-key']",
        "res.headers['set-cookie']",
        "headers.authorization",
        "headers.cookie",
        "headers['x-goog-api-key']",
        "GEMINI_API_KEY",
        "apiKey",
        "sessionToken",
        "token",
        "manuscript",
        "text",
        "bytes",
        "base64",
        "prompt",
        "rawProviderResponse",
        "body",
        "payload",
      ],
    },
    serializers: {
      req(request: {
        method?: string;
        url?: string;
        headers?: { host?: string };
        socket?: { remoteAddress?: string; remotePort?: number };
      }) {
        return {
          method: request.method,
          url: request.url,
          host: request.headers?.host,
          remoteAddress: request.socket?.remoteAddress,
          remotePort: request.socket?.remotePort,
        };
      },
      res(reply: { statusCode?: number }) {
        return { statusCode: reply.statusCode };
      },
      err(error: Error & { code?: string }) {
        return {
          type: error.name,
          message: "Error details redacted",
          stack: REDACTED,
          code: error.code,
        };
      },
    },
  };
}
