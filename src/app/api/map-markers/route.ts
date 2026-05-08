import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { getPrismaClient } from "@/lib/prisma";
import type { MapMarkerInput } from "@/lib/map-markers";
import {
  createMapMarkerErrorResponse,
  mapMarkerToResponse,
  validateMapMarkerPayload,
} from "./map-marker-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "1";
  const prisma = getPrismaClient();

  try {
    const markers = await prisma.mapMarker.findMany({
      orderBy: [{ layer: "asc" }, { type: "asc" }, { title: "asc" }],
      where: includeArchived ? undefined : { status: { not: "archived" } },
    });

    return Response.json(markers.map(mapMarkerToResponse));
  } catch {
    return createMapMarkerErrorResponse("Не удалось выполнить операцию.", 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const payload = (await request.json().catch(() => null)) as MapMarkerInput | null;
  const validation = validateMapMarkerPayload(payload);

  if (!validation.ok) {
    return createMapMarkerErrorResponse(validation.error);
  }

  const prisma = getPrismaClient();

  try {
    const marker = await prisma.mapMarker.create({
      data: validation.value,
    });

    return Response.json(mapMarkerToResponse(marker), { status: 201 });
  } catch {
    return createMapMarkerErrorResponse("Не удалось выполнить операцию.", 500);
  }
}
