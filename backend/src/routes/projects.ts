import {
  CreatePasteProjectRequestSchema,
  CreateUploadProjectFieldsSchema,
  ProjectRouteParamsSchema,
  type ManuscriptResponse,
  type ProjectDetailDto,
  type ProjectListResponse,
} from "@gradion-folio/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ZodError, z } from "zod";
import { requireSession } from "../identity/session-service.js";
import {
  createProject,
  getManuscript,
  getProject,
  listProjects,
} from "../projects/project-service.js";
import type { ApplicationDependencies } from "../runtime/dependencies.js";

type UploadSource = {
  title: string;
  originalName: string;
  mimeType: string;
  bytes: Uint8Array;
};

function authenticatedUserId(
  request: FastifyRequest,
  dependencies: ApplicationDependencies,
): string {
  return requireSession(
    dependencies,
    request.cookies[dependencies.config.COOKIE_NAME],
  ).user.id;
}

async function parseUpload(
  request: FastifyRequest,
  dependencies: ApplicationDependencies,
): Promise<UploadSource> {
  const fields: Record<string, string> = {};
  let file: Omit<UploadSource, "title"> | undefined;

  for await (const part of request.parts({
    limits: {
      files: 2,
      fields: 4,
      parts: 6,
      fieldNameSize: 100,
      fieldSize: 1_024,
      fileSize: dependencies.config.MAX_SOURCE_BYTES,
    },
  })) {
    if (part.type === "file") {
      if (file) {
        for await (const _chunk of part.file) void _chunk;
        throw new z.ZodError([{
          code: "custom",
          path: ["file"],
          message: "Exactly one manuscript file is required.",
        }]);
      }
      const chunks: Buffer[] = [];
      for await (const chunk of part.file) chunks.push(chunk);
      if (part.file.truncated) {
        throw new z.ZodError([{
          code: "custom",
          path: ["file"],
          message: "Manuscript exceeds the configured upload limit.",
        }]);
      }
      file = {
        originalName: part.filename,
        mimeType: part.mimetype,
        bytes: Buffer.concat(chunks),
      };
    } else {
      if (typeof part.value !== "string" || fields[part.fieldname] !== undefined) {
        throw new z.ZodError([{
          code: "custom",
          path: [part.fieldname],
          message: "Multipart fields must be unique text values.",
        }]);
      }
      fields[part.fieldname] = part.value;
    }
  }

  const parsed = CreateUploadProjectFieldsSchema.parse(fields);
  if (!file) {
    throw new ZodError([{
      code: "custom",
      path: ["file"],
      message: "Exactly one manuscript file is required.",
    }]);
  }
  dependencies.localFiles.validateUploadMetadata(file.originalName, file.mimeType);
  return { ...file, title: parsed.title };
}

export async function registerProjectRoutes(
  app: FastifyInstance,
  { dependencies }: { dependencies: ApplicationDependencies },
) {
  app.get("/api/projects", async (request): Promise<ProjectListResponse> => ({
    projects: listProjects(dependencies, authenticatedUserId(request, dependencies)),
  }));

  app.post("/api/projects", async (request, reply): Promise<ProjectDetailDto> => {
    const userId = authenticatedUserId(request, dependencies);

    if (request.isMultipart()) {
      const upload = await parseUpload(request, dependencies);
      const project = await createProject(dependencies, {
        userId,
        title: upload.title,
        sourceMode: "upload",
        originalName: upload.originalName,
        bytes: upload.bytes,
      });
      return reply.code(201).send(project);
    }

    const input = CreatePasteProjectRequestSchema.parse(request.body);
    const project = await createProject(dependencies, {
      userId,
      title: input.title,
      sourceMode: "paste",
      originalName: null,
      bytes: new TextEncoder().encode(input.text),
    });
    return reply.code(201).send(project);
  });

  app.get("/api/projects/:projectId", async (request): Promise<ProjectDetailDto> => {
    const userId = authenticatedUserId(request, dependencies);
    const { projectId } = ProjectRouteParamsSchema.parse(request.params);
    return getProject(dependencies, userId, projectId);
  });

  app.get(
    "/api/projects/:projectId/manuscript",
    async (request, reply): Promise<ManuscriptResponse> => {
      const userId = authenticatedUserId(request, dependencies);
      const { projectId } = ProjectRouteParamsSchema.parse(request.params);
      const text = await getManuscript(dependencies, userId, projectId);
      reply.header("Cache-Control", "private, no-store");
      reply.header("X-Content-Type-Options", "nosniff");
      return { text };
    },
  );
}
