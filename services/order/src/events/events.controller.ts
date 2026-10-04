import { Controller, MessageEvent, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { EventsService } from './events.service';

@Controller()
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Sse('events')
  stream(): Observable<MessageEvent> {
    return this.events.stream();
  }
}
