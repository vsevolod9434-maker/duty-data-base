"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { createDutyQueryClient } from "@/lib/data-cache";

type DutyQueryProviderProps = {
  children: ReactNode;
};

export function DutyQueryProvider({ children }: DutyQueryProviderProps) {
  const [queryClient] = useState(createDutyQueryClient);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

