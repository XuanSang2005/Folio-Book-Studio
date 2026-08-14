import { randomBytes } from "node:crypto";

export interface SessionTokenGenerator {
  generate(): string;
}

export const secureSessionTokenGenerator: SessionTokenGenerator = {
  generate: () => randomBytes(32).toString("base64url"),
};
