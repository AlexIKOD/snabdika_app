import React from "react";
import { AlertTriangle, Archive, CheckCircle2, FileText, Receipt, Sparkles } from "lucide-react";
import type { ClientRequest } from "../../types/models";
import { requestStatus, type RequestStatusKind } from "../../lib/requestMeta";
import { Badge, type BadgeVariant } from "../common/Badge";

const STATUS: Record<RequestStatusKind, { label: string; variant: BadgeVariant; Icon: typeof FileText }> = {
  archived: { label: "В архиве", variant: "neutral", Icon: Archive },
  matching: { label: "Сопоставление ИИ", variant: "accent", Icon: Sparkles },
  invoiced: { label: "Счёт выставлен", variant: "violet", Icon: Receipt },
  draft: { label: "Черновик", variant: "neutral", Icon: FileText },
  ready: { label: "Готово к счёту", variant: "success", Icon: CheckCircle2 },
  review: { label: "Требует проверки", variant: "warning", Icon: AlertTriangle },
};

export const RequestStatusBadge: React.FC<{ request: ClientRequest }> = ({ request }) => {
  const { label, variant, Icon } = STATUS[requestStatus(request)];
  return (
    <Badge variant={variant} pill icon={<Icon size={12} strokeWidth={1.9} />}>
      {label}
    </Badge>
  );
};
