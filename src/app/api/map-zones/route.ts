import { requireApiAuth } from "@/lib/auth/require-api-auth";
import type { MapZoneInput } from "@/lib/map-overlays";
import { getPrismaClient } from "@/lib/prisma";
import {
  createMapOverlayErrorResponse,
  mapZoneToResponse,
  validateMapZonePayload,
  zoneInclude,
} from "../map-overlays-route-utils";

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
    const zones = await prisma.mapZone.findMany({
      include: zoneInclude,
      orderBy: [{ layer: "asc" }, { type: "asc" }, { title: "asc" }],
    });

    return Response.json(zones.map(mapZoneToResponse));
  } catch {
    return createMapOverlayErrorResponse("Не удалось выполнить операцию.", 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const payload = (await request.json().catch(() => null)) as MapZoneInput | null;
  const validation = validateMapZonePayload(payload);

  if (!validation.ok) {
    return createMapOverlayErrorResponse(validation.error);
  }

  const prisma = getPrismaClient();
  const currentUserLabel = getAccessUserLabel(auth.accessUser);

  try {
    const zone = await prisma.mapZone.create({
      data: {
        brightness: validation.value.brightness,
        centerX: validation.value.centerX,
        centerY: validation.value.centerY,
        colorKey: validation.value.colorKey,
        contrast: validation.value.contrast,
        createdBy: currentUserLabel,
        description: validation.value.description,
        layer: validation.value.layer,
        patternKey: validation.value.patternKey,
        points: {
          create: validation.value.points,
        },
        radius: validation.value.radius,
        shape: validation.value.shape,
        status: validation.value.status,
        title: validation.value.title,
        type: validation.value.type,
        updatedBy: currentUserLabel,
      },
      include: zoneInclude,
    });

    return Response.json(mapZoneToResponse(zone), { status: 201 });
  } catch {
    return createMapOverlayErrorResponse("Не удалось выполнить операцию.", 500);
  }
}
