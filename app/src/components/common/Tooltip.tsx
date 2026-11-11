import React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

/**
 * Единый Provider тултипов приложения.
 * Ранее каждый IconButton создавал собственный Provider — это приводило к
 * лишним перерисовкам и рассинхрону задержек. Теперь провайдер один.
 */
export const TooltipProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <TooltipPrimitive.Provider delayDuration={350} skipDelayDuration={200}>
    {children}
  </TooltipPrimitive.Provider>
);

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  side = "top",
  align = "center",
  sideOffset = 6,
}) => {
  if (content == null || content === "") return <>{children}</>;

  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          className="tooltip"
          collisionPadding={8}
        >
          {content}
          <TooltipPrimitive.Arrow width={10} height={5} className="tooltip__arrow" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
};
