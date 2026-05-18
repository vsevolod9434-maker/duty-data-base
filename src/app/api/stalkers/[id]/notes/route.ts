import { getAccessUserDisplayName } from "@/lib/auth/access-user-display";
import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { getPrismaClient } from "@/lib/prisma";
import { createSystemDate } from "@/lib/stalker-utils";
import {
  createStalkerNoteErrorResponse,
  mapStalkerNoteToResponse,
  normalizeNoteText,
  type StalkerNotePayload,
} from "./stalker-note-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const prisma = getPrismaClient();

  try {
    const stalker = await prisma.stalker.findUnique({
      select: { id: true },
      where: { id },
    });

    if (!stalker) {
      return createStalkerNoteErrorResponse("Профиль не найден.", 404);
    }

    const notes = await prisma.stalkerNote.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      where: { stalkerId: id },
    });

    return Response.json(notes.map(mapStalkerNoteToResponse));
  } catch {
    return createStalkerNoteErrorResponse("Не удалось сохранить заметку.", 500);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const payload = (await request.json().catch(() => null)) as StalkerNotePayload | null;
  const text = normalizeNoteText(payload?.text);

  if (!text) {
    return createStalkerNoteErrorResponse("Не удалось сохранить заметку.");
  }

  const prisma = getPrismaClient();

  try {
    const stalker = await prisma.stalker.findUnique({
      select: { id: true },
      where: { id },
    });

    if (!stalker) {
      return createStalkerNoteErrorResponse("Профиль не найден.", 404);
    }

    const now = createSystemDate();
    const note = await prisma.stalkerNote.create({
      data: {
        id: crypto.randomUUID(),
        stalkerId: id,
        text,
        createdBy: getAccessUserDisplayName(auth.accessUser),
        updatedBy: null,
        createdAt: now,
        updatedAt: now,
      },
    });

    return Response.json(mapStalkerNoteToResponse(note), { status: 201 });
  } catch {
    return createStalkerNoteErrorResponse("Не удалось сохранить заметку.", 500);
  }
}
