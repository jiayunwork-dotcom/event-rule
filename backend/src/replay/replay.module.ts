import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReplaySession } from './replay-session.entity';
import { ReplayEvent } from './replay-event.entity';
import { ReplayResult } from './replay-result.entity';
import { ReplayBookmark } from './replay-bookmark.entity';
import { Rule } from '../rules/rule.entity';
import { ReplayService } from './replay.service';
import { ReplayController } from './replay.controller';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [TypeOrmModule.forFeature([ReplaySession, ReplayEvent, ReplayResult, ReplayBookmark, Rule]), CommonModule],
  providers: [ReplayService],
  controllers: [ReplayController],
  exports: [ReplayService],
})
export class ReplayModule {}
