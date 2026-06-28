"use client";

import { backendOnlyOperationMessage } from "@/lib/static-hosting";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AccessAdminActionRequest =
  | {
      action: "createDutyMemberUser";
      payload: unknown;
    }
  | {
      action: "resetPassword";
      memberId: string;
      newPassword: string;
      repeatPassword: string;
    }
  | {
      action: "updateAccess";
      memberId: string;
      accessLevel?: "officer" | "regular";
      isActive?: boolean;
    }
  | {
      action: "excludeDutyMember";
      memberId: string;
    };

function getAccessAdminFunctionUrl() {
  return process.env.NEXT_PUBLIC_ACCESS_ADMIN_FUNCTION_URL?.trim() || null;
}

export function isAccessAdminFunctionConfigured() {
  return Boolean(getAccessAdminFunctionUrl());
}

function localJsonResponse(message: string, status: number) {
  return new Response(JSON.stringify({ message }), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

export async function invokeAccessAdminFunction(body: AccessAdminActionRequest) {
  const functionUrl = getAccessAdminFunctionUrl();

  if (!functionUrl) {
    return localJsonResponse(backendOnlyOperationMessage, 501);
  }

  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return localJsonResponse("Требуется действующий допуск.", 401);
  }

  return fetch(functionUrl, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}
