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
  const currentUserLabel = getAccessUserLabel(auth.accessUser);

  try {
    const route = await prisma.mapRoute.create({
      data: {
        brightness: validation.value.brightness,
        colorKey: validation.value.colorKey,
        contrast: validation.value.contrast,
        createdBy: currentUserLabel,
        description: validation.value.description,
        layer: validation.value.layer,
        linePattern: validation.value.linePattern,
        points: {
          create: validation.value.points,
        },
        status: validation.value.status,
        title: validation.value.title,
        type: validation.value.type,
        updatedBy: currentUserLabel,
      },
      include: routeInclude,
    });

    return Response.json(mapRouteToResponse(route), { status: 201 });
  } catch {
    return createMapOverlayErrorResponse("Не удалось выполнить операцию.", 500);
  }
}
