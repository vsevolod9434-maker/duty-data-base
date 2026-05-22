import { requireApiAuth } from "@/lib/auth/require-api-auth";
import type { MapLabelInput } from "@/lib/map-labels";
import { getPrismaClient } from "@/lib/prisma";
import {
  createMapLabelErrorResponse,
  mapLabelToResponse,
  validateMapLabelPayload,
} from "./map-label-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAccessUserLabel(accessUser: { displayName: string | null; login: string }) {
  return accessUser.displayName || accessUser.login;
}

export async function GET() {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const prisma = getPrismaClient();

  try {
    const labels = await prisma.mapLabel.findMany({
      orderBy: [{ layer: "asc" }, { text: "asc" }],
    });

    return Response.json(labels.map(mapLabelToResponse));
  } catch {
    return createMapLabelErrorResponse("Не удалось выполнить операцию.", 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const payload = (await request.json().catch(() => null)) as MapLabelInput | null;
  const validation = validateMapLabelPayload(payload);

  if (!validation.ok) {
    return createMapLabelErrorResponse(validation.error);
  }

  const prisma = getPrismaClient();
  const currentUserLabel = getAccessUserLabel(auth.accessUser);

  try {
    const label = await prisma.mapLabel.create({
      data: {
        ...validation.value,
        createdBy: currentUserLabel,
        updatedBy: currentUserLabel,
      },
    });

    return Response.json(mapLabelToResponse(label), { status: 201 });
  } catch {
    return createMapLabelErrorResponse("Не удалось выполнить операцию.", 500);
  }
}
