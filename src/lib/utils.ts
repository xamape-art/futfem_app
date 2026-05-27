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

/** SC1: Formata una data ISO en text relatiu: 'avui', 'ahir', 'fa N dies' */
export function formatDateRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'avui';
  if (days === 1) return 'ahir';
  return `fa ${days} dies`;
}
