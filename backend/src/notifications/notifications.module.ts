import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationChannel } from './notification-channel.entity';
import { Notification } from './notification.entity';
import { DeadLetter } from './dead-letter.entity';
import { NotificationPolicy, Schedule } from '../schedules/schedule.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationChannel, Notification, DeadLetter, NotificationPolicy, Schedule])],
  providers: [NotificationsService],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
