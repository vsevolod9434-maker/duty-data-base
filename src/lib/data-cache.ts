"use client";

import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetchJson } from "@/lib/api-client";

export type CurrentUserCacheRecord = {
  login?: string | null;
  displayName?: string | null;
  role?: string | null;
  roleLabel?: string | null;
};

export const ONE_MINUTE = 60_000;
export const TEN_MINUTES = 10 * ONE_MINUTE;
export const ONE_HOUR = 60 * ONE_MINUTE;
export const TWO_HOURS = 2 * ONE_HOUR;

export const cachePolicy = {
  default: ONE_MINUTE,
  apartments: TEN_MINUTES,
  dutyMembers: ONE_HOUR,
  dutyAccessUsers: ONE_HOUR,
  staffList: ONE_HOUR,
  calculatorCatalog: ONE_HOUR,
  currentUser: 5 * ONE_MINUTE,
} as const;

export const dutyDataKeys = {
  all: ["duty-data"] as const,
  currentUser: ["duty-data", "auth", "current-user"] as const,
  mapMarkers: (userKey: string) => ["duty-data", userKey, "map", "markers"] as const,
  mapZones: (userKey: string) => ["duty-data", userKey, "map", "zones"] as const,
  mapRoutes: (userKey: string) => ["duty-data", userKey, "map", "routes"] as const,
  mapLayers: (userKey: string) => ["duty-data", userKey, "map", "layers"] as const,
  calculatorCatalog: (userKey: string) => ["duty-data", userKey, "calculator", "catalog"] as const,
  stalkers: (userKey: string) => ["duty-data", userKey, "stalkers"] as const,
  stalkerNotes: (userKey: string, profileId: string) => ["duty-data", userKey, "stalkers", profileId, "notes"] as const,
  stalkerGroups: (userKey: string) => ["duty-data", userKey, "stalker-groups"] as const,
  apartments: (userKey: string) => ["duty-data", userKey, "apartments"] as const,
  tasks: (userKey: string) => ["duty-data", userKey, "journals", "tasks"] as const,
  tradeOperations: (userKey: string) => ["duty-data", userKey, "journals", "trade-operations"] as const,
  violations: (userKey: string) => ["duty-data", userKey, "journals", "violations"] as const,
  dutyMembers: (userKey: string) => ["duty-data", userKey, "duty-members"] as const,
  dutyAccessUsers: (userKey: string) => ["duty-data", userKey, "duty-members", "access-users"] as const,
  staffList: (userKey: string) => ["duty-data", userKey, "duty-members", "staff-list"] as const,
};

export function createDutyQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 30 * 60_000,
        refetchOnReconnect: true,
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: cachePolicy.default,
      },
    },
  });
}

export function getCurrentUserCacheKey(user: CurrentUserCacheRecord | null | undefined) {
  return user?.login?.trim() || null;
}

export function useCurrentUserQuery() {
  return useQuery({
    queryKey: dutyDataKeys.currentUser,
    queryFn: () => apiFetchJson<CurrentUserCacheRecord>("/api/auth/me"),
    staleTime: cachePolicy.currentUser,
  });
}

export function useCurrentUserCacheKey() {
  const currentUserQuery = useCurrentUserQuery();

  return {
    currentUser: currentUserQuery.data ?? null,
    currentUserKey: getCurrentUserCacheKey(currentUserQuery.data),
    isCurrentUserLoading: currentUserQuery.isPending,
  };
}

export function useDutyQueryClient() {
  return useQueryClient();
}

export function scheduleClientStateSync(syncState: () => void) {
  const handle = window.setTimeout(syncState, 0);
  return () => window.clearTimeout(handle);
}

export function replaceCachedRecord<T extends { id: string }>(records: T[] | undefined, record: T) {
  const currentRecords = records ?? [];
  const hasRecord = currentRecords.some((currentRecord) => currentRecord.id === record.id);

  if (!hasRecord) {
    return [record, ...currentRecords];
  }

  return currentRecords.map((currentRecord) => (currentRecord.id === record.id ? record : currentRecord));
}

export function removeCachedRecord<T extends { id: string }>(records: T[] | undefined, recordId: string) {
  return (records ?? []).filter((record) => record.id !== recordId);
}
