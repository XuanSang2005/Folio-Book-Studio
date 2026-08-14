import {
  ApiErrorEnvelopeSchema,
  EndSessionResponseSchema,
  ManuscriptResponseSchema,
  ProjectDetailDtoSchema,
  ProjectListResponseSchema,
  SessionDtoSchema,
  StepActionResponseSchema,
  type ApiErrorCode,
  type CreateSessionRequest,
  type ManuscriptResponse,
  type PipelineStepOrdinal,
  type ProjectDetailDto,
  type ProjectListResponse,
  type RunProjectStepRequest,
  type SessionDto,
  type StepActionResponse,
} from "@gradion-folio/contracts";

const READ_TIMEOUT_MS = 10_000;

type Parser<T> = { parse: (value: unknown) => T };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions<T> = Omit<RequestInit, "credentials"> & {
  schema: Parser<T>;
  timeoutMs?: number | null;
};

async function request<T>(path: string, options: RequestOptions<T>): Promise<T> {
  const { schema, timeoutMs: configuredTimeout, ...requestInit } = options;
  const controller = new AbortController();
  const externalSignal = requestInit.signal;
  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromExternal();
  else externalSignal?.addEventListener("abort", abortFromExternal, { once: true });

  const timeoutMs = configuredTimeout === undefined ? READ_TIMEOUT_MS : configuredTimeout;
  const timeout = timeoutMs === null
    ? undefined
    : window.setTimeout(() => controller.abort(new DOMException("Request timed out.", "TimeoutError")), timeoutMs);

  try {
    const response = await fetch(path, {
      ...requestInit,
      credentials: "same-origin",
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const parsed = ApiErrorEnvelopeSchema.safeParse(payload);
      if (parsed.success) {
        throw new ApiError(
          response.status,
          parsed.data.error.code,
          parsed.data.error.message,
          parsed.data.error.fieldErrors,
        );
      }
      throw new ApiError(response.status, "INTERNAL_ERROR", "The request could not be completed.");
    }
    return schema.parse(payload);
  } finally {
    if (timeout !== undefined) window.clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}

function jsonBody(value: unknown): Pick<RequestInit, "body" | "headers"> {
  return {
    body: JSON.stringify(value),
    headers: { "Content-Type": "application/json" },
  };
}

export function getSession(signal?: AbortSignal): Promise<SessionDto> {
  return request("/api/session", { method: "GET", schema: SessionDtoSchema, signal });
}

export function createSession(input: CreateSessionRequest): Promise<SessionDto> {
  return request("/api/session", {
    method: "POST",
    schema: SessionDtoSchema,
    ...jsonBody(input),
  });
}

export function endSession(): Promise<{ signedOut: true }> {
  return request("/api/session", { method: "DELETE", schema: EndSessionResponseSchema });
}

export function listProjects(signal?: AbortSignal): Promise<ProjectListResponse> {
  return request("/api/projects", { method: "GET", schema: ProjectListResponseSchema, signal });
}

export function getProject(projectId: string, signal?: AbortSignal): Promise<ProjectDetailDto> {
  return request(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: "GET",
    schema: ProjectDetailDtoSchema,
    signal,
  });
}

export function getManuscript(projectId: string, signal?: AbortSignal): Promise<ManuscriptResponse> {
  return request(`/api/projects/${encodeURIComponent(projectId)}/manuscript`, {
    method: "GET",
    schema: ManuscriptResponseSchema,
    signal,
  });
}

export function createPasteProject(input: {
  title: string;
  sourceMode: "paste";
  text: string;
}): Promise<ProjectDetailDto> {
  return request("/api/projects", {
    method: "POST",
    schema: ProjectDetailDtoSchema,
    ...jsonBody(input),
  });
}

export function createUploadProject(input: {
  title: string;
  sourceMode: "upload";
  file: File;
}): Promise<ProjectDetailDto> {
  const body = new FormData();
  body.append("title", input.title);
  body.append("sourceMode", input.sourceMode);
  body.append("file", input.file);
  return request("/api/projects", {
    method: "POST",
    schema: ProjectDetailDtoSchema,
    body,
  });
}

export function runProjectStep(
  projectId: string,
  ordinal: PipelineStepOrdinal,
  input: RunProjectStepRequest,
): Promise<StepActionResponse> {
  return request(
    `/api/projects/${encodeURIComponent(projectId)}/steps/${ordinal}/run`,
    {
      method: "POST",
      schema: StepActionResponseSchema,
      timeoutMs: null,
      ...jsonBody(input),
    },
  );
}

export function recoverProjectStep(
  projectId: string,
  ordinal: PipelineStepOrdinal,
): Promise<StepActionResponse> {
  return request(
    `/api/projects/${encodeURIComponent(projectId)}/steps/${ordinal}/recover`,
    {
      method: "POST",
      schema: StepActionResponseSchema,
      ...jsonBody({}),
    },
  );
}
