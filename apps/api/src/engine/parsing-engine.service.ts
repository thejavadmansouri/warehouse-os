import {
  Injectable,
  OnModuleInit,
} from '@nestjs/common';

import { ParsingEngineCore } from './parsing-engine.core';

import { ParseResult } from './types/engine.types';

import { DictionaryLoaderService } from './services/dictionary-loader.service';

@Injectable()

export class ParsingEngineService
implements OnModuleInit{

  private engine!:ParsingEngineCore;

  constructor(

    private readonly loader:
      DictionaryLoaderService,

  ){}

  async onModuleInit(){

    const dictionary=
      await this.loader.load();

    this.engine=
      new ParsingEngineCore(
        dictionary
      );

  }

  parse(
    input:string
  ):ParseResult{

    return this.engine.parse(
      input
    );

  }

}
