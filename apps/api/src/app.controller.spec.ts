import { Test, TestingModule } from '@nestjs/testing';

import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  const appService = {
    getHello: jest.fn(() => 'Hello World!'),
    health: jest.fn(async () => ({
      status: 'ok',
      db: 'up',
      dbLatencyMs: 3,
      uptimeSec: 12,
      version: '0.0.1',
      timestamp: new Date().toISOString(),
    })),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: appService }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('وضعیتِ سالم را از سرویس عبور می‌دهد', async () => {
      const res = await appController.health();

      expect(res).toMatchObject({ status: 'ok', db: 'up' });
      expect(appService.health).toHaveBeenCalledTimes(1);
    });
  });
});
