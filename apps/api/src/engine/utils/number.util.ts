export const WORD_NUMBERS: Record<string, number> = {
  'صفر': 0,

  'یک': 1,
  'يه': 1,
  'یه': 1,

  'دو': 2,
  'سه': 3,
  'چهار': 4,
  'پنج': 5,
  'شش': 6,
  'هفت': 7,
  'هشت': 8,
  'نه': 9,

  'ده': 10,
  'یازده': 11,
  'دوازده': 12,
  'سیزده': 13,
  'چهارده': 14,
  'پانزده': 15,
  'شانزده': 16,
  'هفده': 17,
  'هجده': 18,
  'نوزده': 19,

  'بیست': 20,
  'سی': 30,
  'چهل': 40,
  'پنجاه': 50,
  'شصت': 60,
  'هفتاد': 70,
  'هشتاد': 80,
  'نود': 90,

  'صد': 100,
  'دویست': 200,
  'سیصد': 300,
  'چهارصد': 400,
  'پانصد': 500,
  'ششصد': 600,
  'هفتصد': 700,
  'هشتصد': 800,
  'نهصد': 900,

  'هزار': 1000,
};

export function parseNumberWordSequence(
  tokens: string[],
  startIndex: number,
): { value: number; consumed: number } | null {
  let value = 0;
  let consumed = 0;
  let matched = false;

  while (startIndex + consumed < tokens.length) {
    const token = tokens[startIndex + consumed];

    if (token === 'و') {
      consumed++;
      continue;
    }

    const number = WORD_NUMBERS[token];

    if (number === undefined) {
      break;
    }

    matched = true;

    if (number === 1000 && value > 0) {
      value *= 1000;
    } else {
      value += number;
    }

    consumed++;
  }

  return matched
    ? {
        value,
        consumed,
      }
    : null;
}

export function normalizeDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

export function parseNumber(token: string): number | null {
  const normalized = normalizeDigits(token);

  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  const result = parseNumberWordSequence([normalized], 0);

  return result ? result.value : null;
}
