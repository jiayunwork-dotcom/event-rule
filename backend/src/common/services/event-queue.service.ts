import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';
import { Event } from '../types/event.type';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class EventQueueService implements OnModuleInit {
  private readonly logger = new Logger(EventQueueService.name);
  private readonly maxQueueSize: number;
  private readonly queueKeyPrefix = 'event:queue:';
  private readonly discardCountKeyPrefix = 'event:discarded:';

  constructor(
    private readonly redisService: RedisService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {
    this.maxQueueSize = this.configService.get<number>('MAX_QUEUE_SIZE', 10000);
  }

  onModuleInit() {
    this.startEventProcessing();
  }

  async enqueue(tenantId: string, event: Omit<Event, 'id'>): Promise<string> {
    const queueKey = `${this.queueKeyPrefix}${tenantId}`;
    const eventId = uuidv4();
    const eventWithId: Event = { ...event, id: eventId };

    const currentSize = await this.redisService.llen(queueKey);
    
    if (currentSize >= this.maxQueueSize) {
      await this.redisService.rpop(queueKey);
      await this.incrementDiscardCount(tenantId);
      this.logger.warn(`Queue full for tenant ${tenantId}, discarding oldest event`);
    }

    await this.redisService.lpush(queueKey, JSON.stringify(eventWithId));
    return eventId;
  }

  private async startEventProcessing() {
    const processInterval = setInterval(async () => {
      try {
        const tenants = await this.getAllTenantsWithQueues();
        for (const tenantId of tenants) {
          await this.processTenantQueue(tenantId);
        }
      } catch (error) {
        this.logger.error('Error processing event queues', error);
      }
    }, 100);

    return () => clearInterval(processInterval);
  }

  private async getAllTenantsWithQueues(): Promise<string[]> {
    const keys = await this.redisService.scan(`${this.queueKeyPrefix}*`);
    return keys.map(key => key.replace(this.queueKeyPrefix, ''));
  }

  private async processTenantQueue(tenantId: string) {
    const queueKey = `${this.queueKeyPrefix}${tenantId}`;
    const batchSize = 100;

    for (let i = 0; i < batchSize; i++) {
      const eventStr = await this.redisService.rpop(queueKey);
      if (!eventStr) break;

      try {
        const event: Event = JSON.parse(eventStr);
        this.eventEmitter.emit('event.received', { tenantId, event });
      } catch (error) {
        this.logger.error(`Error processing event for tenant ${tenantId}`, error);
      }
    }
  }

  private async incrementDiscardCount(tenantId: string) {
    const key = `${this.discardCountKeyPrefix}${tenantId}`;
    await this.redisService.incr(key);
  }

  async getDiscardCount(tenantId: string): Promise<number> {
    const key = `${this.discardCountKeyPrefix}${tenantId}`;
    const count = await this.redisService.get(key);
    return parseInt(count || '0', 10);
  }

  async getQueueSize(tenantId: string): Promise<number> {
    const queueKey = `${this.queueKeyPrefix}${tenantId}`;
    return this.redisService.llen(queueKey);
  }
}
