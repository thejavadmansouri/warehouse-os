"use client";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="btn btn-ink btn-primary px-4 py-2 text-xs">
      چاپ / ذخیره PDF
    </button>
  );
}
