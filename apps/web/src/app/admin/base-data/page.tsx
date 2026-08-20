"use client";

/**
 * داده‌های پایه — برند، خودرو، کاتالوگ قطعات، و انواع موقعیت.
 *
 * چهار جدولِ مرجع که ماهی یک بار باز می‌شوند و تا دیروز چهار آیتمِ جدا در منو
 * داشتند. چهار ردیفِ دائمی در منو برای کاری که سالی چند بار انجام می‌شود،
 * گران است: هر ردیف ارتفاع می‌گیرد و چیزی را که هر روز لازم است پایین‌تر
 * می‌برد.
 *
 * «انواع موقعیت» قبلاً زیر «انبار» بود نه «کاتالوگ» — ولی جنسش همین است:
 * داده‌ی مرجعی که یک بار تعریف می‌شود و بعد دست نمی‌خورد.
 */

import * as React from "react";
import { LibraryBig } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { BrandsPanel } from "../brands/page";
import { VehicleModelsPanel } from "../vehicle-models/page";
import { PartCatalogPanel } from "../part-catalog/page";
import { LocationTypesPanel } from "../location-types/page";

export default function BaseDataPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="داده‌های پایه"
        description="برندها، مدل‌های خودرو، کاتالوگ قطعات و انواع موقعیت"
        icon={LibraryBig}
      />

      <Tabs defaultValue="brands">
        <TabsList>
          <TabsTrigger value="brands">برندها</TabsTrigger>
          <TabsTrigger value="vehicles">مدل‌های خودرو</TabsTrigger>
          <TabsTrigger value="catalog">کاتالوگ قطعات</TabsTrigger>
          <TabsTrigger value="location-types">انواع موقعیت</TabsTrigger>
        </TabsList>

        <TabsContent value="brands" className="mt-4">
          <BrandsPanel embedded />
        </TabsContent>
        <TabsContent value="vehicles" className="mt-4">
          <VehicleModelsPanel embedded />
        </TabsContent>
        <TabsContent value="catalog" className="mt-4">
          <PartCatalogPanel embedded />
        </TabsContent>
        <TabsContent value="location-types" className="mt-4">
          <LocationTypesPanel embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}
