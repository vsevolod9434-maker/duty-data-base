import type { AccessUser, StalkerNote as DatabaseStalkerNote } from "@/generated/prisma/client";

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
    createdByAccessUserId: note.createdByAccessUserId,
    updatedBy: note.updatedBy,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

export function normalizeNoteText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

type NoteAccessUser = Pick<AccessUser, "id" | "role">;

export function canManageStalkerNote(note: DatabaseStalkerNote, accessUser: NoteAccessUser) {
  if (accessUser.role === "system_admin" || accessUser.role === "officer") {
    return true;
  }

  return note.createdByAccessUserId === accessUser.id;
}
