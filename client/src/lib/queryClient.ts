import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { api } from "./api";

// Default query: the first key segment is the URL, e.g. useQuery({ queryKey: ["/api/v1/sessions"] }).
const defaultQueryFn: QueryFunction = ({ queryKey, signal }) =>
  api(queryKey.join("/") as string, { signal });

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: defaultQueryFn,
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
