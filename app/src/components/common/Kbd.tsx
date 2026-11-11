import React from "react";
import { cn } from "../../lib/cn";

export interface KbdProps {
  children: React.ReactNode;
  /** Приглушённый вариант для тёмных поверхностей и плотных зон. */
  inverse?: boolean;
  className?: string;
}

/**
 * Тег клавиши в эстетике Linear / Raycast: моноширинный шрифт,
 * тонкая граница и «клавишный» рельеф нижней кромкой.
 */
export const Kbd: React.FC<KbdProps> = ({ children, inverse = false, className }) => (
  <kbd className={cn("kbd", inverse && "kbd--inverse", className)}>{children}</kbd>
);

/** Группа клавиш, соединённых знаком «+». */
export const KbdGroup: React.FC<{ keys: string[]; inverse?: boolean }> = ({ keys, inverse }) => (
  <span className="shortcut-row__keys" style={{ gap: 2 }}>
    {keys.map((k, i) => (
      <React.Fragment key={`${k}-${i}`}>
        {i > 0 && <span style={{ opacity: 0.5, fontSize: 10 }}>+</span>}
        <Kbd inverse={inverse}>{k}</Kbd>
      </React.Fragment>
    ))}
  </span>
);

