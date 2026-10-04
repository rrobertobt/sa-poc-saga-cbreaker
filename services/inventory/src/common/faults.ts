import {
  Body,
  CallHandler,
  Controller,
  ExecutionContext,
  Get,
  HttpCode,
  Injectable,
  InternalServerErrorException,
  Module,
  NestInterceptor,
  Post,
  ServiceUnavailableException,
  SetMetadata,
} from '@nestjs/common';
import { APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { log } from './logger';

export const FAULT_MODES = ['none', 'error', 'slow', 'down'] as const;
export type FaultMode = (typeof FAULT_MODES)[number];

export interface FaultConfig {
  mode: FaultMode;
  delayMs: number;
}

/** Marks controllers/handlers that must never be affected by fault injection. */
const NO_FAULTS = 'noFaults';
export const NoFaults = () => SetMetadata(NO_FAULTS, true);

export class FaultConfigDto {
  @IsIn(FAULT_MODES)
  readonly mode: FaultMode;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60000)
  readonly delayMs?: number;
}

@Injectable()
export class FaultsService {
  private config: FaultConfig = { mode: 'none', delayMs: 5000 };

  get(): FaultConfig {
    return { ...this.config };
  }

  set(dto: FaultConfigDto): FaultConfig {
    this.config = { mode: dto.mode, delayMs: dto.delayMs ?? this.config.delayMs };
    log(null, `fault injection -> mode=${this.config.mode} delayMs=${this.config.delayMs}`);
    return this.get();
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Applies the active fault mode to business endpoints, before running the handler. */
@Injectable()
export class FaultInterceptor implements NestInterceptor {
  constructor(
    private readonly faults: FaultsService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const skip = this.reflector.getAllAndOverride<boolean>(NO_FAULTS, [ctx.getHandler(), ctx.getClass()]);
    if (skip) return next.handle();

    const { mode, delayMs } = this.faults.get();
    const req = ctx.switchToHttp().getRequest<Request>();
    const sagaId = req.header('idempotency-key');
    const route = `${req.method} ${req.path}`;

    switch (mode) {
      case 'error':
        log(sagaId, `FAULT error -> 500 en ${route}`);
        throw new InternalServerErrorException({ error: 'INJECTED_FAULT', message: 'Fallo inyectado (mode=error)' });
      case 'down':
        log(sagaId, `FAULT down -> 503 en ${route}`);
        throw new ServiceUnavailableException({ error: 'SERVICE_DOWN', message: 'Servicio caído (mode=down)' });
      case 'slow':
        log(sagaId, `FAULT slow -> esperando ${delayMs}ms en ${route}`);
        await sleep(delayMs);
        break;
      case 'none':
        break;
    }
    return next.handle();
  }
}

@NoFaults()
@Controller('admin/faults')
export class FaultsController {
  constructor(private readonly faults: FaultsService) {}

  @Get()
  get(): FaultConfig {
    return this.faults.get();
  }

  @Post()
  @HttpCode(200)
  set(@Body() dto: FaultConfigDto): FaultConfig {
    return this.faults.set(dto);
  }
}

@Module({
  controllers: [FaultsController],
  providers: [FaultsService, { provide: APP_INTERCEPTOR, useClass: FaultInterceptor }],
})
export class FaultsModule {}
