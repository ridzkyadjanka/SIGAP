"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-bold">Terjadi kesalahan</h1>
      <p className="max-w-md text-sm text-gray-500">Permintaan tidak dapat diproses. Pastikan database berjalan, lalu coba lagi.</p>
      <button onClick={reset} className="btn-primary">Coba lagi</button>
    </div>
  );
}
