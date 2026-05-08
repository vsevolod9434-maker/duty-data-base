import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { normalizeMapMarkerType, type MapMarkerInput } from "@/lib/map-markers";
import { normalizeFillPattern, normalizeObjectColorKey } from "@/lib/map-overlays";
import { getPrismaClient } from "@/lib/prisma";
import {
  buildMapMarkerPatchPayload,
  createMapMarkerErrorResponse,
  mapMarkerToResponse,
  validateMapMarkerPayload,
} from "../map-marker-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const payload = (await request.json().catch(() => null)) as MapMarkerInput | null;

  if (!payload || typeof payload !== "object") {
    return createMapMarkerErrorResponse("Не удалось выполнить операцию.");
  }

  const prisma = getPrismaClient();

  try {
    const currentMarker = await prisma.mapMarker.findUnique({
      where: { id },
    });

    if (!currentMarker) {
      return createMapMarkerErrorResponse("Метка не найдена.", 404);
    }

    const patchPayload = buildMapMarkerPatchPayload(
      {
        brightness: currentMarker.brightness,
        colorKey: normalizeObjectColorKey(currentMarker.colorKey),
        contrast: currentMarker.contrast,
        description: currentMarker.description,
        layer: currentMarker.layer,
        patternKey: normalizeFillPattern(currentMarker.patternKey),
        status: currentMarker.status,
        title: currentMarker.title,
        type: normalizeMapMarkerType(currentMarker.type),
        x: currentMarker.x,
        y: currentMarker.y,
      },
      payload,
    );
    const validation = validateMapMarkerPayload(patchPayload);

    if (!validation.ok) {
      return createMapMarkerErrorResponse(validation.error);
    }

    const marker = await prisma.mapMarker.update({
      data: validation.value,
      where: { id },
    });

    return Response.json(mapMarkerToResponse(marker));
  } catch {
    return createMapMarkerErrorResponse("Не удалось выполнить операцию.", 500);
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
    const marker = await prisma.mapMarker.delete({
      where: { id },
    });

    return Response.json(mapMarkerToResponse(marker));
  } catch {
    return createMapMarkerErrorResponse("Не удалось выполнить операцию.", 500);
  }
}
