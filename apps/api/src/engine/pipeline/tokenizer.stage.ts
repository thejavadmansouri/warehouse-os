export class TokenizerStage {

  execute(input:string): string[] {
    return input
      .split(/\s+/)
      .filter(Boolean);
  }

}
