import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, getToken, setToken, setUnauthorizedHandler, errorMessage } from "@/lib/api";
import type { AccountType, User } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

const ME_KEY = ["/api/v1/me"];

export interface AuthResponse {
  token: string;
  user: User;
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ME_KEY,
    queryFn: async () => {
      if (!getToken()) return null;
      try {
        return await api<User>("/api/v1/me");
      } catch {
        return null;
      }
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    setUnauthorizedHandler(() => {
      queryClient.setQueryData(ME_KEY, null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });
    });
  }, [queryClient]);

  const signedIn = (data: AuthResponse) => {
    setToken(data.token);
    queryClient.setQueryData(ME_KEY, data.user);
  };

  const loginMutation = useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      api<AuthResponse>("/api/v1/login", { method: "POST", body: credentials }),
    onSuccess: signedIn,
    onError: (error) => {
      toast({ title: "Couldn't sign in", description: errorMessage(error), variant: "destructive" });
    },
  });

  const registerMutation = useMutation({
    mutationFn: (details: { email: string; password: string; first_name: string; last_name: string; account_type: AccountType }) =>
      api<AuthResponse>("/api/v1/register", { method: "POST", body: details }),
    onSuccess: (data) => {
      signedIn(data);
      toast({
        title: "Account created",
        description: data.user.accountType === "employer" ? "Add your company to start hiring." : "Your first practice interview is one click away.",
      });
    },
    onError: (error) => {
      toast({ title: "Couldn't create your account", description: errorMessage(error), variant: "destructive" });
    },
  });

  const logout = () => {
    setToken(null);
    queryClient.clear();
    queryClient.setQueryData(ME_KEY, null);
    toast({ title: "Signed out" });
  };

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
    loginMutation,
    registerMutation,
    signedIn,
    logout,
  };
}

/** Moves the account to the other workspace. The app re-renders into it as soon as /me updates. */
export function useSwitchWorkspace() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (accountType: AccountType) => api<User>("/api/v1/profile", { method: "PUT", body: { user: { accountType } } }),
    onSuccess: (user) => {
      queryClient.setQueryData(ME_KEY, user);
      toast({ title: user.accountType === "employer" ? "Switched to hiring" : "Switched to interview practice" });
    },
    onError: (error) => toast({ title: "Couldn't switch", description: errorMessage(error), variant: "destructive" }),
  });
}
