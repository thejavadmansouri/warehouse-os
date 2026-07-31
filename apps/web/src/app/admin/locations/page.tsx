"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, MapPin, Search, PackageOpen } from "lucide-react";

import { getLocationChildren, resolveLocationByBarcode } from "@/lib/api";
import type { Location } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Crumb = { id: string | null; name: string };

export default function LocationsPage() {
  const [path, setPath] = React.useState<Crumb[]>([{ id: null, name: "همه طبقات" }]);
  const [current, setCurrent] = React.useState<Location | null>(null);
  const [barcode, setBarcode] = React.useState("");
  const [found, setFound] = React.useState<Location | null>(null);
  const [searchError, setSearchError] = React.useState<string | null>(null);

  const parentId = path[path.length - 1].id;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["loc-children", parentId],
    queryFn: () => getLocationChildren(parentId ?? undefined),
  });

  function open(node: Location) {
    setCurrent(node);
    setPath((p) => [...p, { id: node.id, name: node.name }]);
  }
  function goTo(index: number) {
    setPath((p) => p.slice(0, index + 1));
    setCurrent(null);
  }

  async function lookup() {
    const code = barcode.trim();
    if (!code) return;
    setSearchError(null);
    try {
      const loc = await resolveLocationByBarcode(code);
      setFound(loc);
    } catch {
      setFound(null);
      setSearchError("موقعیتی با این بارکد پیدا نشد");
    }
  }

  const children = data ?? [];
  const isLeaf = !isLoading && !isError && children.length === 0 && current != null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="موقعیت‌ها / قفسه‌ها"
        description="ساختار انبار را مرحله‌به‌مرحله باز کنید یا با بارکد یک موقعیت را پیدا کنید."
      />

      {/* Barcode lookup */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lookup()}
            placeholder="بارکد موقعیت را وارد یا اسکن کنید…"
            className="pr-9"
          />
        </div>
        <Button onClick={lookup} disabled={!barcode.trim()}>
          <Search className="ml-1 size-4" /> یافتن
        </Button>
      </div>

      {searchError && <p className="text-sm text-destructive">{searchError}</p>}
      {found && (
        <Card className="border-primary/40">
          <CardContent className="flex items-center gap-3 py-4">
            <MapPin className="size-5 text-primary" />
            <div className="flex-1">
              <div className="font-medium">{found.name}</div>
              <div className="text-sm text-muted-foreground">{found.path || found.code}</div>
            </div>
            <Badge variant="secondary" className="font-mono">{found.barcode || found.code}</Badge>
          </CardContent>
        </Card>
      )}

      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-1 text-sm">
        {path.map((c, i) => (
          <React.Fragment key={`${c.id ?? "root"}-${i}`}>
            {i > 0 && <ChevronLeft className="size-4 text-muted-foreground" />}
            <button
              onClick={() => goTo(i)}
              className={
                i === path.length - 1
                  ? "font-medium text-foreground"
                  : "text-primary hover:underline"
              }
            >
              {c.name}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Children */}
      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLeaf ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <PackageOpen className="size-8 text-muted-foreground" />
            <div className="text-lg font-medium">{current?.name}</div>
            <div className="text-sm text-muted-foreground">{current?.path}</div>
            <Badge variant="secondary" className="mt-1 font-mono text-base">
              {current?.barcode || current?.code}
            </Badge>
            <p className="mt-1 text-sm text-muted-foreground">این موقعیت زیرمجموعه‌ای ندارد.</p>
          </CardContent>
        </Card>
      ) : children.length === 0 ? (
        <EmptyState title="موقعیتی برای نمایش نیست" />
      ) : (
        <div className="grid gap-2">
          {children.map((node) => (
            <button key={node.id} onClick={() => open(node)} className="text-right">
              <Card className="transition-colors hover:border-primary/50">
                <CardContent className="flex items-center gap-3 py-3">
                  <MapPin className="size-5 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="font-medium">{node.name}</div>
                    {node.barcode || node.code ? (
                      <div className="font-mono text-xs text-muted-foreground">
                        {node.barcode || node.code}
                      </div>
                    ) : null}
                  </div>
                  {node.type?.name ? <Badge variant="outline">{node.type.name}</Badge> : null}
                  <ChevronLeft className="size-5 text-muted-foreground" />
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
