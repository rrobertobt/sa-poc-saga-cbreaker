import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { BreakerSnapshot, BreakersService } from './breakers.service';

@Controller('breakers')
export class BreakersController {
  constructor(private readonly breakers: BreakersService) {}

  @Get()
  list(): BreakerSnapshot[] {
    return this.breakers.snapshot();
  }

  @Post('reset')
  @HttpCode(200)
  reset(): BreakerSnapshot[] {
    return this.breakers.reset();
  }
}
