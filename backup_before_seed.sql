--
-- PostgreSQL database dump
--

\restrict Sxkvg0az9wuuVVetJOExMXs3SaNF5bMJZEOyx1TOUbRwvy92MOWCEgVgxZ2MGY4

-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: postgres
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO postgres;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: postgres
--

COMMENT ON SCHEMA public IS '';


--
-- Name: AssetType; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."AssetType" AS ENUM (
    'PRODUCT_IMAGE',
    'DAMAGE_IMAGE',
    'INVOICE_IMAGE',
    'INVENTORY_IMAGE',
    'OTHER'
);


ALTER TYPE public."AssetType" OWNER TO postgres;

--
-- Name: BarcodeStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."BarcodeStatus" AS ENUM (
    'GOOD',
    'BAD',
    'UNKNOWN'
);


ALTER TYPE public."BarcodeStatus" OWNER TO postgres;

--
-- Name: BarcodeType; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."BarcodeType" AS ENUM (
    'INTERNAL',
    'FACTORY',
    'QR',
    'OTHER'
);


ALTER TYPE public."BarcodeType" OWNER TO postgres;

--
-- Name: ImportRowStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."ImportRowStatus" AS ENUM (
    'READY',
    'NEW_BRAND',
    'NEW_PART',
    'NEW_VEHICLE',
    'COMPLETED',
    'FAILED'
);


ALTER TYPE public."ImportRowStatus" OWNER TO postgres;

--
-- Name: InventoryAction; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."InventoryAction" AS ENUM (
    'IN',
    'OUT',
    'TRANSFER',
    'ADJUST',
    'SALE',
    'RETURN',
    'COUNT'
);


ALTER TYPE public."InventoryAction" OWNER TO postgres;

--
-- Name: LocationLevel; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."LocationLevel" AS ENUM (
    'WAREHOUSE',
    'ZONE',
    'RACK',
    'SHELF',
    'BIN'
);


ALTER TYPE public."LocationLevel" OWNER TO postgres;

--
-- Name: Role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."Role" AS ENUM (
    'ADMIN',
    'MANAGER',
    'STAFF'
);


