import { randomUUID } from "node:crypto";

export interface AttemptIdGenerator {
  generate(): string;
}

export const secureAttemptIdGenerator: AttemptIdGenerator = {
  generate: () => randomUUID(),
};
