import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import Redis from 'ioredis';
import { Tenant } from '../tenants/tenant.entity';
import { User } from '../users/user.entity';
import { RuleTemplate } from '../rules/rule-template.entity';
import { RedisService } from './services/redis.service';
import { EventQueueService } from './services/event-queue.service';
import { AuthGuard } from './guards/auth.guard';
import { DatabaseInitService } from './services/database-init.service';

@Global()
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Tenant, User, RuleTemplate]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET', 'your-secret-key'),
        signOptions: { expiresIn: '24h' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        return new Redis({
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
        });
      },
      inject: [ConfigService],
    },
    RedisService,
    EventQueueService,
    AuthGuard,
    DatabaseInitService,
  ],
  exports: [RedisService, EventQueueService, AuthGuard, JwtModule],
})
export class CommonModule {}
