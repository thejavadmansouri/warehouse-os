export type VoiceParseResult = {
  productName: string;
  brand: string | null;
  compatibleVehicle: string | null;
  quantity: number | null;
};

const PART_BRANDS = [
  "ایساکو", "تکستار", "بوش", "والئو", "لوک", "ساکس", "مان", "فرام",
  "NGK", "ان جی کی", "دنسو", "کروز", "عظام", "هرینگتون", "جنیون",
  "جنیون پارت", "مندو", "گیتس", "INA", "ای ان ای", "SKF", "اس کا اف",
  "FEBI", "فبی",
].sort((a, b) => b.length - a.length);

const VEHICLE_MODELS = [
  "پژو ۲۰۶", "پژو 206", "پژو ۴۰۵", "پژو 405", "پراید", "سمند", "تیبا",
  "دنا", "رانا", "کوییک", "ال۹۰", "ال90", "کیا", "هیوندای", "پارس",
].sort((a, b) => b.length - a.length);

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ENGLISH_DIGITS = "0123456789";

function normalizeDigits(text: string): string {
  return text.replace(/[۰-۹]/g, (d) => ENGLISH_DIGITS[PERSIAN_DIGITS.indexOf(d)]);
}

function normalizeText(text: string): string {
  return normalizeDigits(text)
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractInventoryFromVoice(sentence: string): VoiceParseResult {
  let text = normalizeText(sentence);

  let quantity: number | null = null;
  let brand: string | null = null;
  let compatibleVehicle: string | null = null;

  const qtyMatch = text.match(/(\d+)\s*(عدد|تا|جفت|دست|بسته)\s*$/i);
  if (qtyMatch) {
    quantity = Number(qtyMatch[1]);
    text = text.substring(0, qtyMatch.index).trim();
  }

  for (const vehicle of VEHICLE_MODELS) {
    const regex = new RegExp(`(^|\\s)${escapeRegex(normalizeText(vehicle))}(?=\\s|$)`, "i");
    if (regex.test(text)) {
      compatibleVehicle = vehicle;
      text = text.replace(regex, " ").replace(/\s+/g, " ").trim();
      break;
    }
  }

  for (const partBrand of PART_BRANDS) {
    const regex = new RegExp(`(^|\\s)${escapeRegex(normalizeText(partBrand))}(?=\\s|$)`, "i");
    if (regex.test(text)) {
      brand = partBrand;
      text = text.replace(regex, " ").replace(/\s+/g, " ").trim();
      break;
    }
  }

  return { productName: text, brand, compatibleVehicle, quantity };
}
