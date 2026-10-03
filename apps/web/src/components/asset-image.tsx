"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getAssetImageUrl, setProductImageFromAsset } from "@/lib/api";

/** عکسِ انبار (INVENTORY_IMAGE) با توکن fetch می‌شود — چون پشت JwtAuthGuard است. */
function useAssetUrl(
  assetId: string | null,
  variant: "thumb" | "full",
  enabled = true,
) {
  return useQuery({
    queryKey: ["asset-image", assetId, variant],
    queryFn: () => getAssetImageUrl(assetId!, variant),
    enabled: !!assetId && enabled,
    staleTime: Infinity,
    retry: 1,
  });
}

/** تامب‌نیل کوچکِ یک عکس — کلیک، لایت‌باکسِ تمام‌اندازه را باز می‌کند. */
export function AssetThumb({
  assetId,
  onOpen,
}: {
  assetId: string;
  onOpen: () => void;
}) {
  const { data: url, isLoading } = useAssetUrl(assetId, "thumb");
  return (
    <button
      type="button"
      onClick={onOpen}
      title="نمایش عکس گرفته‌شده"
      className="shrink-0 cursor-pointer rounded-md border bg-background transition-opacity hover:opacity-80"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="عکس عملیات"
          className="h-9 w-9 rounded-md object-cover"
        />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {isLoading ? (
            <span className="h-3 w-3 animate-pulse rounded-full bg-current opacity-40" />
          ) : (
            <Camera className="h-4 w-4" />
          )}
        </span>
      )}
    </button>
  );
}

/** لایت‌باکسِ تمام‌اندازه‌ی یک عکس عملیات. */
export function AssetLightbox({
  assetId,
  open,
  onOpenChange,
  productId,
  canEdit = false,
}: {
  assetId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** اگر داده شود، دکمهٔ «استفاده به عنوان تصویر محصول» در لایت‌باکس می‌آید. */
  productId?: string;
  canEdit?: boolean;
}) {
  const { data: url, isLoading, isError } = useAssetUrl(assetId, "full", open);
  const qc = useQueryClient();
  const setAs = useMutation({
    mutationFn: () => setProductImageFromAsset(productId!, assetId!),
    onSuccess: () => {
      toast.success("این عکس، تصویر محصول شد");
      qc.invalidateQueries({ queryKey: ["product", productId] });
      qc.invalidateQueries({ queryKey: ["products"] });
      onOpenChange(false);
    },
    onError: () => {
      toast.error("خطا در ثبت تصویر محصول");
    },
  });
  const showSetButton = !!productId && canEdit && !!assetId;
  return (
    <Dialog open={open && !!assetId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl overflow-hidden p-0 sm:max-w-4xl">
        <DialogTitle className="sr-only">عکس عملیات</DialogTitle>
        <div className="relative flex max-h-[80vh] items-center justify-center bg-black/90 p-2">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt="عکس عملیات"
              className="max-h-[74vh] w-auto rounded-sm object-contain"
            />
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-white/70">
              {isLoading
                ? "در حال دریافت عکس…"
                : isError
                  ? "عکس در دسترس نیست"
                  : ""}
            </div>
          )}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="بستن"
            className="absolute left-2 top-2 rounded-full bg-black/60 p-1.5 text-white/90 transition-colors hover:bg-black/80"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {showSetButton ? (
          <div className="flex items-center justify-center gap-2 border-t bg-card px-3 py-2.5">
            <Button
              size="sm"
              onClick={() => setAs.mutate()}
              disabled={setAs.isPending}
            >
              {setAs.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
              استفاده به عنوان تصویر محصول
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
