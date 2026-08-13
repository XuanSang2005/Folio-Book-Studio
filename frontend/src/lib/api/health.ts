export type HealthResponse = { status: "ok" };

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch("/api/health", { signal });
  if (!response.ok) throw new Error(`Health request failed with ${response.status}`);
  return response.json() as Promise<HealthResponse>;
}
