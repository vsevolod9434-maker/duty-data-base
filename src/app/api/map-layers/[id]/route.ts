import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { DEFAULT_MAP_LAYER, normalizeMapLayerKey, validateMapLayerInput, type MapLayerInput } from "@/lib/map-layers";
import { getPrismaClient } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LayerContext = {
  params: Promise<{ id: string }>;
};

function createMapLayerErrorResponse(message: string, status = 400) {
  return Response.json({ error: message, message }, { status });
}

function mapLayerToResponse(layer: {
  id: string;
  name: string;
  normalizedName: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    createdAt: layer.createdAt.toISOString(),
    id: layer.id,
    isDefault: layer.isDefault,
    name: layer.name,
    normalizedName: layer.normalizedName,
    updatedAt: layer.updatedAt.toISOString(),
  };
}

export async function PATCH(request: Request, context: LayerContext) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const payload = (await request.json().catch(() => null)) as MapLayerInput | null;

  if (!payload || typeof payload !== "object") {
    return createMapLayerErrorResponse("Не удалось выполнить операцию.");
  }

  const validation = validateMapLayerInput(payload);

  if (!validation.ok) {
    return createMapLayerErrorResponse(validation.error);
  }

  const prisma = getPrismaClient();

  try {
    const currentLayer = await prisma.mapLayer.findUnique({
      where: { id },
    });

    if (!currentLayer) {
      return createMapLayerErrorResponse("Слой не найден.", 404);
    }

    if (currentLayer.isDefault || currentLayer.normalizedName === normalizeMapLayerKey(DEFAULT_MAP_LAYER)) {
      return createMapLayerErrorResponse("Основной слой нельзя переименовать.");
    }

    const duplicate = await prisma.mapLayer.findFirst({
      select: { id: true },
      where: {
        id: { not: id },
        normalizedName: validation.data.normalizedName,
      },
    });

    if (duplicate) {
      return createMapLayerErrorResponse("Слой с таким названием уже существует.");
    }

    const layer = await prisma.$transaction(async (transaction) => {
      const updatedLayer = await transaction.mapLayer.update({
        data: validation.data,
        where: { id },
      });

      await transaction.mapMarker.updateMany({
        data: { layer: validation.data.name },
        where: { layer: currentLayer.name },
      });
      await transaction.mapZone.updateMany({
        data: { layer: validation.data.name },
        where: { layer: currentLayer.name },
      });
      await transaction.mapRoute.updateMany({
        data: { layer: validation.data.name },
        where: { layer: currentLayer.name },
      });

      return updatedLayer;
    });

    return Response.json(mapLayerToResponse(layer));
  } catch {
    return createMapLayerErrorResponse("Не удалось выполнить операцию.", 500);
  }
}

export async function DELETE(_request: Request, context: LayerContext) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const prisma = getPrismaClient();

  try {
    const layer = await prisma.mapLayer.findUnique({
      where: { id },
    });

    if (!layer) {
      return createMapLayerErrorResponse("Слой не найден.", 404);
    }

    if (layer.isDefault || layer.normalizedName === normalizeMapLayerKey(DEFAULT_MAP_LAYER)) {
      return createMapLayerErrorResponse("Основной слой нельзя удалить.");
    }

    const [markersCount, zonesCount, routesCount] = await Promise.all([
      prisma.mapMarker.count({ where: { layer: layer.name } }),
      prisma.mapZone.count({ where: { layer: layer.name } }),
      prisma.mapRoute.count({ where: { layer: layer.name } }),
    ]);

    if (markersCount + zonesCount + routesCount > 0) {
      return createMapLayerErrorResponse("Слой используется объектами карты.");
    }

    await prisma.mapLayer.delete({
      where: { id },
    });

    return Response.json({ ok: true });
  } catch {
    return createMapLayerErrorResponse("Не удалось выполнить операцию.", 500);
  }
}
