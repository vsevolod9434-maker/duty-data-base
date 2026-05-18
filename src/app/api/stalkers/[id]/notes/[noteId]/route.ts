import { getAccessUserDisplayName } from "@/lib/auth/access-user-display";
import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { getPrismaClient } from "@/lib/prisma";
import { createSystemDate } from "@/lib/stalker-utils";
import {
  createStalkerNoteErrorResponse,
  mapStalkerNoteToResponse,
  normalizeNoteText,
  type StalkerNotePayload,
} from "../stalker-note-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string; noteId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const { id, noteId } = await context.params;
  const payload = (await request.json().catch(() => null)) as StalkerNotePayload | null;
  const text = normalizeNoteText(payload?.text);

  if (!text) {
    return createStalkerNoteErrorResponse("Не удалось сохранить заметку.");
  }

  const prisma = getPrismaClient();

  try {
    const existingNote = await prisma.stalkerNote.findFirst({
      select: { id: true },
      where: {
        id: noteId,
        stalkerId: id,
      },
    });

    if (!existingNote) {
      return createStalkerNoteErrorResponse("Заметка не найдена.", 404);
    }

    const note = await prisma.stalkerNote.update({
      data: {
        text,
        updatedAt: createSystemDate(),
        updatedBy: getAccessUserDisplayName(auth.accessUser),
      },
      where: { id: noteId },
    });

    return Response.json(mapStalkerNoteToResponse(note));
  } catch {
    return createStalkerNoteErrorResponse("Не удалось сохранить заметку.", 500);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const { id, noteId } = await context.params;
  const prisma = getPrismaClient();

  try {
    const existingNote = await prisma.stalkerNote.findFirst({
      select: { id: true },
      where: {
        id: noteId,
        stalkerId: id,
      },
    });

    if (!existingNote) {
      return createStalkerNoteErrorResponse("Заметка не найдена.", 404);
    }

    await prisma.stalkerNote.delete({
      where: { id: noteId },
    });

    return new Response(null, { status: 204 });
  } catch {
    return createStalkerNoteErrorResponse("Не удалось удалить заметку.", 500);
  }
}
