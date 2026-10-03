-- مقصد دوم بک‌آپ و آرشیو عکس‌ها.
--
-- بک‌آپ روی همان دیسکِ دیتابیس، بک‌آپ نیست: خرابی دیسک یا باج‌افزار هر دو را
-- با هم می‌برد. و `pg_dump` فقط دیتابیس است — عکس‌ها فایل‌اند و در هیچ دامپی
-- نیستند.

-- AlterTable
ALTER TABLE "BackupConfig" ADD COLUMN "mirrorPath" TEXT NOT NULL DEFAULT '';
ALTER TABLE "BackupConfig" ADD COLUMN "includeStorage" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
-- هر سه nullable: اجراهای گذشته نه مقصد دومی داشتند نه عکسی آرشیو کرده‌اند،
-- و `false` گفتنِ آن یعنی ادعای اینکه تلاش شده و شکست خورده.
ALTER TABLE "BackupRun" ADD COLUMN "mirrored" BOOLEAN;
ALTER TABLE "BackupRun" ADD COLUMN "mirrorError" TEXT;
ALTER TABLE "BackupRun" ADD COLUMN "storageBytes" BIGINT;
