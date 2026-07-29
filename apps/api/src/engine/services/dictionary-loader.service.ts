import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DomainDictionaryConfig } from '../types/engine.types';
import { normalizePersian } from '../utils/persian-normalize';

/**
 * Vehicle names are stored as full variants ("پژو 206 تیپ 5", "پراید 111"), but
 * workers say the family ("پراید") or family + model number ("پژو 206"). Derive
 * those shorter aliases so the trie can match partial mentions; the matched span
 * (not this payload) becomes the output family, and the matcher fans out to all
 * matching trims via a contains lookup.
 */
function vehicleFamilyAliases(name: string): string[] {
  const normalized = normalizePersian(name);
  const tokens = normalized.split(' ').filter(Boolean);
  if (!tokens.length) return [];

  const out = new Set<string>([normalized]);
  const family = tokens[0]; // پراید / پژو / سمند …
  out.add(family);

  const modelNumber = tokens.find((t) => /^\d+$/.test(t));
  if (modelNumber) out.add(`${family} ${modelNumber}`); // «پژو 206»

  return [...out];
}

@Injectable()
export class DictionaryLoaderService {

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async load(): Promise<DomainDictionaryConfig> {

    const products =
      await this.prisma.partCatalog.findMany();

    const vehicles =
      await this.prisma.vehicleModel.findMany();

    const brands =
      await this.prisma.brand.findMany();

    return {

      products: products.map(p => ({
        id: p.id,
        name: p.name,
        category: "قطعه",
        aliases: [
          p.name,
          ...(p.aliases ?? [])
        ]
      })),


      vehicles: vehicles.map(v => ({
        family: v.name,
        variant: v.name,
        engine: v.systemType ?? "",
        gearbox: "",
        aliases: [
          ...new Set([
            ...vehicleFamilyAliases(v.name),
            ...(v.aliases ?? []).map((a) => normalizePersian(a)),
          ]),
        ]
      })),


      brands: Object.fromEntries(

        brands.flatMap(b => {

          const names = [
            b.name,
            ...(b.aliases ?? [])
          ];

          return names.map(n => [
            n,
            b.name
          ]);

        })

      ),


      engines: {
        "tu5": "TU5",
        "تیوفایو": "TU5",
        "xu7": "XU7",
        "ef7": "EF7"
      },


      gearboxes: {
        "دستی": "MANUAL",
        "اتومات": "AUTOMATIC"
      },


      units: {
        "عدد": "عدد",
        "تا": "عدد",
        "جفت": "جفت",
        "دست": "دست",
        "بسته": "بسته",
        "کارتن": "کارتن"
      },


      colors: {
        "سفید": "سفید",
        "مشکی": "مشکی",
        "قرمز": "قرمز",
        "آبی": "آبی",
        "خاکستری": "خاکستری",
        "نقره‌ای": "نقره‌ای"
      },


      sides: {
        "چپ": "LEFT",
        "راست": "RIGHT"
      },


      positions: {
        "جلو": "FRONT",
        "عقب": "REAR",
        "داخل": "INNER",
        "بیرون": "OUTER"
      },


      conditions: {
        "نو": "NEW",
        "کارکرده": "USED",
        "خراب": "DAMAGED",
        "سالم": "GOOD"
      },


      actions: {
        "ثبت": "CREATE",
        "اضافه": "IN",
        "خروج": "OUT",
        "انتقال": "TRANSFER"
      },


      locations: {
        "قفسه": "SHELF",
        "انبار": "WAREHOUSE"
      },


      packaging: {
        "بسته": "PACK",
        "کارتن": "BOX"
      },


      speechErrors: {
        "تکستر": "تکستار",
        "ان جی کی": "NGK"
      }

    };

  }

}
