import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Convierte código FCF ('2627') a formato legible ('26-27') */
export function fcfSeasonToApp(fcfSeason: string): string {
  if (fcfSeason.length === 4) {
    return `${fcfSeason.slice(0, 2)}-${fcfSeason.slice(2)}`;
  }
  return fcfSeason;
}

/** Formatea nombre FCF a legible: 'RIBAS CAELLES, LAURA' → 'Ribas Caelles, Laura' */
export function formatPlayerName(name: string): string {
  return name
    .split(', ')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(', ');
}
