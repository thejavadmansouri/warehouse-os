-- «چقدر واقعاً فروخته می‌شود» به‌عنوان سیگنالِ رتبه‌بندیِ جستجو.
--
-- چرا view و نه ستون روی Product: جستجو داغ‌ترین مسیرِ سیستم است و نباید سرِ هر
-- فروش یک UPDATE روی ردیفِ کالا بخورد (که هم قفل می‌گیرد و هم updatedAt را
-- عوض می‌کند — و updatedAt همان چیزی است که کاتالوگِ لوکالِ صندوق با آن sync
-- می‌شود؛ یعنی هر فروش کلِ کاتالوگِ همه‌ی صندوق‌ها را بی‌دلیل دوباره می‌کشید).
--
-- وزنِ زمانی عمدی است: چیزی که پارسال پرفروش بوده ولی امسال نه، نباید امروز
-- بالای لیست بنشیند.
CREATE MATERIALIZED VIEW "ProductPopularity" AS
SELECT
  l."productId"                                   AS "productId",
  SUM(
    CASE
      WHEN l."createdAt" > now() - interval '90 days'  THEN 3
      WHEN l."createdAt" > now() - interval '365 days' THEN 1
      ELSE 0
    END
  )::int                                          AS score,
  COUNT(*)::int                                   AS "salesCount",
  MAX(l."createdAt")                              AS "lastSoldAt"
FROM "InventoryLog" l
WHERE l.action = 'SALE'
GROUP BY l."productId";

-- یکتا لازم است تا بشود REFRESH ... CONCURRENTLY زد (بدون قفل‌کردنِ جستجو).
CREATE UNIQUE INDEX "ProductPopularity_productId_key"
  ON "ProductPopularity" ("productId");

CREATE INDEX "ProductPopularity_score_idx"
  ON "ProductPopularity" (score DESC);
