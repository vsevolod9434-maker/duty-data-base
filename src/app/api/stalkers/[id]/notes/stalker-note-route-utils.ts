import type { StalkerNote as DatabaseStalkerNote } from "@/generated/prisma/client";

export type StalkerNotePayload = {
  text?: unknown;
};

export function createStalkerNoteErrorResponse(message: string, status = 400) {
  return Response.json({ error: message, message }, { status });
}

export function mapStalkerNoteToResponse(note: DatabaseStalkerNote) {
  return {
    id: note.id,
    stalkerId: note.stalkerId,
    text: note.text,
    createdBy: note.createdBy,
    updatedBy: note.updatedBy,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

export function normalizeNoteText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
