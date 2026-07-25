export class StringMatcher {
  public static clean(text?: string | null): string {
    if (!text) return '';
    return text
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[يى]/g, 'ی')
      .replace(/[ك]/g, 'ک')
      .replace(/\s+/g, ' ');
  }

  public static matches(
    input?: string | null,
    targetName?: string | null,
    aliases: string[] = [],
  ): boolean {
    const cleanInput = this.clean(input);
    if (!cleanInput) return false;

    if (this.clean(targetName) === cleanInput) return true;

    return aliases.some((alias) => this.clean(alias) === cleanInput);
  }
}
