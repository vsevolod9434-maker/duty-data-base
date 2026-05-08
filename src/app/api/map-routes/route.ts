import { requireApiAuth } from "@/lib/auth/require-api-auth";
import type { MapRouteInput } from "@/lib/map-overlays";
import { getPrismaClient } from "@/lib/prisma";
import {
  createMapOverlayErrorResponse,
  mapRouteToResponse,
  validateMapRoutePayload,
} from "../map-overlays-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const routeInclude = {
  points: {
    orderBy: { order: "asc" as const },
  },
};

export async function GET() {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const prisma = getPrismaClient();

  try {
    const routes = await prisma.mapRoute.findMany({
      include: routeInclude,
      orderBy: [{ layer: "asc" }, { type: "asc" }, { title: "asc" }],
    });

    return Response.json(routes.map(mapRouteToResponse));
  } catch {
    return createMapOverlayErrorResponse("Не удалось выполнить операцию.", 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const payload = (await request.json().catch(() => null)) as MapRouteInput | null;
  const validation = validateMapRoutePayload(payload);

  if (!validation.ok) {
    return createMapOverlayErrorResponse(validation.error);
  }

  const prisma = getPrismaClient();

  try {
    const route = await prisma.mapRoute.create({
      data: {
        colorKey: validation.value.colorKey,
        description: validation.value.description,
        layer: validation.value.layer,
        linePattern: validation.value.linePattern,
        points: {
          create: validation.value.points,
        },
        status: validation.value.status,
        title: validation.value.title,
        type: validation.value.type,
      },
      include: routeInclude,
    });

    return Response.json(mapRouteToResponse(route), { status: 201 });
  } catch {
    return createMapOverlayErrorResponse("Не удалось выполнить операцию.", 500);
  }
}
