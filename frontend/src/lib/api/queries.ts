import { queryOptions } from "@tanstack/react-query";
import { getManuscript, getProject, getSession, listProjects } from "./client";
import { queryKeys } from "./query-keys";

export const sessionQueryOptions = () => queryOptions({
  queryKey: queryKeys.session,
  queryFn: ({ signal }) => getSession(signal),
  staleTime: 30_000,
  retry: false,
});

export const projectsQueryOptions = () => queryOptions({
  queryKey: queryKeys.projectList,
  queryFn: ({ signal }) => listProjects(signal),
  retry: false,
});

export const projectQueryOptions = (projectId: string) => queryOptions({
  queryKey: queryKeys.projectDetail(projectId),
  queryFn: ({ signal }) => getProject(projectId, signal),
  retry: false,
});

export const manuscriptQueryOptions = (projectId: string) => queryOptions({
  queryKey: queryKeys.projectManuscript(projectId),
  queryFn: ({ signal }) => getManuscript(projectId, signal),
  retry: false,
});
