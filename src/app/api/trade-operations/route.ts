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
  type TradeOperationPayload,
} from "./trade-operation-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const tradeOperationInclude = {
  items: {
    orderBy: { name: "asc" },
  },
} as const;

export async function GET() {
  const prisma = getPrismaClient();
  const operations = await prisma.tradeOperation.findMany({
    include: tradeOperationInclude,
    orderBy: { createdAt: "desc" },
  });

  return Response.json(operations.map(mapTradeOperationToResponse));
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as TradeOperationPayload | null;

  if (!payload || typeof payload !== "object") {
    return createErrorResponse("Переданы некорректные данные торговой операции.");
  }

  if (!isTradeType(payload.type)) {
    return createErrorResponse("Указан некорректный тип торговой операции.");
  }

  const items = normalizeTradeItems(payload.items);

  if (items.length === 0) {
    return createErrorResponse("Добавьте хотя бы один предмет.");
  }

  const prisma = getPrismaClient();
  const [stalkers, groups] = await Promise.all([
    prisma.stalker.findMany({ select: { id: true } }),
    prisma.stalkerGroup.findMany({ select: { id: true } }),
  ]);
  const subject = normalizeTradeSubject(
    payload,
    new Set(stalkers.map((stalker) => stalker.id)),
    new Set(groups.map((group) => group.id)),
  );
  const now = createSystemDate();
  const operation = await prisma.tradeOperation.create({
    data: {
      id: crypto.randomUUID(),
      type: payload.type,
      subjectType: subject.subjectType,
      stalkerId: subject.stalkerId,
      groupId: subject.groupId,
      manualParticipantName: subject.manualParticipantName,
      totalAmount: calculateTotalAmount(items),
      issuedBy: normalizeNullableString(payload.issuedBy),
      notes: normalizeNullableString(payload.notes),
      operationDate: parseNullableDate(payload.operationDate),
      createdAt: now,
      updatedAt: now,
      items: {
        create: items,
      },
    },
    include: tradeOperationInclude,
  });

  return Response.json(mapTradeOperationToResponse(operation), { status: 201 });
}
