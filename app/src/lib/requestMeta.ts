import type { ClientRequest } from "../types/models";

/** Сумма продажи: только строки с ценой продажи; закупку в «сумму» не подмешиваем. */
export function requestSaleSum(request: ClientRequest) {
  let sum = 0;
  let unpriced = 0;
  for (const p of request.positions) {
    if (p.status === "rejected") continue;
    if (p.retail_price != null && p.retail_price > 0) sum += p.retail_price * (p.parsed_qty ?? 0);
    else unpriced += 1;
  }
  return { sum, unpriced };
}

/** Позиции, готовые к счёту: подтверждены и ещё не выставлены. */
export const readyCount = (request: ClientRequest) =>
  request.positions.filter((p) => p.status === "confirmed" && !p.invoiced_operation_id).length;

export type RequestStatusKind = "archived" | "matching" | "invoiced" | "draft" | "ready" | "review";

/** Единый статус документа для реестра и карточки, выводится из позиций. */
export function requestStatus(request: ClientRequest): RequestStatusKind {
  const active = request.positions.filter((p) => p.status !== "rejected");
  if (request.status === "archived") return "archived";
  if (request.status === "matching") return "matching";
  if (request.status === "invoiced" || (active.length > 0 && active.every((p) => p.invoiced_operation_id))) return "invoiced";
  if (active.length === 0) return "draft";
  if (active.every((p) => p.status === "confirmed")) return "ready";
  if (request.status === "draft" && !active.some((p) => p.status === "confirmed")) return "draft";
  return "review";
}
