"use client";

// دکمه‌ی قلبِ علاقه‌مندی. ورود نباشد، کلیک، پنل ورود را باز می‌کند.
import { useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Heart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

import { addFavorite, getFavoriteIds, removeFavorite } from "@/lib/shop-api";
import { useShopAuth } from "@/lib/shop-auth";
import { useShopLogin } from "@/lib/shop-login-ui";

export function useFavoriteIds() {
  const token = useShopAuth((s) => s.token);
  return useQuery({
    queryKey: ["shop", "favorites", "ids"],
    enabled: !!token,
    queryFn: getFavoriteIds,
    staleTime: 60_000,
  });
}

export function FavoriteButton({
  productId,
  size = "icon",
}: {
  productId: string;
  size?: "icon" | "sm";
}) {
  const queryClient = useQueryClient();
  const token = useShopAuth((s) => s.token);
  const requestLogin = useShopLogin((s) => s.request);
  const { data } = useFavoriteIds();

  const active = useMemo(() => (data ? data.includes(productId) : false), [data, productId]);

  const toggle = useMutation({
    mutationFn: async () => {
      if (active) await removeFavorite(productId);
      else await addFavorite(productId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shop", "favorites"] });
      toast.success(active ? "از علاقه‌مندی‌ها حذف شد" : "به علاقه‌مندی اضافه شد");
    },
    onError: () => toast.error("عمل ناموفق بود"),
  });

  const onClick = () => {
    if (!token) {
      requestLogin();
      return;
    }
    toggle.mutate();
  };

  const label = active ? "حذف از علاقه‌مندی" : "افزودن به علاقه‌مندی";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size={size}
            aria-label={label}
            aria-pressed={active}
            disabled={toggle.isPending}
            onClick={onClick}
            className={active ? "text-rose-500" : "text-muted-foreground"}
          >
            <Heart className="size-4" style={active ? { fill: "currentColor" } : undefined} aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}