/**
 * ExportMenu.tsx — FUTFEM_APP
 * ─────────────────────────────────────────────────────────────────────────────
 * Botó "Exportar" amb menú Excel (.xlsx) / PDF per a una taula de jugadores.
 * Les llibreries (SheetJS, jsPDF) es carreguen amb import() dinàmic només quan
 * l'usuari exporta, per no engreixar la càrrega inicial.
 *
 * S'usa a dos llocs:
 *  · equip seleccionat  → includeTeam=false (sense columna Equip)
 *  · tota la lliga/grup → includeTeam=true  (amb columna Equip)
 */

import { ChevronDown, Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn, formatPlayerName } from '../lib/utils';
import type { FcfStat } from '../types';

interface Props {
  rows: FcfStat[];
  showMinutes: boolean;
  includeTeam: boolean;
  title: string;       // OAR VIC A  /  Tercera Federació
  subtitle: string;    // Tercera Federació · 25-26  /  25-26
  filenameBase: string;
}

function safeName(s: string): string {
  return s
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '') || 'export';
}

export default function ExportMenu({ rows, showMinutes, includeTeam, title, subtitle, filenameBase }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'xlsx' | 'pdf' | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  // Capçalera + files de la taula (compartit per Excel i PDF)
  const buildTable = () => {
    const header = [
      ...(includeTeam ? ['Equip'] : []),
      'Dorsal', 'Jugadora', 'PJ', 'TIT', 'SUP',
      ...(showMinutes ? ['MIN'] : []),
      'G', 'TA', 'TR',
    ];
    const sorted = [...rows].sort((a, b) =>
      includeTeam
        ? a.team_name.localeCompare(b.team_name) || b.partidos - a.partidos
        : b.partidos - a.partidos
    );
    const body = sorted.map(s => [
      ...(includeTeam ? [s.team_name] : []),
      s.dorsal ?? '',
      formatPlayerName(s.player_fcf_name),
      s.partidos, s.titular, s.suplente,
      ...(showMinutes ? [s.minutos] : []),
      s.goles, s.amarillas, s.rojas,
    ]);
    return { header, body };
  };

  const fname = safeName(filenameBase);

  async function exportExcel() {
    setBusy('xlsx');
    try {
      const XLSX = await import('xlsx');
      const { header, body } = buildTable();
      const aoa = [[title], [subtitle], [], header, ...body];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = header.map(h => ({ wch: h === 'Jugadora' ? 26 : h === 'Equip' ? 30 : 7 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Estadístiques');
      XLSX.writeFile(wb, `${fname}.xlsx`);
    } finally {
      setBusy(null);
      setOpen(false);
    }
  }

  async function exportPdf() {
    setBusy('pdf');
    try {
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const { header, body } = buildTable();
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(26);
      doc.text(title, 40, 44);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(120);
      doc.text(subtitle, 40, 61);
      autoTable(doc, {
        head: [header],
        body,
        startY: 76,
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [34, 78, 119], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [244, 247, 250] },
        margin: { left: 40, right: 40 },
      });
      doc.save(`${fname}.pdf`);
    } finally {
      setBusy(null);
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={busy !== null || rows.length === 0}
        className={cn(
          'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12.5px] font-bold border shadow-sm transition-all',
          'bg-accent border-accent text-white hover:brightness-110 active:scale-[.98]',
          (busy !== null || rows.length === 0) && 'opacity-50 cursor-not-allowed'
        )}
        title="Exportar aquesta taula a Excel o PDF"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} strokeWidth={2.5} />}
        Exportar
        <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 z-40 w-44 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-2xl overflow-hidden">
          <button
            onClick={exportExcel}
            disabled={busy !== null}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-semibold text-[var(--app-text)] hover:bg-brand/5 border-b border-[var(--card-border)] transition-colors"
          >
            <FileSpreadsheet size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
            Excel (.xlsx)
          </button>
          <button
            onClick={exportPdf}
            disabled={busy !== null}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-semibold text-[var(--app-text)] hover:bg-brand/5 transition-colors"
          >
            <FileText size={16} className="text-red-600 dark:text-red-400 shrink-0" />
            PDF
          </button>
        </div>
      )}
    </div>
  );
}
