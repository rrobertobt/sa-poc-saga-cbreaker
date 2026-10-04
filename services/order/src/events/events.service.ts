import { Injectable, MessageEvent } from '@nestjs/common';
import { map, Observable, Subject } from 'rxjs';

export interface AppEvent {
  type: 'saga' | 'breaker';
  at: string;
  [key: string]: unknown;
}

/** In-memory bus for saga and breaker events forwarded to the frontend via SSE. */
@Injectable()
export class EventsService {
  private readonly events = new Subject<AppEvent>();

  emit(event: Omit<AppEvent, 'at'>): void {
    this.events.next({ ...event, at: new Date().toISOString() } as AppEvent);
  }

  stream(): Observable<MessageEvent> {
    return this.events.pipe(map((data) => ({ data })));
  }
}
