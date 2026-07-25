export interface FuzzyMatch {
  match: string;
  distance: number;
  similarity: number;
}

export class FuzzyMatcher {
  static levenshteinDistance(a: string, b: string): number {
    if (a === b) return 0;

    const m = a.length;
    const n = b.length;

    if (m === 0) return n;
    if (n === 0) return m;

    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      new Array(n + 1).fill(0),
    );

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      const ca = a.charCodeAt(i - 1);

      for (let j = 1; j <= n; j++) {
        const cb = b.charCodeAt(j - 1);

        const cost = ca === cb ? 0 : 1;

        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost,
        );
      }
    }

    return dp[m][n];
  }

  static similarity(a: string, b: string): number {
    const max = Math.max(a.length, b.length);

    if (max === 0) return 1;

    return 1 - this.levenshteinDistance(a, b) / max;
  }

  static findClosestMatch(
    word: string,
    dictionary: string[],
    maxDistance = 2,
  ): FuzzyMatch | null {
    let best: FuzzyMatch | null = null;

    for (const candidate of dictionary) {
      const distance = this.levenshteinDistance(word, candidate);

      if (distance > maxDistance) continue;

      const similarity = this.similarity(word, candidate);

      if (!best || distance < best.distance) {
        best = {
          match: candidate,
          distance,
          similarity,
        };
      } else if (
        distance === best.distance &&
        similarity > best.similarity
      ) {
        best = {
          match: candidate,
          distance,
          similarity,
        };
      }
    }

    return best;
  }

  static isAlmostEqual(
    a: string,
    b: string,
    maxDistance = 1,
  ): boolean {
    return this.levenshteinDistance(a, b) <= maxDistance;
  }
}
