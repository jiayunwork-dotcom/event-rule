import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Alert } from '../alerts/alert.entity';
import { RuleHit, Metric } from '../metrics/metric.entity';
import { Rule } from '../rules/rule.entity';
import { Notification } from '../notifications/notification.entity';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Alert, RuleHit, Metric, Rule, Notification])],
  providers: [DashboardService],
  controllers: [DashboardController],
  exports: [DashboardService],
})
export class DashboardModule {}
