import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Schedule, ScheduleType, NotificationPolicy } from './schedule.entity';
import { Tenant } from '../tenants/tenant.entity';
import { AlertSeverity } from '../rules/rule.entity';
import { Cron, CronExpression } from '@nestjs/schedule';

export interface CreateScheduleDto {
  name: string;
  type: ScheduleType;
  shifts?: Array<{
    day: number;
    startTime: string;
    endTime: string;
    userIds: string[];
  }>;
  rotations?: Array<{
    period: 'daily' | 'weekly';
    userIds: string[];
    currentIndex: number;
    lastRotation: Date;
  }>;
  holidays?: Array<{
    date: string;
    userIds: string[];
  }>;
  timezone?: string;
  isEnabled?: boolean;
}

export interface CurrentOnCall {
  scheduleId: string;
  scheduleName: string;
  userIds: string[];
  shift?: {
    day: number;
    startTime: string;
    endTime: string;
  };
}

@Injectable()
export class SchedulesService {
  private readonly logger = new Logger(SchedulesService.name);

  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepository: Repository<Schedule>,
    @InjectRepository(NotificationPolicy)
    private readonly policyRepository: Repository<NotificationPolicy>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  async findAll(tenantId: string): Promise<Schedule[]> {
    return this.scheduleRepository.find({ where: { tenantId } });
  }

  async findOne(tenantId: string, id: string): Promise<Schedule> {
    const schedule = await this.scheduleRepository.findOne({ where: { id, tenantId } });
    if (!schedule) {
      throw new BadRequestException('Schedule not found');
    }
    return schedule;
  }

  async create(tenantId: string, dto: CreateScheduleDto): Promise<Schedule> {
    const schedule = this.scheduleRepository.create({ ...dto, tenantId });
    return this.scheduleRepository.save(schedule);
  }

  async update(tenantId: string, id: string, dto: Partial<CreateScheduleDto>): Promise<Schedule> {
    const schedule = await this.findOne(tenantId, id);
    Object.assign(schedule, dto);
    return this.scheduleRepository.save(schedule);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.scheduleRepository.delete({ id, tenantId });
  }

  async toggleEnabled(tenantId: string, id: string, isEnabled: boolean): Promise<Schedule> {
    const schedule = await this.findOne(tenantId, id);
    schedule.isEnabled = isEnabled;
    return this.scheduleRepository.save(schedule);
  }

  async getCurrentOnCall(tenantId: string, scheduleId: string): Promise<CurrentOnCall> {
    const schedule = await this.findOne(tenantId, scheduleId);
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    
    const timezone = schedule.timezone || tenant?.timezone || 'Asia/Shanghai';
    const now = this.getDateInTimezone(timezone);
    
    const holiday = this.checkHoliday(schedule, now);
    if (holiday) {
      return {
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        userIds: holiday.userIds,
      };
    }

    if (schedule.type === ScheduleType.FIXED) {
      const currentShift = this.findCurrentShift(schedule, now);
      if (currentShift) {
        return {
          scheduleId: schedule.id,
          scheduleName: schedule.name,
          userIds: currentShift.userIds,
          shift: {
            day: currentShift.day,
            startTime: currentShift.startTime,
            endTime: currentShift.endTime,
          },
        };
      }
    } else if (schedule.type === ScheduleType.ROTATION) {
      const rotation = this.findActiveRotation(schedule, now);
      if (rotation) {
        return {
          scheduleId: schedule.id,
          scheduleName: schedule.name,
          userIds: [rotation.userIds[rotation.currentIndex]],
        };
      }
    }

    return {
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      userIds: [],
    };
  }

  private getDateInTimezone(timezone: string): Date {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    
    const parts = formatter.formatToParts(now);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '0';
    
    return new Date(
      parseInt(getPart('year')),
      parseInt(getPart('month')) - 1,
      parseInt(getPart('day')),
      parseInt(getPart('hour')),
      parseInt(getPart('minute')),
      parseInt(getPart('second'))
    );
  }

  private checkHoliday(schedule: Schedule, now: Date): { date: string; userIds: string[] } | null {
    if (!schedule.holidays) return null;
    
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    return schedule.holidays.find(h => h.date === dateStr) || null;
  }

  private findCurrentShift(
    schedule: Schedule, 
    now: Date
  ): { day: number; startTime: string; endTime: string; userIds: string[] } | null {
    if (!schedule.shifts) return null;
    
    const currentDay = now.getDay();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    return schedule.shifts.find(shift => {
      if (shift.day !== currentDay) return false;
      return currentTime >= shift.startTime && currentTime < shift.endTime;
    }) || null;
  }

  private findActiveRotation(
    schedule: Schedule,
    now: Date
  ): { period: 'daily' | 'weekly'; userIds: string[]; currentIndex: number; lastRotation: Date } | null {
    if (!schedule.rotations || schedule.rotations.length === 0) return null;
    
    return schedule.rotations[0];
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleRotations() {
    const schedules = await this.scheduleRepository.find({ 
      where: { type: ScheduleType.ROTATION, isEnabled: true } 
    });

    for (const schedule of schedules) {
      if (!schedule.rotations) continue;

      for (const rotation of schedule.rotations) {
        const lastRotation = new Date(rotation.lastRotation);
        const now = new Date();
        const diffMs = now.getTime() - lastRotation.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        let shouldRotate = false;
        if (rotation.period === 'daily' && diffDays >= 1) {
          shouldRotate = true;
        } else if (rotation.period === 'weekly' && diffDays >= 7) {
          shouldRotate = true;
        }

        if (shouldRotate) {
          rotation.currentIndex = (rotation.currentIndex + 1) % rotation.userIds.length;
          rotation.lastRotation = now;
          
          this.logger.log(`Rotation updated for schedule ${schedule.name}: new index ${rotation.currentIndex}`);
        }
      }

      await this.scheduleRepository.save(schedule);
    }
  }

  async getEscalationChain(tenantId: string, policyId: string, level: number): Promise<string[]> {
    const policy = await this.policyRepository.findOne({ where: { id: policyId, tenantId } });
    if (!policy || !policy.escalationChain) {
      return [];
    }

    const escalation = policy.escalationChain.find(e => e.level === level);
    return escalation?.userIds || [];
  }
}
