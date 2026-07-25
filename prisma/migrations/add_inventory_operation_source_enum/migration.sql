DO $$ BEGIN
    CREATE TYPE "InventoryOperationSource" AS ENUM (
        'MANUAL',
        'BARCODE',
        'VOICE',
        'IMPORT'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
