import { Controller, Get, Param } from '@nestjs/common';
import { SagaExecution } from './saga-execution.entity';
import { SagaOrchestrator } from './saga-orchestrator.service';

@Controller('sagas')
export class SagasController {
  constructor(private readonly orchestrator: SagaOrchestrator) {}

  @Get()
  list(): Promise<SagaExecution[]> {
    return this.orchestrator.list();
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<SagaExecution> {
    return this.orchestrator.get(id);
  }
}
