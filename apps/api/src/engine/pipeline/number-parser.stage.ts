import { parseNumberWordSequence } from '../utils/number.util';

export interface ParsedNumber {
  value: number;
  index: number;
  consumed: number;
}

// لیست شماره‌های رایج مدل‌های خودرو که نباید به عنوان تعداد اشتباه گرفته شوند
const MODEL_NUMBERS = new Set([405, 206, 207, 504, 508, 301, 2008, 3008]);

export class NumberParserStage {
  execute(tokens: string[]): ParsedNumber[] {
    const results: ParsedNumber[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const digit = Number(token);

      if (!isNaN(digit)) {
        // ۱. اگر عدد جزو مدل‌های معروف خودرو باشد، آن را نادیده بگیر
        if (MODEL_NUMBERS.has(digit)) {
          continue;
        }

        // ۲. اگر عدد در بازه سال‌های تولید خودرو (مثلاً ۱۳۰۰ تا ۱۴۵۰) باشد، آن را نادیده بگیر
        if (digit >= 1300 && digit <= 1450) {
          continue;
        }

        // ۳. بررسی توکن بعدی: اگر بعد از عدد کلمه‌ای غیر از واحدهای شمارش بیاید (مثل SLX، پلاس، تیپ و...)
        // یعنی این عدد مربوط به نام یا مدل خودرو است نه تعداد کالا.
        const nextToken = tokens[i + 1];
        const units = ['عدد', 'تا', 'دست', 'جفت', 'کارتن', 'پک', 'دستگاه', 'متر', 'کیلو'];

        if (nextToken && /^[a-zA-Zآ-ی]+$/.test(nextToken) && !units.includes(nextToken)) {
          continue;
        }

        results.push({
          value: digit,
          index: i,
          consumed: 1
        });
        continue;
      }

      const wordNumber = parseNumberWordSequence(tokens, i);

      if (wordNumber) {
        results.push({
          value: wordNumber.value,
          index: i,
          consumed: wordNumber.consumed
        });

        i += wordNumber.consumed - 1;
      }
    }

    return results;
  }
}