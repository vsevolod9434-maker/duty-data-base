import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { getPrismaClient } from "@/lib/prisma";
import {
  createStaffListErrorResponse,
  mapStaffSectionToResponse,
  staffListInclude,
} from "./staff-list-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const prisma = getPrismaClient();

  try {
    const sections = await prisma.dutyStaffSection.findMany({
      include: staffListInclude,
      orderBy: { sortOrder: "asc" },
    });

    return Response.json(sections.map(mapStaffSectionToResponse));
  } catch {
    return createStaffListErrorResponse("Не удалось загрузить штатный список. Повторите попытку позже.", 500);
  }
}

