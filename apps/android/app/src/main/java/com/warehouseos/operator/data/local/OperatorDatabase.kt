package com.warehouseos.operator.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        OutboxEntity::class,
        CatalogProductEntity::class,
        WorkTaskEntity::class,
        WorkTaskItemEntity::class,
        PendingPhotoEntity::class,
    ],
    version = 6,
    exportSchema = false,
)
abstract class OperatorDatabase : RoomDatabase() {
    abstract fun outboxDao(): OutboxDao
    abstract fun catalogDao(): CatalogDao
    abstract fun workTaskDao(): WorkTaskDao
    abstract fun pendingPhotoDao(): PendingPhotoDao

    companion object {
        /** v1 → v2: جدول کاتالوگ آفلاین اضافه شد. */
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `catalog_product` (
                        `id` TEXT NOT NULL,
                        `name` TEXT NOT NULL,
                        `sku` TEXT NOT NULL,
                        `partNumber` TEXT,
                        `unit` TEXT NOT NULL,
                        `isActive` INTEGER NOT NULL,
                        `searchTokens` TEXT NOT NULL,
                        `barcodes` TEXT NOT NULL,
                        `brand` TEXT,
                        `vehicleModel` TEXT,
                        `updatedAt` INTEGER NOT NULL,
                        `deleted` INTEGER NOT NULL,
                        PRIMARY KEY(`id`)
                    )
                    """.trimIndent(),
                )
                db.execSQL("CREATE INDEX IF NOT EXISTS index_catalog_product_sku ON catalog_product (`sku`)")
            }
        }

        /** v2 → v3: ستون payload برای درخواست کالای جدید آفلاین. */
        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `outbox` ADD COLUMN `payload` TEXT DEFAULT NULL")
            }
        }

        /** v3 → v4: کش محلیِ «کارهای انبار» (WorkTask + قلم‌ها). */
        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `work_task` (
                        `id` TEXT NOT NULL,
                        `status` TEXT NOT NULL,
                        `invoiceNumber` TEXT,
                        `quotationNumber` TEXT,
                        `note` TEXT,
                        `requestedByName` TEXT,
                        `assignedToName` TEXT,
                        `doneItems` INTEGER NOT NULL,
                        `totalItems` INTEGER NOT NULL,
                        `createdAt` INTEGER NOT NULL,
                        `updatedAt` INTEGER NOT NULL,
                        PRIMARY KEY(`id`)
                    )
                    """.trimIndent(),
                )
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `work_task_item` (
                        `id` TEXT NOT NULL,
                        `taskId` TEXT NOT NULL,
                        `position` INTEGER NOT NULL,
                        `status` TEXT NOT NULL,
                        `productName` TEXT NOT NULL,
                        `productSku` TEXT,
                        `unit` TEXT,
                        `quantity` INTEGER NOT NULL,
                        `locationName` TEXT,
                        `locationBarcode` TEXT,
                        `locationPath` TEXT,
                        `doneById` TEXT,
                        PRIMARY KEY(`id`)
                    )
                    """.trimIndent(),
                )
                db.execSQL("CREATE INDEX IF NOT EXISTS index_work_task_item_taskId ON work_task_item (`taskId`)")
            }
        }

        /** v4 → v5: صف عکسِ عملیات‌های ثبت‌شده (آپلود فقط روی وای‌فای). */
        val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `pending_photo` (
                        `id` TEXT NOT NULL,
                        `clientRequestId` TEXT NOT NULL,
                        `filePath` TEXT NOT NULL,
                        `bytes` INTEGER NOT NULL,
                        `status` TEXT NOT NULL,
                        `attemptCount` INTEGER NOT NULL,
                        `lastError` TEXT,
                        `createdAt` INTEGER NOT NULL,
                        PRIMARY KEY(`id`)
                    )
                    """.trimIndent(),
                )
                db.execSQL(
                    "CREATE INDEX IF NOT EXISTS index_pending_photo_clientRequestId ON pending_photo (`clientRequestId`)",
                )

                // Converge the two histories of catalog_product. Phones that came
                // through MIGRATION_1_2 already have this index; phones first
                // installed at v2–v4 (schema built from the entity, which did not
                // declare it) do not. The entity now declares it, so both paths
                // must end up with it or Room's validation kills the app on launch.
                db.execSQL(
                    "CREATE INDEX IF NOT EXISTS index_catalog_product_sku ON catalog_product (`sku`)",
                )
            }
        }

        /**
         * v5 → v6: جهتِ کار (برداشتن یا چیدن).
         *
         * پیش‌فرض 'PICK' لازم است نه اختیاری: ستون NOT NULL است و ردیف‌های
         * موجود در گوشی مقداری ندارند. بدون DEFAULT، مهاجرت روی هر گوشی‌ای که
         * کاری در صف دارد شکست می‌خورد.
         */
        val MIGRATION_5_6 = object : Migration(5, 6) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "ALTER TABLE work_task ADD COLUMN kind TEXT NOT NULL DEFAULT 'PICK'",
                )
            }
        }
    }
}
