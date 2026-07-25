import { DomainDictionaryConfig } from '../types/engine.types';

export class SpellCorrectionStage {

  constructor(
    private readonly config: DomainDictionaryConfig
  ) {}

  execute(tokens:string[]):string[] {

    return tokens.map(token => {

      if (this.config.speechErrors[token]) {
        return this.config.speechErrors[token];
      }

      return token;
    });

  }

}
