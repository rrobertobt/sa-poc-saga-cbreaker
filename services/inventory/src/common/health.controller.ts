import { Controller, Get } from '@nestjs/common';
import { NoFaults } from './faults';

@NoFaults()
@Controller('health')
export class HealthController {
  @Get()
  health() {
    return { status: 'ok', service: 'inventory' };
  }
}
