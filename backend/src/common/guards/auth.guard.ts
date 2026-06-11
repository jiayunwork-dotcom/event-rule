import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../../tenants/tenant.entity';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_API_KEY_AUTH } from '../decorators/api-key.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwtService: JwtService,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const isApiKeyAuth = this.reflector.getAllAndOverride<boolean>(IS_API_KEY_AUTH, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();

    if (isApiKeyAuth) {
      return this.handleApiKeyAuth(request);
    }

    return this.handleJwtAuth(request);
  }

  private async handleApiKeyAuth(req: any): Promise<boolean> {
    const apiKey =
      req.headers['x-api-key'] ||
      req.params?.apiKey;

    if (!apiKey) {
      throw new UnauthorizedException('API key is required');
    }

    const tenant = await this.tenantRepository.findOne({
      where: { apiKey, isActive: true },
    });

    if (!tenant) {
      throw new ForbiddenException('Invalid API key');
    }

    req.tenantId = tenant.id;
    return true;
  }

  private async handleJwtAuth(req: any): Promise<boolean> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authorization header is required');
    }

    try {
      const token = authHeader.substring(7);
      const payload = this.jwtService.verify(token);

      const tenant = await this.tenantRepository.findOne({
        where: { id: payload.tenantId, isActive: true },
      });

      if (!tenant) {
        throw new ForbiddenException('Tenant not found or inactive');
      }

      req.tenantId = payload.tenantId;
      req.userId = payload.userId;
      req.role = payload.role;

      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid token');
    }
  }
}
