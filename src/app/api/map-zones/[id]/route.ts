import { requireApiAuth } from "@/lib/auth/require-api-auth";
import type { MapZoneInput } from "@/lib/map-overlays";
import { getPrismaClient } from "@/lib/prisma";
import {
  buildMapZonePatchPayload,
  createMapOverlayErrorResponse,
  mapZoneToResponse,
  validateMapZonePayload,
  zoneInclude,
} from "../../map-overlays-route-utils";

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
  const payload = (await request.json().catch(() => null)) as MapZoneInput | null;

  if (!payload || typeof payload !== "object") {
    return createMapOverlayErrorResponse("Не удалось выполнить операцию.");
  }

  const prisma = getPrismaClient();

  try {
    const currentZone = await prisma.mapZone.findUnique({
      include: zoneInclude,
      where: { id },
    });

    if (!currentZone) {
      return createMapOverlayErrorResponse("Зона не найдена.", 404);
    }

    const patchPayload = buildMapZonePatchPayload(
      {
        centerX: currentZone.centerX,
        centerY: currentZone.centerY,
        description: currentZone.description,
        layer: currentZone.layer,
        points: currentZone.points.map((point) => ({ order: point.order, x: point.x, y: point.y })),
        radius: currentZone.radius,
        shape: currentZone.shape,
        status: currentZone.status,
        title: currentZone.title,
        type: currentZone.type,
      },
      payload,
    );
    const validation = validateMapZonePayload(patchPayload);

    if (!validation.ok) {
      return createMapOverlayErrorResponse(validation.error);
    }

    const zone = await prisma.$transaction(async (transaction) => {
      await transaction.mapZonePoint.deleteMany({
        where: { zoneId: id },
      });

      return transaction.mapZone.update({
        data: {
          centerX: validation.value.centerX,
          centerY: validation.value.centerY,
          description: validation.value.description,
          layer: validation.value.layer,
          points: {
            create: validation.value.points,
          },
          radius: validation.value.radius,
          shape: validation.value.shape,
          status: validation.value.status,
          title: validation.value.title,
          type: validation.value.type,
        },
        include: zoneInclude,
        where: { id },
      });
    });

    return Response.json(mapZoneToResponse(zone));
  } catch {
    return createMapOverlayErrorResponse("Не удалось выполнить операцию.", 500);
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
    await prisma.mapZone.delete({
      where: { id },
    });

    return Response.json({ ok: true });
  } catch {
    return createMapOverlayErrorResponse("Не удалось выполнить операцию.", 500);
  }
}
