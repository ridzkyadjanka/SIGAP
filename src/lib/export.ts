import "server-only";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Report } from "./reports";
import { formatDateTime } from "./dates";

const NAVY = "14213D";
const RED = "C8102E";

export async function reportToXlsx(r: Report, author: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = `SIGAP — ${author}`;
  wb.created = new Date();
  const ws = wb.addWorksheet(r.title.slice(0, 31), { views: [{ state: "frozen", ySplit: 6 }] });
  const width = Math.max(r.columns.length, 4);
  ws.mergeCells(1, 1, 1, width);
  ws.getCell(1, 1).value = `SIGAP — ${r.title}`;
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: `FF${NAVY}` } };
  const meta = [
    ["Periode", r.period],
    ["Filter", r.filtersText],
    ["Dibuat", `${formatDateTime(new Date())} oleh ${author}`],
  ];
  meta.forEach(([k, v], i) => {
    ws.getCell(2 + i, 1).value = k;
    ws.getCell(2 + i, 1).font = { bold: true, color: { argb: "FF6B7280" } };
    ws.mergeCells(2 + i, 2, 2 + i, width);
    ws.getCell(2 + i, 2).value = v;
  });
  const header = ws.getRow(6);
  r.columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${NAVY}` } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  header.height = 22;
  const rosterColors: Record<string, string> = { P: "FFD1FAE5", M: "FFDBEAFE", L: "FFFEE2E2", C: "FFFFEDD5" };
  r.rows.forEach((row, ri) => {
    const xr = ws.getRow(7 + ri);
    row.forEach((v, ci) => {
      const cell = xr.getCell(ci + 1);
      cell.value = v;
      cell.border = { bottom: { style: "thin", color: { argb: "FFE5E7EB" } } };
      if (r.key === "roster" && ci >= 2) {
        cell.alignment = { horizontal: "center" };
        const col = rosterColors[String(v)];
        if (col) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: col } };
      }
    });
  });
  r.columns.forEach((c, i) => {
    const len = Math.max(c.length, ...r.rows.map((row) => String(row[i] ?? "").length));
    ws.getColumn(i + 1).width = r.key === "roster" && i >= 2 ? 4 : Math.min(45, Math.max(8, len + 2));
  });
  if (r.summary?.length) {
    const start = 8 + r.rows.length;
    ws.getCell(start, 1).value = "Ringkasan";
    ws.getCell(start, 1).font = { bold: true, color: { argb: `FF${RED}` } };
    r.summary.forEach((s, i) => {
      ws.getCell(start + 1 + i, 1).value = s.label;
      ws.getCell(start + 1 + i, 2).value = s.value;
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function reportToPdf(r: Report, author: string): Buffer {
  const wide = r.columns.length > 7;
  const doc = new jsPDF({ orientation: wide ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(20, 33, 61);
  doc.rect(0, 0, pageW, 22, "F");
  doc.setFillColor(200, 16, 46);
  doc.rect(0, 22, pageW, 1.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("SIGAP", 12, 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Sistem Informasi Gerak dan Penugasan", 12, 15);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(r.title, pageW - 12, 12, { align: "right" });

  doc.setTextColor(20, 33, 61);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Periode: ${r.period}`, 12, 31);
  doc.text(`Filter: ${r.filtersText}`, 12, 36);
  doc.text(`Dibuat: ${formatDateTime(new Date())} oleh ${author}`, 12, 41);

  const isRoster = r.key === "roster";
  autoTable(doc, {
    startY: 46,
    head: [r.columns],
    body: r.rows.map((row) => row.map((v) => String(v))),
    styles: { fontSize: isRoster ? 6 : 8, cellPadding: isRoster ? 1 : 2, overflow: "linebreak" },
    headStyles: { fillColor: [20, 33, 61], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 10, right: 10 },
    didParseCell: (data) => {
      if (isRoster && data.section === "body" && data.column.index >= 2) {
        data.cell.styles.halign = "center";
        const map: Record<string, [number, number, number]> = { P: [209, 250, 229], M: [219, 234, 254], L: [254, 226, 226], C: [255, 237, 213] };
        const c = map[String(data.cell.raw)];
        if (c) data.cell.styles.fillColor = c;
      }
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let y = ((doc as any).lastAutoTable?.finalY ?? 50) + 8;
  if (r.summary?.length) {
    if (y > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.setTextColor(200, 16, 46);
    doc.text("Ringkasan", 12, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(20, 33, 61);
    r.summary.forEach((s, i) => doc.text(`${s.label}: ${s.value}`, 12, y + 5 + i * 5));
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`SIGAP · ${r.title} · Halaman ${i} dari ${pages}`, pageW / 2, doc.internal.pageSize.getHeight() - 6, { align: "center" });
  }
  return Buffer.from(doc.output("arraybuffer"));
}
