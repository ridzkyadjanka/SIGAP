import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, isAdminRole } from "@/lib/auth";
import { REPORT_TYPES, buildReport, parseFilters, type ReportKey } from "@/lib/reports";
import { reportToPdf, reportToXlsx } from "@/lib/export";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  const { type } = await params;
  if (!REPORT_TYPES.some((r) => r.key === type)) return NextResponse.json({ error: "Jenis laporan tidak dikenal" }, { status: 404 });
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const format = sp.format === "xlsx" ? "xlsx" : "pdf";
  const report = await buildReport(type as ReportKey, parseFilters(sp));
  const filename = `SIGAP_${type}_${sp.from ?? ""}_${sp.to ?? ""}.${format}`.replace(/_+/g, "_");
  await logAudit({ id: user.id, name: user.name }, "EXPORT", "Laporan", { detail: `${report.title} (${format.toUpperCase()}) — ${report.period}` });
  const body = format === "xlsx" ? await reportToXlsx(report, user.name) : reportToPdf(report, user.name);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
