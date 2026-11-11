import { describe, expect, it } from "vitest";
import { requestSaleSum, requestStatus } from "../lib/requestMeta";
import type { ClientRequest, RequestPosition } from "../types/models";

const pos = (patch: Partial<RequestPosition>) => ({ status: "needs_review", parsed_qty: 1, retail_price: null, selected_price: null, ...patch }) as RequestPosition;
const req = (positions: RequestPosition[], status: ClientRequest["status"] = "review") =>
  ({ request_id: 1, doc_number: "1", client_name: "", status, positions, files: [], created_at: "", updated_at: "" }) as ClientRequest;

describe("requestSaleSum", () => {
  it("не подмешивает закупку в сумму продажи и считает строки без цены", () => {
    const r = req([pos({ parsed_qty: 20, selected_price: 410 }), pos({ parsed_qty: 1, retail_price: 500 }), pos({ status: "rejected", retail_price: 999 })]);
    expect(requestSaleSum(r)).toEqual({ sum: 500, unpriced: 1 });
  });
});

describe("requestStatus", () => {
  it("частично подтверждённый черновик требует проверки, полностью подтверждённый готов", () => {
    expect(requestStatus(req([pos({ status: "confirmed" }), pos({})], "draft"))).toBe("review");
    expect(requestStatus(req([pos({})], "draft"))).toBe("draft");
    expect(requestStatus(req([pos({ status: "confirmed" }), pos({ status: "rejected" })]))).toBe("ready");
    expect(requestStatus(req([]))).toBe("draft");
  });
});
