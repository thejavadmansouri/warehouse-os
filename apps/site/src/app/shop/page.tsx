import * as React from "react";
import { Suspense } from "react";
import { CatalogHome } from "./_components/catalog-home";

export default function ShopPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-7xl px-4 py-8" />}>
      <CatalogHome />
    </Suspense>
  );
}