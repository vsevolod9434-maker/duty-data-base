import { getPrismaClient } from "@/lib/prisma";
import { createSystemDate } from "@/lib/stalker-utils";
import {
  calculateTotalAmount,
  createErrorResponse,
  isTradeType,
  mapTradeOperationToResponse,
  normalizeNullableString,
  normalizeTradeItems,
  normalizeTradeSubject,
  parseNullableDate,
  parseStoredDate,
  type TradeOperationPayload,
} from "../trade-operation-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const tradeOperationInclude = {
  items: {
    orderBy: { name: "asc" },
  },
} as const;

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as unknown;

  if (!Array.isArray(payload)) {
    return createErrorResponse("Для импорта передан не список торговых операций.");
  }

  const prisma = getPrismaClient();
  const [stalkers, groups] = await Promise.all([
    prisma.stalker.findMany({ select: { id: true } }),
    prisma.stalkerGroup.findMany({ select: { id: true } }),
  ]);
  const existingStalkerIds = new Set(stalkers.map((stalker) => stalker.id));
  const existingGroupIds = new Set(groups.map((group) => group.id));
  const now = createSystemDate();
  let skippedLinks = 0;

  const candidates = payload
    .filter((item): item is TradeOperationPayload & { id: string } => {
      return Boolean(item) && typeof item === "object" && typeof (item as { id?: unknown }).id === "string";
    })
    .map((operation) => {
      if (!isTradeType(operation.type)) {
        return null;
      }

      const items = normalizeTradeItems(operation.items);

      if (items.length === 0) {
        return null;
      }

      const subject = normalizeTradeSubject(operation, existingStalkerIds, existingGroupIds);

      if (subject.skippedLink) {
        skippedLinks += 1;
      }

      const createdAt = parseStoredDate(operation.createdAt, now);
      const updatedAt = parseStoredDate(operation.updatedAt, createdAt);

      return {
        id: operation.id,
        type: operation.type,
        subjectType: subject.subjectType,
        stalkerId: subject.stalkerId,
        groupId: subject.groupId,
        manualParticipantName: subject.manualParticipantName,
        totalAmount: calculateTotalAmount(items),
        issuedBy: normalizeNullableString(operation.issuedBy),
        notes: normalizeNullableString(operation.notes),
        operationDate: parseNullableDate(operation.operationDate),
        createdAt,
        updatedAt,
        items,
      };
    })
    .filter((operation): operation is NonNullable<typeof operation> => Boolean(operation));

  if (candidates.length === 0) {
    return createErrorResponse("В переданном списке нет торговых операций, пригодных для импорта.");
  }

  await prisma.$transaction(
    candidates.flatMap((operation) => [
      prisma.tradeOperation.upsert({
        create: {
          id: operation.id,
          type: operation.type,
          subjectType: operation.subjectType,
          stalkerId: operation.stalkerId,
          groupId: operation.groupId,
          manualParticipantName: operation.manualParticipantName,
          totalAmount: operation.totalAmount,
          issuedBy: operation.issuedBy,
          notes: operation.notes,
          operationDate: operation.operationDate,
          createdAt: operation.createdAt,
          updatedAt: operation.updatedAt,
        },
        update: {
          type: operation.type,
          subjectType: operation.subjectType,
          stalkerId: operation.stalkerId,
          groupId: operation.groupId,
          manualParticipantName: operation.manualParticipantName,
          totalAmount: operation.totalAmount,
          issuedBy: operation.issuedBy,
          notes: operation.notes,
          operationDate: operation.operationDate,
          updatedAt: operation.updatedAt,
        },
        where: { id: operation.id },
      }),
      prisma.tradeOperationItem.deleteMany({ where: { operationId: operation.id } }),
      ...operation.items.map((item) =>
        prisma.tradeOperationItem.create({
          data: {
            ...item,
            operationId: operation.id,
          },
        }),
      ),
    ]),
  );

  const operations = await prisma.tradeOperation.findMany({
    include: tradeOperationInclude,
    orderBy: { createdAt: "desc" },
  });

  return Response.json({
    tradeOperations: operations.map(mapTradeOperationToResponse),
    skippedLinks,
  });
}
