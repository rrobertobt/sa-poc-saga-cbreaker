import { BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Reads the `Idempotency-Key` header. Required by default;
 * `@IdempotencyKey(false)` makes it optional.
 */
export const IdempotencyKey = createParamDecorator(
  (required: boolean | undefined, ctx: ExecutionContext): string | undefined => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const key = req.header('idempotency-key')?.trim();
    if (!key && required !== false) {
      throw new BadRequestException({
        error: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'El header Idempotency-Key es obligatorio',
      });
    }
    return key || undefined;
  },
);
