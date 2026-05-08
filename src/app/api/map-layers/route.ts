import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { DEFAULT_MAP_LAYER, normalizeMapLayerKey, validateMapLayerInput, type MapLayerInput } from "@/lib/map-layers";
import { getPrismaClient } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

async function ensureDefaultLayer() {
  const prisma = getPrismaClient();
  const normalizedName = normalizeMapLayerKey(DEFAULT_MAP_LAYER);

  await prisma.mapLayer.upsert({
    create: {
      isDefault: true,
      name: DEFAULT_MAP_LAYER,
      normalizedName,
    },
    update: {
      isDefault: true,
      name: DEFAULT_MAP_LAYER,
    },
    where: { normalizedName },
  });
}

export async function GET() {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const prisma = getPrismaClient();

  try {
    await ensureDefaultLayer();

    const layers = await prisma.mapLayer.findMany({
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });

    return Response.json(layers.map(mapLayerToResponse));
  } catch {
    return createMapLayerErrorResponse("Не удалось выполнить операцию.", 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

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
    await ensureDefaultLayer();

    const duplicate = await prisma.mapLayer.findUnique({
      select: { id: true },
      where: { normalizedName: validation.data.normalizedName },
    });

    if (duplicate) {
      return createMapLayerErrorResponse("Слой с таким названием уже существует.");
    }

    const layer = await prisma.mapLayer.create({
      data: validation.data,
    });

    return Response.json(mapLayerToResponse(layer), { status: 201 });
  } catch {
    return createMapLayerErrorResponse("Не удалось выполнить операцию.", 500);
  }
}
