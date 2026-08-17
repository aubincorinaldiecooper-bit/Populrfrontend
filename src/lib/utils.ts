import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * The class combinator every ui/ primitive builds on: clsx for conditionals,
 * tailwind-merge so a caller's `className` genuinely overrides a primitive's
 * own utilities (last `px-*` wins) instead of fighting it in specificity.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
