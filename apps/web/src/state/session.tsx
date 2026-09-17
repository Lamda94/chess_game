import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoginInput, RegisterInput, SessionUser } from '@gambito/shared';
import { get, post } from '../api/client.js';

interface SessionValue {
  user: SessionUser | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<SessionUser>;
  register: (input: RegisterInput) => Promise<SessionUser>;
  chooseUsername: (username: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['session'],
    queryFn: () => get<{ user: SessionUser | null }>('/auth/me'),
    staleTime: 30_000,
    retry: false,
  });

  const setUser = (user: SessionUser) => {
    queryClient.setQueryData(['session'], { user });
    return user;
  };

  const loginMutation = useMutation({
    mutationFn: (input: LoginInput) => post<{ user: SessionUser }>('/auth/login', input),
  });
  const registerMutation = useMutation({
    mutationFn: (input: RegisterInput) => post<{ user: SessionUser }>('/auth/register', input),
  });
  const usernameMutation = useMutation({
    mutationFn: (username: string) => post<{ user: SessionUser }>('/auth/username', { username }),
  });

  const value = useMemo<SessionValue>(
    () => ({
      user: data?.user ?? null,
      loading: isLoading,
      login: async (input) => setUser((await loginMutation.mutateAsync(input)).user),
      register: async (input) => setUser((await registerMutation.mutateAsync(input)).user),
      chooseUsername: async (username) => setUser((await usernameMutation.mutateAsync(username)).user),
      logout: async () => {
        await post('/auth/logout');
        queryClient.setQueryData(['session'], { user: null });
        queryClient.clear();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, isLoading],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession fuera de SessionProvider');
  return value;
}
