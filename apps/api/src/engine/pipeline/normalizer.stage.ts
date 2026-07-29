import { normalizePersian } from '../utils/persian-normalize';

export class NormalizerStage {

  execute(input: string): string {

    // Canonical normalization first (letters, digits, ZWNJ, tashkil, casefold).
    let text = normalizePersian(input);

    // Domain lemma rules — run after normalization so they see canonical letters.
    const replacements: Record<string, string> = {
      'جلوی': 'جلو',
      'عقبی': 'عقب',
      'ترمزها': 'ترمز',
      'ترمزهای': 'ترمز',
      'های': ' ',
    };

    for (const [key, value] of Object.entries(replacements)) {
      text = text.replace(new RegExp(key, 'g'), value);
    }

    return text.replace(/\s+/g, ' ').trim();
  }

}
