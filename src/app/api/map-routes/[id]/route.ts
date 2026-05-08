import { requireApiAuth } from "@/lib/auth/require-api-auth";
import type { MapRouteInput } from "@/lib/map-overlays";
import { getPrismaClient } from "@/lib/prisma";
import {
  buildMapRoutePatchPayload,
  createMapOverlayErrorResponse,
  mapRouteToResponse,
  validateMapRoutePayload,
} from "../../map-overlays-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const routeInclude = {
  points: {
    orderBy: { order: "asc" as const },
  },
};

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const payload = (await request.json().catch(() => null)) as MapRouteInput | null;

  if (!payload || typeof payload !== "object") {
    return createMapOverlayErrorResponse("Не удалось выполнить операцию.");
  }

  const prisma = getPrismaClient();

  try {
    const currentRoute = await prisma.mapRoute.findUnique({
      include: routeInclude,
      where: { id },
    });

    if (!currentRoute) {
      return createMapOverlayErrorResponse("Маршрут не найден.", 404);
    }

    const patchPayload = buildMapRoutePatchPayload(
      {
        description: currentRoute.description,
        layer: currentRoute.layer,
        points: currentRoute.points.map((point) => ({ order: point.order, x: point.x, y: point.y })),
        status: currentRoute.status,
        title: currentRoute.title,
        type: currentRoute.type,
      },
      payload,
    );
    const validation = validateMapRoutePayload(patchPayload);

    if (!validation.ok) {
      return createMapOverlayErrorResponse(validation.error);
    }

    const route = await prisma.$transaction(async (transaction) => {
      await transaction.mapRoutePoint.deleteMany({
        where: { routeId: id },
      });

      return transaction.mapRoute.update({
        data: {
          description: validation.value.description,
          layer: validation.value.layer,
          points: {
            create: validation.value.points,
          },
          status: validation.value.status,
          title: validation.value.title,
          type: validation.value.type,
        },
        include: routeInclude,
        where: { id },
      });
    });

    return Response.json(mapRouteToResponse(route));
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
    await prisma.mapRoute.delete({
      where: { id },
    });

    return Response.json({ ok: true });
  } catch {
    return createMapOverlayErrorResponse("Не удалось выполнить операцию.", 500);
  }
}
