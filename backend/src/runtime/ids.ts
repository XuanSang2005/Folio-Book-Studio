import { randomUUID } from "node:crypto";

export interface IdGenerator {
  generate(): string;
}

export const uuidIdGenerator: IdGenerator = {
  generate: () => randomUUID(),
};
