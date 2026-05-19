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

type NoteAccessUser = Pick<AccessUser, "displayName" | "id" | "login" | "role">;

function normalizeComparableValue(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase("ru-RU") || "";
}

export function canManageStalkerNote(note: DatabaseStalkerNote, accessUser: NoteAccessUser) {
  if (accessUser.role === "system_admin" || accessUser.role === "officer") {
    return true;
  }

  if (note.createdByAccessUserId) {
    return note.createdByAccessUserId === accessUser.id;
  }

  const authorName = normalizeComparableValue(note.createdBy);

  if (!authorName) {
    return false;
  }

  return [accessUser.displayName, accessUser.login]
    .map((value) => normalizeComparableValue(value))
    .filter(Boolean)
    .includes(authorName);
}
