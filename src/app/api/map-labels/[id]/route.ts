import { requireApiAuth } from "@/lib/auth/require-api-auth";
import type { MapLabelInput } from "@/lib/map-labels";
import { normalizeObjectColorKey } from "@/lib/map-overlays";
import { getPrismaClient } from "@/lib/prisma";
import {
  buildMapLabelPatchPayload,
  createMapLabelErrorResponse,
  mapLabelToResponse,
  validateMapLabelPayload,
} from "../map-label-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function getAccessUserLabel(accessUser: { displayName: string | null; login: string }) {
  return accessUser.displayName || accessUser.login;
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const payload = (await request.json().catch(() => null)) as MapLabelInput | null;

  if (!payload || typeof payload !== "object") {
    return createMapLabelErrorResponse("Не удалось выполнить операцию.");
  }

  const prisma = getPrismaClient();

  try {
    const currentLabel = await prisma.mapLabel.findUnique({
      where: { id },
    });

    if (!currentLabel) {
      return createMapLabelErrorResponse("Надпись не найдена.", 404);
    }

    const patchPayload = buildMapLabelPatchPayload(
      {
        brightness: currentLabel.brightness,
        colorKey: normalizeObjectColorKey(currentLabel.colorKey),
        contrast: currentLabel.contrast,
        layer: currentLabel.layer,
        size: currentLabel.size,
        text: currentLabel.text,
        x: currentLabel.x,
        y: currentLabel.y,
      },
      payload,
    );
    const validation = validateMapLabelPayload(patchPayload);

    if (!validation.ok) {
      return createMapLabelErrorResponse(validation.error);
    }

    const label = await prisma.mapLabel.update({
      data: {
        ...validation.value,
        updatedBy: getAccessUserLabel(auth.accessUser),
      },
      where: { id },
    });

    return Response.json(mapLabelToResponse(label));
  } catch {
    return createMapLabelErrorResponse("Не удалось выполнить операцию.", 500);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const prisma = getPrismaClient();

  try {
    const label = await prisma.mapLabel.delete({
      where: { id },
    });

    return Response.json(mapLabelToResponse(label));
  } catch {
    return createMapLabelErrorResponse("Не удалось выполнить операцию.", 500);
  }
}
