import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Alert } from './alert.entity';
import { AlertHistory } from './alert-history.entity';
import { Silence } from './silence.entity';
import { InhibitRule } from './inhibit-rule.entity';
import { RuleHit } from '../metrics/metric.entity';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Alert, AlertHistory, Silence, InhibitRule, RuleHit])],
  providers: [AlertsService],
  controllers: [AlertsController],
  exports: [AlertsService],
})
export class AlertsModule {}
