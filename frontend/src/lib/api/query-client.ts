import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "./client";
import { queryKeys } from "./query-keys";

export function createAppQueryClient(options: {
  onSessionExpired?: () => void | Promise<void>;
} = {}) {
  let handlingExpiredSession = false;

  function handleSessionExpiry(error: unknown) {
    if (!(error instanceof ApiError) || error.status !== 401 || handlingExpiredSession) return;
    handlingExpiredSession = true;
    queryClient.clear();
    try {
      void Promise.resolve(options.onSessionExpired?.())
        .catch(() => undefined)
        .finally(() => {
          handlingExpiredSession = false;
        });
    } catch {
      handlingExpiredSession = false;
    }
  }

  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError(error, query) {
        if (query.queryKey[0] === queryKeys.session[0]) return;
        handleSessionExpiry(error);
      },
    }),
    mutationCache: new MutationCache({ onError: handleSessionExpiry }),
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  return queryClient;
}
