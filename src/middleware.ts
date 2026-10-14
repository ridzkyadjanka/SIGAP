import { NextResponse, type NextRequest } from "next/server";

// Lapisan pertama: halaman terproteksi wajib memiliki cookie sesi.
// Validasi sesi, peran (RBAC), dan status akun dilakukan di server (layout & server action).
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has("sigap_session");
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/portal/:path*", "/ganti-password", "/api/reports/:path*"],
};
