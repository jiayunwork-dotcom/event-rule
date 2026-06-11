import { Injectable, NestMiddleware, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../../tenants/tenant.entity';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private jwtService: JwtService,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const path = req.path;
    
    if (path.startsWith('/webhook/')) {
      const pathParts = path.split('/');
      const apiKey = pathParts[2];
      
      if (!apiKey) {
        throw new UnauthorizedException('API key is required in URL');
      }
      
      const tenant = await this.tenantRepository.findOne({
        where: { apiKey, isActive: true },
      });
      
      if (!tenant) {
        throw new ForbiddenException('Invalid API key');
      }
      
      (req as any).tenantId = tenant.id;
      return next();
    }

    if (path.startsWith('/api/v1/agent/') && path.endsWith('/metrics')) {
      const apiKey = req.headers['x-api-key'] as string;
      if (!apiKey) {
        throw new UnauthorizedException('API key is required');
      }
      
      const tenant = await this.tenantRepository.findOne({
        where: { apiKey, isActive: true },
      });
      
      if (!tenant) {
        throw new ForbiddenException('Invalid API key');
      }
      
      (req as any).tenantId = tenant.id;
      return next();
    }

    if (path.startsWith('/api/v1/auth/login') || path.startsWith('/health') || path.startsWith('/api/docs')) {
      return next();
    }

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
      
      (req as any).tenantId = payload.tenantId;
      (req as any).userId = payload.userId;
      (req as any).role = payload.role;
      
      next();
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
