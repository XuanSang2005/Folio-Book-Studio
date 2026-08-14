export const queryKeys = {
  session: ["session"] as const,
  projectRoot: ["projects"] as const,
  projectList: ["projects", "list"] as const,
  projectDetail: (projectId: string) => ["projects", "detail", projectId] as const,
  projectManuscript: (projectId: string) => ["projects", "manuscript", projectId] as const,
};
