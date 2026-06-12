import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import {
  ReplayService,
  CreateSessionDto,
  StartReplayDto,
  SetBreakpointsDto,
  ReplayProgress,
  ComparisonReport,
} from './replay.service';
import { ReplaySession } from './replay-session.entity';
import { ReplayEvent } from './replay-event.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { fromEvent, map, Observable } from 'rxjs';

@ApiTags('replay-debug')
@ApiBearerAuth()
@Controller('api/v1/replay')
export class ReplayController {
  constructor(
    private readonly replayService: ReplayService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Get('sessions')
  @ApiOperation({ summary: '分页查询录制会话列表，支持按名称搜索' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiQuery({ name: 'keyword', required: false })
  async listSessions(
    @CurrentTenant() tenantId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
  ): Promise<{ items: ReplaySession[]; total: number; page: number; pageSize: number }> {
    return this.replayService.listSessions(
      tenantId,
      parseInt(page || '1', 10),
      parseInt(pageSize || '20', 10),
      keyword,
    );
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: '获取单个录制会话详情' })
  async getSession(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<ReplaySession> {
    return this.replayService.getSession(tenantId, id);
  }

  @Post('sessions')
  @ApiOperation({ summary: '新建录制会话并开始录制' })
  async startRecording(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateSessionDto,
  ): Promise<ReplaySession> {
    return this.replayService.startRecording(tenantId, dto);
  }

  @Post('sessions/:id/stop')
  @ApiOperation({ summary: '停止录制' })
  async stopRecording(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<ReplaySession> {
    return this.replayService.stopRecording(tenantId, id);
  }

  @Post('sessions/:id/archive')
  @ApiOperation({ summary: '归档录制会话' })
  async archiveSession(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<ReplaySession> {
    return this.replayService.archiveSession(tenantId, id);
  }

  @Delete('sessions/:id')
  @ApiOperation({ summary: '删除录制会话及其所有事件和结果' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSession(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.replayService.deleteSession(tenantId, id);
  }

  @Get('sessions/:id/events')
  @ApiOperation({ summary: '获取会话录制的事件列表' })
  async getSessionEvents(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<{ items: ReplayEvent[]; total: number }> {
    return this.replayService.getSessionEvents(
      tenantId,
      id,
      parseInt(page || '1', 10),
      parseInt(pageSize || '100', 10),
    );
  }

  @Post('sessions/:id/replay/start')
  @ApiOperation({ summary: '启动回放（实时/加速/单步）' })
  async startReplay(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: StartReplayDto,
  ): Promise<ReplayProgress> {
    return this.replayService.startReplay(tenantId, id, dto);
  }

  @Post('sessions/:id/replay/step')
  @ApiOperation({ summary: '单步回放下一条事件' })
  async singleStepNext(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<ReplayProgress> {
    return this.replayService.singleStepNext(tenantId, id);
  }

  @Post('sessions/:id/replay/pause')
  @ApiOperation({ summary: '暂停回放' })
  async pauseReplay(
    @CurrentTenant() _tenantId: string,
    @Param('id') id: string,
  ): Promise<ReplayProgress> {
    return this.replayService.pauseReplay(id);
  }

  @Post('sessions/:id/replay/resume')
  @ApiOperation({ summary: '继续回放' })
  async resumeReplay(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<ReplayProgress> {
    return this.replayService.resumeReplay(tenantId, id);
  }

  @Post('sessions/:id/replay/stop')
  @ApiOperation({ summary: '停止回放' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async stopReplay(
    @CurrentTenant() _tenantId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.replayService.stopReplay(id);
  }

  @Get('sessions/:id/replay/progress')
  @ApiOperation({ summary: '获取回放进度' })
  async getProgress(
    @CurrentTenant() _tenantId: string,
    @Param('id') id: string,
  ): Promise<ReplayProgress> {
    return this.replayService.getProgress(id);
  }

  @Sse('sessions/:id/replay/stream')
  @ApiOperation({ summary: '实时监听回放进度和断点事件 (SSE)' })
  streamReplayProgress(
    @Param('id') id: string,
  ): Observable<MessageEvent> {
    const progress$ = fromEvent(this.eventEmitter, `replay.progress.${id}`).pipe(
      map((data) => ({ type: 'progress', data }) as MessageEvent),
    );
    const paused$ = fromEvent(this.eventEmitter, `replay.paused.${id}`).pipe(
      map((data) => ({ type: 'paused', data }) as MessageEvent),
    );
    const finished$ = fromEvent(this.eventEmitter, `replay.finished.${id}`).pipe(
      map((data) => ({ type: 'finished', data }) as MessageEvent),
    );
    return new Observable((subscriber) => {
      const subscriptions = [progress$, paused$, finished$].map((obs) =>
        obs.subscribe((v) => subscriber.next(v)),
      );
      return () => subscriptions.forEach((s) => s.unsubscribe());
    });
  }

  @Post('sessions/:id/replay/breakpoints')
  @ApiOperation({ summary: '设置调试断点条件' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async setBreakpoints(
    @CurrentTenant() _tenantId: string,
    @Param('id') id: string,
    @Body() dto: SetBreakpointsDto,
  ): Promise<void> {
    return this.replayService.setBreakpoints(id, dto);
  }

  @Get('sessions/:id/comparison')
  @ApiOperation({ summary: '获取规则对比报告（回放结束后）' })
  async getComparisonReport(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<ComparisonReport> {
    return this.replayService.getComparisonReport(tenantId, id);
  }
}
