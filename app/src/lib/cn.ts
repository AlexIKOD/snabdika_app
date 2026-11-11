import { clsx, type ClassValue } from "clsx";

/**
 * Единственная точка сборки имён классов дизайн-системы.
 * Позволяет передавать условные классы и локальные переопределения.
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
