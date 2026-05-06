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
} from "../trade-operation-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const tradeOperationInclude = {
  items: {
    orderBy: { name: "asc" },
  },
} as const;

function isNotFoundError(error: unknown) {
  return error !== null && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2025";
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const payload = (await request.json().catch(() => null)) as TradeOperationPayload | null;

  if (!payload || typeof payload !== "object") {
    return createErrorResponse("Переданы некорректные данные торговой операции.");
  }

  if (payload.type !== undefined && !isTradeType(payload.type)) {
    return createErrorResponse("Указан некорректный тип торговой операции.");
  }

  try {
    const prisma = getPrismaClient();
    const currentOperation = await prisma.tradeOperation.findUniqueOrThrow({
      include: tradeOperationInclude,
      where: { id },
    });
    const data: {
      type?: "sale" | "purchase";
      subjectType?: "stalker" | "group" | "manual";
      stalkerId?: string | null;
      groupId?: string | null;
      manualParticipantName?: string | null;
      totalAmount?: number;
      issuedBy?: string | null;
      notes?: string | null;
      operationDate?: Date | null;
      updatedAt: Date;
    } = {
      updatedAt: createSystemDate(),
    };

    if (isTradeType(payload.type)) {
      data.type = payload.type;
    }

    if (
      payload.subjectType !== undefined ||
      payload.stalkerId !== undefined ||
      payload.groupId !== undefined ||
      payload.manualParticipantName !== undefined
    ) {
      const [stalkers, groups] = await Promise.all([
        prisma.stalker.findMany({ select: { id: true } }),
        prisma.stalkerGroup.findMany({ select: { id: true } }),
      ]);
      const subject = normalizeTradeSubject(
        {
          subjectType: payload.subjectType ?? currentOperation.subjectType,
          stalkerId: payload.stalkerId ?? currentOperation.stalkerId,
          groupId: payload.groupId ?? currentOperation.groupId,
          manualParticipantName: payload.manualParticipantName ?? currentOperation.manualParticipantName,
        },
        new Set(stalkers.map((stalker) => stalker.id)),
        new Set(groups.map((group) => group.id)),
      );

      data.subjectType = subject.subjectType;
      data.stalkerId = subject.stalkerId;
      data.groupId = subject.groupId;
      data.manualParticipantName = subject.manualParticipantName;
    }

    if (payload.issuedBy !== undefined) {
      data.issuedBy = normalizeNullableString(payload.issuedBy);
    }

    if (payload.notes !== undefined) {
      data.notes = normalizeNullableString(payload.notes);
    }

    if (payload.operationDate !== undefined) {
      data.operationDate = parseNullableDate(payload.operationDate);
    }

    const operation = await prisma.$transaction(async (tx) => {
      if (payload.items !== undefined) {
        const items = normalizeTradeItems(payload.items);

        if (items.length === 0) {
          throw new Error("EMPTY_ITEMS");
        }

        await tx.tradeOperationItem.deleteMany({ where: { operationId: id } });
        await tx.tradeOperationItem.createMany({
          data: items.map((item) => ({
            ...item,
            operationId: id,
          })),
        });
        data.totalAmount = calculateTotalAmount(items);
      }

      await tx.tradeOperation.update({
        data,
        where: { id },
      });

      return tx.tradeOperation.findUniqueOrThrow({
        include: tradeOperationInclude,
        where: { id },
      });
    });

    return Response.json(mapTradeOperationToResponse(operation));
  } catch (error) {
    if (error instanceof Error && error.message === "EMPTY_ITEMS") {
      return createErrorResponse("Добавьте хотя бы один предмет.");
    }

    if (isNotFoundError(error)) {
      return createErrorResponse("Торговая операция не найдена.", 404);
    }

    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const prisma = getPrismaClient();
    await prisma.tradeOperation.delete({ where: { id } });

    return new Response(null, { status: 204 });
  } catch (error) {
    if (isNotFoundError(error)) {
      return createErrorResponse("Торговая операция не найдена.", 404);
    }

    throw error;
  }
}