ALTER TYPE public."Role" OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: AccountingSync; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."AccountingSync" (
    id text NOT NULL,
    "productId" text NOT NULL,
    system text NOT NULL,
    "externalId" text,
    "lastSync" timestamp(3) without time zone,
    status text DEFAULT 'PENDING'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."AccountingSync" OWNER TO postgres;

--
-- Name: Asset; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Asset" (
    id text NOT NULL,
    path text NOT NULL,
    "fileName" text,
    type public."AssetType" NOT NULL,
    "productId" text,
    "inventoryLogId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Asset" OWNER TO postgres;

--
-- Name: AuditLog; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."AuditLog" (
    id text NOT NULL,
    "userId" text,
    action text NOT NULL,
    entity text NOT NULL,
    "entityId" text,
    "oldData" jsonb,
    "newData" jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."AuditLog" OWNER TO postgres;

--
-- Name: Brand; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Brand" (
    id text NOT NULL,
    name text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    aliases text[] DEFAULT ARRAY[]::text[]
);


ALTER TABLE public."Brand" OWNER TO postgres;

--
-- Name: Category; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Category" (
    id text NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Category" OWNER TO postgres;

--
-- Name: ImportJob; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."ImportJob" (
    id text NOT NULL,
    "fileName" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."ImportJob" OWNER TO postgres;

--
-- Name: ImportRow; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."ImportRow" (
    id text NOT NULL,
    "importJobId" text NOT NULL,
    "rowNumber" integer NOT NULL,
    "productName" text NOT NULL,
    "brandName" text,
    "vehicleModelName" text,
    "partNumber" text,
    unit text DEFAULT 'عدد'::text,
    "purchasePrice" integer,
    "salePrice" integer,
    "wholesalePrice" integer,
    quantity integer DEFAULT 0,
    "matchedBrandId" text,
    "matchedCatalogId" text,
    "matchedVehicleId" text,
    status public."ImportRowStatus" DEFAULT 'READY'::public."ImportRowStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."ImportRow" OWNER TO postgres;

--
-- Name: Inventory; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Inventory" (
    id text NOT NULL,
    "productId" text NOT NULL,
    "locationId" text NOT NULL,
    quantity integer DEFAULT 0 NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Inventory" OWNER TO postgres;

--
-- Name: InventoryCount; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."InventoryCount" (
    id text NOT NULL,
    "sessionId" text NOT NULL,
    "locationId" text NOT NULL,
    "userId" text,
    status text DEFAULT 'OPEN'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "finishedAt" timestamp(3) without time zone
);


ALTER TABLE public."InventoryCount" OWNER TO postgres;

--
-- Name: InventoryItem; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."InventoryItem" (
    id text NOT NULL,
    "countId" text NOT NULL,
    "productId" text,
    name text NOT NULL,
    "categoryId" text,
    "brandId" text,
    "vehicleModelId" text,
    "goodQuantity" integer DEFAULT 0 NOT NULL,
    "badQuantity" integer DEFAULT 0 NOT NULL,
    image text,
    note text,
    "voiceText" text,
    "voiceConfidence" double precision,
    "recognizedName" text,
    "recognizedBrand" text,
    "recognizedCategory" text,
    "voiceSessionId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."InventoryItem" OWNER TO postgres;

--
-- Name: InventoryLog; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."InventoryLog" (
    id text NOT NULL,
    "productId" text NOT NULL,
    "locationId" text NOT NULL,
    quantity integer NOT NULL,
    action public."InventoryAction" NOT NULL,
    note text,
    "userId" text,
    "sessionId" text,
    "voiceRecordId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."InventoryLog" OWNER TO postgres;

--
-- Name: InventorySession; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."InventorySession" (
    id text NOT NULL,
    "warehouseId" text,
    "userId" text,
    "startedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "finishedAt" timestamp(3) without time zone,
    status text DEFAULT 'OPEN'::text NOT NULL
);


ALTER TABLE public."InventorySession" OWNER TO postgres;

--
-- Name: InventorySessionLocation; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."InventorySessionLocation" (
    id text NOT NULL,
    "sessionId" text NOT NULL,
    "locationId" text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    "startedAt" timestamp(3) without time zone,
    "finishedAt" timestamp(3) without time zone
);


ALTER TABLE public."InventorySessionLocation" OWNER TO postgres;

--
-- Name: ItemBarcode; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."ItemBarcode" (
    id text NOT NULL,
    "itemId" text NOT NULL,
    barcode text NOT NULL,
    status public."BarcodeStatus" DEFAULT 'GOOD'::public."BarcodeStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."ItemBarcode" OWNER TO postgres;

--
-- Name: Location; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Location" (
    id text NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    barcode text NOT NULL,
    "warehouseId" text,
    "typeId" text NOT NULL,
    "parentId" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Location" OWNER TO postgres;

--
-- Name: LocationType; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."LocationType" (
    id text NOT NULL,
    name text NOT NULL,
    level public."LocationLevel" NOT NULL
);


ALTER TABLE public."LocationType" OWNER TO postgres;

--
-- Name: PartCatalog; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."PartCatalog" (
    id text NOT NULL,
    name text NOT NULL,
    aliases text[] DEFAULT ARRAY[]::text[],
    unit text DEFAULT 'عدد'::text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."PartCatalog" OWNER TO postgres;

--
-- Name: Product; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Product" (
    id text NOT NULL,
    name text NOT NULL,
    sku text NOT NULL,
    "partNumber" text,
    description text,
    unit text DEFAULT 'عدد'::text NOT NULL,
    weight double precision,
    "minStock" integer DEFAULT 0 NOT NULL,
    "categoryId" text,
    "brandId" text,
    "vehicleModelId" text,
    "supplierId" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "partCatalogId" text
);


ALTER TABLE public."Product" OWNER TO postgres;

--
-- Name: ProductBarcode; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."ProductBarcode" (
    id text NOT NULL,
    barcode text NOT NULL,
    type public."BarcodeType" NOT NULL,
    "productId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."ProductBarcode" OWNER TO postgres;

--
-- Name: ProductPrice; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."ProductPrice" (
    id text NOT NULL,
    "productId" text NOT NULL,
    "purchasePrice" integer,
    "salePrice" integer,
    "wholesalePrice" integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."ProductPrice" OWNER TO postgres;

--
-- Name: Supplier; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Supplier" (
    id text NOT NULL,
    name text NOT NULL,
    phone text,
    address text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Supplier" OWNER TO postgres;

--
-- Name: User; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."User" (
    id text NOT NULL,
    username text NOT NULL,
    password text NOT NULL,
    "fullName" text NOT NULL,
    role public."Role" DEFAULT 'STAFF'::public."Role" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."User" OWNER TO postgres;

--
-- Name: VehicleModel; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."VehicleModel" (
    id text NOT NULL,
    name text NOT NULL,
    "startYear" integer NOT NULL,
    "endYear" integer NOT NULL,
    "systemType" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    aliases text[] DEFAULT ARRAY[]::text[]
);


ALTER TABLE public."VehicleModel" OWNER TO postgres;

--
-- Name: VoiceRecord; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."VoiceRecord" (
    id text NOT NULL,
    "filePath" text NOT NULL,
    text text,
    confidence double precision,
    status text DEFAULT 'PENDING'::text NOT NULL,
    "productId" text,
    "userId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."VoiceRecord" OWNER TO postgres;

--
-- Name: VoiceSession; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."VoiceSession" (
    id text NOT NULL,
    "userId" text,
    "startedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "finishedAt" timestamp(3) without time zone,
    "isActive" boolean DEFAULT true NOT NULL
);


ALTER TABLE public."VoiceSession" OWNER TO postgres;

--
-- Name: Warehouse; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Warehouse" (
    id text NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Warehouse" OWNER TO postgres;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO postgres;

--
-- Data for Name: AccountingSync; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."AccountingSync" (id, "productId", system, "externalId", "lastSync", status, "createdAt") FROM stdin;
\.


--
-- Data for Name: Asset; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Asset" (id, path, "fileName", type, "productId", "inventoryLogId", "createdAt") FROM stdin;
\.


--
-- Data for Name: AuditLog; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."AuditLog" (id, "userId", action, entity, "entityId", "oldData", "newData", "createdAt") FROM stdin;
\.


--
-- Data for Name: Brand; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Brand" (id, name, "createdAt", aliases) FROM stdin;
6d9873d8-5669-43b2-ab4a-47b8433039aa	تکستار	2026-07-23 16:53:31.737	{}
737a4400-b300-4ab5-9db9-b545f7769f84	برند تست	2026-07-23 16:53:31.807	{}
\.


--
-- Data for Name: Category; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Category" (id, name, code, "createdAt") FROM stdin;
\.


--
-- Data for Name: ImportJob; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."ImportJob" (id, "fileName", "createdAt", "updatedAt") FROM stdin;
7d2956a7-a7b8-414b-8506-79103e17af08	test.xlsx	2026-07-23 16:53:06.576	2026-07-23 16:53:06.576
\.


--
-- Data for Name: ImportRow; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."ImportRow" (id, "importJobId", "rowNumber", "productName", "brandName", "vehicleModelName", "partNumber", unit, "purchasePrice", "salePrice", "wholesalePrice", quantity, "matchedBrandId", "matchedCatalogId", "matchedVehicleId", status, "createdAt", "updatedAt") FROM stdin;
435d6deb-9a9f-4a16-8caa-2aa203b7b644	7d2956a7-a7b8-414b-8506-79103e17af08	1	لنت ترمز جلو	تکستار	پراید	TX-101	عدد	1500000	2000000	1800000	10	\N	7782d561-f17a-48a4-8962-40ee525e2de4	\N	COMPLETED	2026-07-23 16:53:06.583	2026-07-23 16:53:31.803
13ffcdee-2346-46d8-86a6-96d8c0789024	7d2956a7-a7b8-414b-8506-79103e17af08	2	فیلتر روغن جدید	برند تست	خودرو تست	FL-999	عدد	50000	80000	70000	20	\N	\N	\N	COMPLETED	2026-07-23 16:53:06.583	2026-07-23 16:53:31.818
\.


--
-- Data for Name: Inventory; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Inventory" (id, "productId", "locationId", quantity, version, "updatedAt") FROM stdin;
9d7f654c-59ae-4772-b758-a6e109c9f83a	b654c60a-de1a-4013-922b-7d97b4e3318b	4c12d40e-b1fa-41c7-ad3e-c4a672c38c01	50	1	2026-07-23 11:06:32.677
\.


--
-- Data for Name: InventoryCount; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."InventoryCount" (id, "sessionId", "locationId", "userId", status, "createdAt", "finishedAt") FROM stdin;
ed30ef35-c2a6-48b8-8378-fab156feb350	4cde7a34-9417-4523-b113-94c17d51f8e4	4c12d40e-b1fa-41c7-ad3e-c4a672c38c01	\N	OPEN	2026-07-23 11:11:07.397	\N
\.


--
-- Data for Name: InventoryItem; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."InventoryItem" (id, "countId", "productId", name, "categoryId", "brandId", "vehicleModelId", "goodQuantity", "badQuantity", image, note, "voiceText", "voiceConfidence", "recognizedName", "recognizedBrand", "recognizedCategory", "voiceSessionId", "createdAt") FROM stdin;
ec041a9a-1900-4d21-871e-544dab6ecd96	ed30ef35-c2a6-48b8-8378-fab156feb350	\N	لنت	\N	\N	\N	30	10	\N	\N	لنت جلو پراید تکستار چهل عدد سی تا سالم ده تا خراب	\N	لنت	تکستار	پراید	\N	2026-07-23 11:30:03.025
d4d720d0-428a-48ec-82e7-f71b4440bb0a	ed30ef35-c2a6-48b8-8378-fab156feb350	\N	لنت	\N	\N	\N	30	10	\N	\N	لنت جلو پراید تکستار چهل عدد سی تا سالم ده تا خراب	\N	لنت	تکستار	پراید	\N	2026-07-23 11:37:43.289
\.


--
-- Data for Name: InventoryLog; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."InventoryLog" (id, "productId", "locationId", quantity, action, note, "userId", "sessionId", "voiceRecordId", "createdAt") FROM stdin;
\.


--
-- Data for Name: InventorySession; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."InventorySession" (id, "warehouseId", "userId", "startedAt", "finishedAt", status) FROM stdin;
4cde7a34-9417-4523-b113-94c17d51f8e4	\N	3406cce8-24c0-4aea-8249-b060ee3f202f	2026-07-23 11:11:07.352	\N	ACTIVE
\.


--
-- Data for Name: InventorySessionLocation; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."InventorySessionLocation" (id, "sessionId", "locationId", status, "startedAt", "finishedAt") FROM stdin;
\.


--
-- Data for Name: ItemBarcode; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."ItemBarcode" (id, "itemId", barcode, status, "createdAt") FROM stdin;
\.


--
-- Data for Name: Location; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Location" (id, name, code, barcode, "warehouseId", "typeId", "parentId", "isActive", "deletedAt", "sortOrder", "createdAt", "updatedAt") FROM stdin;
4c12d40e-b1fa-41c7-ad3e-c4a672c38c01	قفسه A1	A1	LOC000001	\N	39a8cf71-1414-4b5b-8334-4285f9111d63	\N	t	\N	0	2026-07-23 11:06:06.131	2026-07-23 11:06:06.131
\.


--
-- Data for Name: LocationType; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."LocationType" (id, name, level) FROM stdin;
39a8cf71-1414-4b5b-8334-4285f9111d63	قفسه	SHELF
\.


--
-- Data for Name: PartCatalog; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."PartCatalog" (id, name, aliases, unit, "isActive", "createdAt", "updatedAt") FROM stdin;
7782d561-f17a-48a4-8962-40ee525e2de4	لنت ترمز جلو	{"لنت جلو","لنت پراید جلو"}	عدد	t	2026-07-23 16:31:24.216	2026-07-23 16:31:24.216
2b590ae8-4836-4983-81ff-291dd988352c	فیلتر روغن جدید	{}	عدد	t	2026-07-23 16:53:31.811	2026-07-23 16:53:31.811
\.


--
-- Data for Name: Product; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Product" (id, name, sku, "partNumber", description, unit, weight, "minStock", "categoryId", "brandId", "vehicleModelId", "supplierId", "isActive", "deletedAt", "createdAt", "updatedAt", "partCatalogId") FROM stdin;
b654c60a-de1a-4013-922b-7d97b4e3318b	لنت ترمز پراید تکستار	PR-BRK-001	TXT-001	\N	عدد	\N	5	\N	\N	\N	\N	t	\N	2026-07-23 11:03:41.608	2026-07-23 11:03:41.608	\N
ff17368b-b8b0-41b9-a132-8fd637fca7d7	لنت ترمز جلو	SKU-1784825611790-1	TX-101	\N	عدد	\N	0	\N	6d9873d8-5669-43b2-ab4a-47b8433039aa	b5648f09-be7d-4dfe-9abc-e3dc81803990	\N	t	\N	2026-07-23 16:53:31.792	2026-07-23 16:53:31.792	7782d561-f17a-48a4-8962-40ee525e2de4
e0974dbf-5a8c-468a-8e3e-7a52030c5cb7	فیلتر روغن جدید	SKU-1784825611814-2	FL-999	\N	عدد	\N	0	\N	737a4400-b300-4ab5-9db9-b545f7769f84	6deca78b-18f9-49a4-baab-bc222a1e0cfb	\N	t	\N	2026-07-23 16:53:31.815	2026-07-23 16:53:31.815	2b590ae8-4836-4983-81ff-291dd988352c
\.


--
-- Data for Name: ProductBarcode; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."ProductBarcode" (id, barcode, type, "productId", "createdAt") FROM stdin;
5a86dbd2-f979-4442-a6d4-4c8c599f60a9	WOS1784804621606	INTERNAL	b654c60a-de1a-4013-922b-7d97b4e3318b	2026-07-23 11:03:41.608
\.


--
-- Data for Name: ProductPrice; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."ProductPrice" (id, "productId", "purchasePrice", "salePrice", "wholesalePrice", "createdAt") FROM stdin;
f5328be9-8ee9-4ac7-b550-085965643f5c	ff17368b-b8b0-41b9-a132-8fd637fca7d7	1500000	2000000	1800000	2026-07-23 16:53:31.792
67ddd90d-dffd-4e1f-8ff1-71b268e6acea	e0974dbf-5a8c-468a-8e3e-7a52030c5cb7	50000	80000	70000	2026-07-23 16:53:31.815
\.


--
-- Data for Name: Supplier; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Supplier" (id, name, phone, address, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."User" (id, username, password, "fullName", role, "createdAt", "updatedAt") FROM stdin;
3406cce8-24c0-4aea-8249-b060ee3f202f	admin	$argon2id$v=19$m=65536,p=4,t=3$ZPl5GYTTsTf/O7wUPiXGCg$p5dBNTAivsavQ5Fl3y7autaFFyGosZfPqw9tWO/4/9Y	مدیر کل سیستم	ADMIN	2026-07-23 11:00:26.303	2026-07-23 11:00:26.303
\.


--
-- Data for Name: VehicleModel; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."VehicleModel" (id, name, "startYear", "endYear", "systemType", "createdAt", aliases) FROM stdin;
b5648f09-be7d-4dfe-9abc-e3dc81803990	پراید	1300	1405	\N	2026-07-23 16:53:31.785	{}
6deca78b-18f9-49a4-baab-bc222a1e0cfb	خودرو تست	1300	1405	\N	2026-07-23 16:53:31.813	{}
\.


--
-- Data for Name: VoiceRecord; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."VoiceRecord" (id, "filePath", text, confidence, status, "productId", "userId", "createdAt") FROM stdin;
\.


--
-- Data for Name: VoiceSession; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."VoiceSession" (id, "userId", "startedAt", "finishedAt", "isActive") FROM stdin;
\.


--
-- Data for Name: Warehouse; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Warehouse" (id, name, code, "isActive", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
aa2869ae-5971-4b24-9a88-bd222aaeaa37	a6de5fc9b66fc3021f0085a8e7cc245ea696370b851cb9fe19d346acc8b3ceb7	2026-07-23 15:37:54.960679+03:30	0_baseline		\N	2026-07-23 15:37:54.960679+03:30	0
86538a0d-09f7-4baf-8b03-668161005cda	6e62882f3829fe54cacfaf8f2f92e67a59698ec283c15bdfd7572bc2dd813bef	2026-07-23 19:59:49.124956+03:30	1_add_part_catalog	\N	\N	2026-07-23 19:59:49.07025+03:30	1
\.


--
-- Name: AccountingSync AccountingSync_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AccountingSync"
    ADD CONSTRAINT "AccountingSync_pkey" PRIMARY KEY (id);


--
-- Name: Asset Asset_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Asset"
    ADD CONSTRAINT "Asset_pkey" PRIMARY KEY (id);


--
-- Name: AuditLog AuditLog_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY (id);


--
-- Name: Brand Brand_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Brand"
    ADD CONSTRAINT "Brand_pkey" PRIMARY KEY (id);


--
-- Name: Category Category_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Category"
    ADD CONSTRAINT "Category_pkey" PRIMARY KEY (id);


--
-- Name: ImportJob ImportJob_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ImportJob"
    ADD CONSTRAINT "ImportJob_pkey" PRIMARY KEY (id);


--
-- Name: ImportRow ImportRow_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ImportRow"
    ADD CONSTRAINT "ImportRow_pkey" PRIMARY KEY (id);


--
-- Name: InventoryCount InventoryCount_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InventoryCount"
    ADD CONSTRAINT "InventoryCount_pkey" PRIMARY KEY (id);


--
-- Name: InventoryItem InventoryItem_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InventoryItem"
    ADD CONSTRAINT "InventoryItem_pkey" PRIMARY KEY (id);


--
-- Name: InventoryLog InventoryLog_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InventoryLog"
    ADD CONSTRAINT "InventoryLog_pkey" PRIMARY KEY (id);


--
-- Name: InventorySessionLocation InventorySessionLocation_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InventorySessionLocation"
    ADD CONSTRAINT "InventorySessionLocation_pkey" PRIMARY KEY (id);


--
-- Name: InventorySession InventorySession_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InventorySession"
    ADD CONSTRAINT "InventorySession_pkey" PRIMARY KEY (id);


--
-- Name: Inventory Inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Inventory"
    ADD CONSTRAINT "Inventory_pkey" PRIMARY KEY (id);


--
-- Name: ItemBarcode ItemBarcode_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ItemBarcode"
    ADD CONSTRAINT "ItemBarcode_pkey" PRIMARY KEY (id);


--
-- Name: LocationType LocationType_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."LocationType"
    ADD CONSTRAINT "LocationType_pkey" PRIMARY KEY (id);


--
-- Name: Location Location_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Location"
    ADD CONSTRAINT "Location_pkey" PRIMARY KEY (id);


--
-- Name: PartCatalog PartCatalog_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PartCatalog"
    ADD CONSTRAINT "PartCatalog_pkey" PRIMARY KEY (id);


--
-- Name: ProductBarcode ProductBarcode_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ProductBarcode"
    ADD CONSTRAINT "ProductBarcode_pkey" PRIMARY KEY (id);


--
-- Name: ProductPrice ProductPrice_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ProductPrice"
    ADD CONSTRAINT "ProductPrice_pkey" PRIMARY KEY (id);


--
-- Name: Product Product_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_pkey" PRIMARY KEY (id);


--
-- Name: Supplier Supplier_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Supplier"
    ADD CONSTRAINT "Supplier_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: VehicleModel VehicleModel_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."VehicleModel"
    ADD CONSTRAINT "VehicleModel_pkey" PRIMARY KEY (id);


--
-- Name: VoiceRecord VoiceRecord_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."VoiceRecord"
    ADD CONSTRAINT "VoiceRecord_pkey" PRIMARY KEY (id);


--
-- Name: VoiceSession VoiceSession_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."VoiceSession"
    ADD CONSTRAINT "VoiceSession_pkey" PRIMARY KEY (id);


--
-- Name: Warehouse Warehouse_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Warehouse"
    ADD CONSTRAINT "Warehouse_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: Brand_name_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Brand_name_key" ON public."Brand" USING btree (name);


--
-- Name: Category_code_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Category_code_key" ON public."Category" USING btree (code);


--
-- Name: Category_name_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Category_name_key" ON public."Category" USING btree (name);


--
-- Name: InventorySessionLocation_sessionId_locationId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "InventorySessionLocation_sessionId_locationId_key" ON public."InventorySessionLocation" USING btree ("sessionId", "locationId");


--
-- Name: Inventory_productId_locationId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Inventory_productId_locationId_key" ON public."Inventory" USING btree ("productId", "locationId");


--
-- Name: ItemBarcode_barcode_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "ItemBarcode_barcode_key" ON public."ItemBarcode" USING btree (barcode);


--
-- Name: Location_barcode_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Location_barcode_key" ON public."Location" USING btree (barcode);


--
-- Name: Location_code_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Location_code_key" ON public."Location" USING btree (code);


--
-- Name: PartCatalog_name_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "PartCatalog_name_key" ON public."PartCatalog" USING btree (name);


--
-- Name: ProductBarcode_barcode_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "ProductBarcode_barcode_key" ON public."ProductBarcode" USING btree (barcode);


--
-- Name: Product_sku_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Product_sku_key" ON public."Product" USING btree (sku);


--
-- Name: User_username_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "User_username_key" ON public."User" USING btree (username);


--
-- Name: VehicleModel_name_startYear_endYear_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "VehicleModel_name_startYear_endYear_key" ON public."VehicleModel" USING btree (name, "startYear", "endYear");


--
-- Name: Warehouse_code_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Warehouse_code_key" ON public."Warehouse" USING btree (code);


--
-- Name: AccountingSync AccountingSync_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AccountingSync"
    ADD CONSTRAINT "AccountingSync_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Asset Asset_inventoryLogId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Asset"
    ADD CONSTRAINT "Asset_inventoryLogId_fkey" FOREIGN KEY ("inventoryLogId") REFERENCES public."InventoryLog"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Asset Asset_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Asset"
    ADD CONSTRAINT "Asset_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AuditLog AuditLog_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ImportRow ImportRow_importJobId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ImportRow"
    ADD CONSTRAINT "ImportRow_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES public."ImportJob"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: InventoryCount InventoryCount_locationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InventoryCount"
    ADD CONSTRAINT "InventoryCount_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES public."Location"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: InventoryCount InventoryCount_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InventoryCount"
    ADD CONSTRAINT "InventoryCount_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."InventorySession"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: InventoryCount InventoryCount_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InventoryCount"
    ADD CONSTRAINT "InventoryCount_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: InventoryItem InventoryItem_brandId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InventoryItem"
    ADD CONSTRAINT "InventoryItem_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES public."Brand"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: InventoryItem InventoryItem_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InventoryItem"
    ADD CONSTRAINT "InventoryItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public."Category"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: InventoryItem InventoryItem_countId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InventoryItem"
    ADD CONSTRAINT "InventoryItem_countId_fkey" FOREIGN KEY ("countId") REFERENCES public."InventoryCount"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: InventoryItem InventoryItem_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InventoryItem"
    ADD CONSTRAINT "InventoryItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: InventoryItem InventoryItem_vehicleModelId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InventoryItem"
    ADD CONSTRAINT "InventoryItem_vehicleModelId_fkey" FOREIGN KEY ("vehicleModelId") REFERENCES public."VehicleModel"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: InventoryItem InventoryItem_voiceSessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InventoryItem"
    ADD CONSTRAINT "InventoryItem_voiceSessionId_fkey" FOREIGN KEY ("voiceSessionId") REFERENCES public."VoiceSession"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: InventoryLog InventoryLog_locationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InventoryLog"
    ADD CONSTRAINT "InventoryLog_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES public."Location"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: InventoryLog InventoryLog_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InventoryLog"
    ADD CONSTRAINT "InventoryLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: InventoryLog InventoryLog_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InventoryLog"
    ADD CONSTRAINT "InventoryLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."InventorySession"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: InventoryLog InventoryLog_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InventoryLog"
    ADD CONSTRAINT "InventoryLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: InventoryLog InventoryLog_voiceRecordId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InventoryLog"
    ADD CONSTRAINT "InventoryLog_voiceRecordId_fkey" FOREIGN KEY ("voiceRecordId") REFERENCES public."VoiceRecord"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: InventorySessionLocation InventorySessionLocation_locationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InventorySessionLocation"
    ADD CONSTRAINT "InventorySessionLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES public."Location"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: InventorySessionLocation InventorySessionLocation_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InventorySessionLocation"
    ADD CONSTRAINT "InventorySessionLocation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."InventorySession"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: InventorySession InventorySession_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InventorySession"
    ADD CONSTRAINT "InventorySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: InventorySession InventorySession_warehouseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InventorySession"
    ADD CONSTRAINT "InventorySession_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES public."Warehouse"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Inventory Inventory_locationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Inventory"
    ADD CONSTRAINT "Inventory_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES public."Location"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Inventory Inventory_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Inventory"
    ADD CONSTRAINT "Inventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ItemBarcode ItemBarcode_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ItemBarcode"
    ADD CONSTRAINT "ItemBarcode_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES public."InventoryItem"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Location Location_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Location"
    ADD CONSTRAINT "Location_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public."Location"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Location Location_typeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Location"
    ADD CONSTRAINT "Location_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES public."LocationType"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Location Location_warehouseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Location"
    ADD CONSTRAINT "Location_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES public."Warehouse"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ProductBarcode ProductBarcode_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ProductBarcode"
    ADD CONSTRAINT "ProductBarcode_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ProductPrice ProductPrice_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ProductPrice"
    ADD CONSTRAINT "ProductPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Product Product_brandId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES public."Brand"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Product Product_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public."Category"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Product Product_partCatalogId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_partCatalogId_fkey" FOREIGN KEY ("partCatalogId") REFERENCES public."PartCatalog"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Product Product_supplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES public."Supplier"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Product Product_vehicleModelId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_vehicleModelId_fkey" FOREIGN KEY ("vehicleModelId") REFERENCES public."VehicleModel"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: VoiceRecord VoiceRecord_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."VoiceRecord"
    ADD CONSTRAINT "VoiceRecord_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: VoiceRecord VoiceRecord_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."VoiceRecord"
    ADD CONSTRAINT "VoiceRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: VoiceSession VoiceSession_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."VoiceSession"
    ADD CONSTRAINT "VoiceSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: postgres
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;


--
-- PostgreSQL database dump complete
--

\unrestrict Sxkvg0az9wuuVVetJOExMXs3SaNF5bMJZEOyx1TOUbRwvy92MOWCEgVgxZ2MGY4

