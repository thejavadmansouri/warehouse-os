import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../realtime/events.gateway';
import { WorkTasksService } from './work-tasks.service';
import { WorkTasksGateway } from './work-tasks.gateway';

function makeTask(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    status: 'PENDING',
    warehouseId: 'w1',
    invoiceId: null,
    quotationId: null,
    assignedToId: null,
    requestedById: null,
    note: null,
    cancelReason: null,
    createdAt: new Date('2026-08-15T08:00:00Z'),
    updatedAt: new Date('2026-08-15T08:00:00Z'),
    items: [],
    invoice: null,
    quotation: null,
    requestedBy: null,
    assignedTo: null,
    _count: { items: 0 },
    ...over,
  };
}

function makeItem(over: Record<string, unknown> = {}) {
  return {
    id: 'i1',
    taskId: 't1',
    status: 'PENDING',
    productId: 'p1',
    locationId: null,
    quantity: 1,
    doneById: null,
    doneAt: null,
    clientMutationId: null,
    product: null,
    location: null,
    doneBy: null,
    ...over,
  };
}

describe('WorkTasksService', () => {
  let service: WorkTasksService;
  const prisma = {
    workTask: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    workTaskItem: { findUnique: jest.fn(), updateMany: jest.fn(), groupBy: jest.fn() },
  };
  const gateway = { emitCreated: jest.fn(), emitCancelled: jest.fn() };
  const events = { broadcast: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkTasksService,
        { provide: PrismaService, useValue: prisma },
        { provide: WorkTasksGateway, useValue: gateway },
        { provide: EventsGateway, useValue: events },
      ],
    }).compile();
    service = module.get<WorkTasksService>(WorkTasksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const input = {
      warehouseId: 'w1',
      lines: [
        { productId: 'p1', locationId: 'l1', quantity: 2 },
        { productId: 'p2', quantity: 1 },
      ],
      assignedToId: 'worker1',
      idempotencyKey: 'k-1',
    };

    it('rejects empty lines', async () => {
      await expect(service.create({ warehouseId: 'w1', lines: [] })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a zero/negative quantity', async () => {
      await expect(
        service.create({ warehouseId: 'w1', lines: [{ productId: 'p1', quantity: 0 }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reuses the existing task on a repeated idempotency key (no duplicate)', async () => {
      const existing = makeTask({ id: 't-existing' });
      prisma.workTask.findUnique.mockResolvedValueOnce({ id: 't-existing' });
      prisma.workTask.findUnique.mockResolvedValueOnce(existing); // findOne

      const result = await service.create(input, 'seller1');

      expect(result.id).toBe('t-existing');
      expect(prisma.workTask.create).not.toHaveBeenCalled();
    });

    it('creates the task with items and pushes to the worker', async () => {
      prisma.workTask.findUnique.mockResolvedValueOnce(null); // idempotency miss
      prisma.workTask.create.mockResolvedValue({ id: 't-new' });
      const created = makeTask({
        id: 't-new',
        _count: { items: 2 },
        items: [{ status: 'PENDING' }, { status: 'PENDING' }],
      });
      prisma.workTask.findUnique.mockResolvedValueOnce(created); // findOne

      const result = await service.create(input, 'seller1');

      expect(prisma.workTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            assignedToId: 'worker1',
            requestedById: 'seller1',
            idempotencyKey: 'k-1',
            items: {
              create: [
                { productId: 'p1', locationId: 'l1', quantity: 2 },
                { productId: 'p2', locationId: null, quantity: 1 },
              ],
            },
          }),
        }),
      );
      expect(gateway.emitCreated).toHaveBeenCalledWith(['t-new'], 'worker1');
      expect(events.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'work-task.progress', taskId: 't-new' }),
      );
      expect(result.doneItems).toBe(0);
      expect(result.totalItems).toBe(2);
    });
  });

  describe('syncMutations', () => {
    const m = (over: Record<string, string> = {}) => ({
      clientMutationId: 'cm-1',
      taskId: 't1',
      itemId: 'i1',
      ...over,
    });

    it('rejects an empty mutation batch', async () => {
      await expect(service.syncMutations('worker1', [])).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('claims a PENDING item atomically → OK', async () => {
      prisma.workTaskItem.findUnique.mockResolvedValueOnce(
        makeItem({ task: makeTask({ id: 't1' }) }),
      );
      prisma.workTaskItem.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.workTaskItem.groupBy.mockResolvedValueOnce([
        { status: 'DONE', _count: { _all: 1 } },
        { status: 'PENDING', _count: { _all: 1 } },
      ]);
      prisma.workTask.updateMany.mockResolvedValueOnce({ count: 1 });

      const res = await service.syncMutations('worker1', [m()]);

      expect(res.results[0]).toEqual({ ...m(), status: 'OK' });
      expect(prisma.workTaskItem.updateMany).toHaveBeenCalledWith({
        where: { id: 'i1', status: 'PENDING' },
        data: expect.objectContaining({
          status: 'DONE',
          doneById: 'worker1',
          clientMutationId: 'cm-1',
        }),
      });
      // یک قلم از دو قلم → IN_PROGRESS
      expect(prisma.workTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'IN_PROGRESS' } }),
      );
      expect(events.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'work-task.progress', taskId: 't1' }),
      );
    });

    it('a replayed tick with the same clientMutationId is OK (idempotent)', async () => {
      prisma.workTaskItem.findUnique.mockResolvedValueOnce(
        makeItem({
          status: 'DONE',
          clientMutationId: 'cm-1',
          task: makeTask({ id: 't1' }),
        }),
      );

      const res = await service.syncMutations('worker1', [m()]);

      expect(res.results[0].status).toBe('OK');
      // بدون ادعای جدید — فقط چک idempotency.
      expect(prisma.workTaskItem.updateMany).not.toHaveBeenCalled();
    });

    it('a tick already done by another worker → ALREADY_DONE', async () => {
      prisma.workTaskItem.findUnique.mockResolvedValueOnce(
        makeItem({
          status: 'DONE',
          clientMutationId: 'cm-other',
          task: makeTask({ id: 't1' }),
        }),
      );

      const res = await service.syncMutations('worker2', [m()]);

      expect(res.results[0].status).toBe('ALREADY_DONE');
    });

    it('a cancelled task rejects the tick', async () => {
      prisma.workTaskItem.findUnique.mockResolvedValueOnce(
        makeItem({ task: makeTask({ id: 't1', status: 'CANCELLED' }) }),
      );

      const res = await service.syncMutations('worker1', [m()]);

      expect(res.results[0].status).toBe('TASK_CANCELLED');
      expect(prisma.workTaskItem.updateMany).not.toHaveBeenCalled();
    });

    it('a task assigned to someone else is not visible', async () => {
      prisma.workTaskItem.findUnique.mockResolvedValueOnce(
        makeItem({ task: makeTask({ id: 't1', assignedToId: 'worker-other' }) }),
      );

      const res = await service.syncMutations('worker1', [m()]);

      expect(res.results[0].status).toBe('TASK_NOT_VISIBLE');
    });

    it('an unknown item → ITEM_NOT_FOUND', async () => {
      prisma.workTaskItem.findUnique.mockResolvedValueOnce(null);

      const res = await service.syncMutations('worker1', [m({ itemId: 'nope' })]);

      expect(res.results[0].status).toBe('ITEM_NOT_FOUND');
    });

    it('marks the task COMPLETED when the last item is ticked', async () => {
      prisma.workTaskItem.findUnique.mockResolvedValueOnce(
        makeItem({ task: makeTask({ id: 't1' }) }),
      );
      prisma.workTaskItem.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.workTaskItem.groupBy.mockResolvedValueOnce([
        { status: 'DONE', _count: { _all: 1 } },
        { status: 'PENDING', _count: { _all: 0 } },
      ]);
      prisma.workTask.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.syncMutations('worker1', [m()]);

      expect(prisma.workTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 't1',
            status: { in: ['PENDING', 'IN_PROGRESS'] },
          }),
          data: { status: 'COMPLETED' },
        }),
      );
    });
  });

  describe('findForWorker (خلاصه‌ی صف — doneItems از status قلم‌ها)', () => {
    it('derives doneItems from the item statuses when all are DONE', async () => {
      prisma.workTask.findMany.mockResolvedValueOnce([
        makeTask({
          status: 'COMPLETED',
          _count: { items: 3 },
          // همان شکلی که SUMMARY_INCLUDE برمی‌گرداند: فقط قلم‌های DONE با {id, status}.
          items: [
            { id: 'i1', status: 'DONE' },
            { id: 'i2', status: 'DONE' },
            { id: 'i3', status: 'DONE' },
          ],
        }),
      ]);

      const res = await service.findForWorker('worker1');

      expect(res[0].doneItems).toBe(3);
      expect(res[0].totalItems).toBe(3);
    });

    it('reports partial progress for an in-progress task', async () => {
      prisma.workTask.findMany.mockResolvedValueOnce([
        makeTask({
          status: 'IN_PROGRESS',
          _count: { items: 3 },
          items: [{ id: 'i1', status: 'DONE' }],
        }),
      ]);

      const res = await service.findForWorker('worker1');

      expect(res[0].doneItems).toBe(1);
      expect(res[0].totalItems).toBe(3);
    });
  });

  describe('cancel', () => {
    it('cancels a pending/in-progress task and notifies the worker', async () => {
      prisma.workTask.updateMany.mockResolvedValueOnce({ count: 1 });
      const detail = makeTask({ id: 't1', status: 'CANCELLED', assignedToId: 'worker1' });
      prisma.workTask.findUnique.mockResolvedValueOnce(detail); // findOne

      const result = await service.cancel('t1', 'اشتباه شد');

      expect(prisma.workTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't1', status: { in: ['PENDING', 'IN_PROGRESS'] } },
          data: expect.objectContaining({ status: 'CANCELLED', cancelReason: 'اشتباه شد' }),
        }),
      );
      expect(result.status).toBe('CANCELLED');
      expect(gateway.emitCancelled).toHaveBeenCalledWith(['t1'], 'worker1');
    });

    it('rejects cancelling a completed task', async () => {
      prisma.workTask.updateMany.mockResolvedValueOnce({ count: 0 });
      prisma.workTask.findUnique.mockResolvedValueOnce({ status: 'COMPLETED' });

      await expect(service.cancel('t1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a missing task', async () => {
      prisma.workTask.updateMany.mockResolvedValueOnce({ count: 0 });
      prisma.workTask.findUnique.mockResolvedValueOnce(null);

      await expect(service.cancel('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
