"use client";

import { useState, useEffect } from "react";
import { Plus, Search, Package, Tag, Car, QrCode, Filter, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { fetchApi } from "@/lib/api";

interface Product {
  id: string;
  name: string;
  sku: string;
  brand?: string | null;
  compatibleVehicle?: string | null;
  stock?: number;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    sku: "",
    brand: "",
    compatibleVehicle: "",
  });

  const loadProducts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchApi<Product[]>("/products");
      setProducts(data);
    } catch (err: any) {
      setError(err.message || "خطا در دریافت لیست کالاها از بک‌اند");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.sku) return;

    setIsSubmitting(true);
    try {
      const newProduct = await fetchApi<Product>("/products", {
        method: "POST",
        body: JSON.stringify(formData),
      });

      setProducts([newProduct, ...products]);
      setFormData({ name: "", sku: "", brand: "", compatibleVehicle: "" });
      setIsDialogOpen(false);
    } catch (err: any) {
      alert(err.message || "خطا در ثبت کالا");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredProducts = products.filter(
    (product) =>
      product.name.includes(searchTerm) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.brand && product.brand.includes(searchTerm)) ||
      (product.compatibleVehicle && product.compatibleVehicle.includes(searchTerm))
  );

  return (
    <div className="space-y-6">
      {/* هدر صفحه */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">مدیریت کالاها و قطعات</h1>
          <p className="text-sm text-muted-foreground mt-1">
            تعریف کالا، کد فنی (SKU)، برند و بررسی موجودی کلی
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 shadow-sm">
              <Plus className="h-4 w-4" />
              افزودن کالای جدید
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>افزودن قطعه جدید به انبار</DialogTitle>
              <DialogDescription>
                مشخصات قطعه را وارد کنید. کد فنی (SKU) باید یکتا باشد.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddProduct} className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="name">نام قطعه / کالا *</Label>
                <Input
                  id="name"
                  placeholder="مثال: لنت ترمز جلو"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sku">کد فنی (SKU / شناسه یکتا) *</Label>
                <Input
                  id="sku"
                  placeholder="مثال: PAD-PRD-01"
                  className="font-mono text-left dir-ltr"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="brand">برند / سازنده</Label>
                  <Input
                    id="brand"
                    placeholder="مثال: تکستار"
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="compatibleVehicle">خودروی مرتبط</Label>
                  <Input
                    id="compatibleVehicle"
                    placeholder="مثال: پراید ۱۳۱"
                    value={formData.compatibleVehicle}
                    onChange={(e) =>
                      setFormData({ ...formData, compatibleVehicle: e.target.value })
                    }
                  />
                </div>
              </div>

              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  انصراف
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "در حال ثبت..." : "ثبت کالا"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* نمایش پیام خطا در صورت عدم برقراری ارتباط با بک‌اند */}
      {error && (
        <div className="flex items-center justify-between p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={loadProducts} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            تلاش مجدد
          </Button>
        </div>
      )}

      {/* نوار ابزار جستجو */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="جستجو بر اساس نام قطعه، کد فنی (SKU)، برند یا خودرو..."
              className="pr-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button variant="outline" className="gap-2 w-full sm:w-auto" onClick={loadProducts}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            بروزرسانی
          </Button>
        </CardContent>
      </Card>

      {/* جدول کالاها */}
      <Card>
        <CardHeader className="px-6 py-4 border-b">
          <CardTitle className="text-base font-semibold">
            لیست قطعات ثبت‌شده ({filteredProducts.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-right">کد فنی (SKU)</TableHead>
                <TableHead className="text-right">نام قطعه</TableHead>
                <TableHead className="text-right">برند / سازنده</TableHead>
                <TableHead className="text-right">خودروی مرتبط</TableHead>
                <TableHead className="text-center">موجودی کل</TableHead>
                <TableHead className="text-center">عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    در حال دریافت اطلاعات از سرور...
                  </TableCell>
                </TableRow>
              ) : filteredProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    هیچ کالایی یافت نشد.
                  </TableCell>
                </TableRow>
              ) : (
                filteredProducts.map((product) => (
                  <TableRow key={product.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="font-mono text-xs font-semibold">
                      <Badge variant="outline" className="font-mono dir-ltr">
                        {product.sku}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-primary shrink-0" />
                        <span>{product.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Tag className="h-3.5 w-3.5" />
                        <span>{product.brand || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Car className="h-3.5 w-3.5" />
                        <span>{product.compatibleVehicle || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={(product.stock || 0) < 10 ? "destructive" : "secondary"}
                        className="font-bold"
                      >
                        {product.stock ?? 0} عدد
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                        <QrCode className="h-3.5 w-3.5" />
                        چاپ برچسب
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
