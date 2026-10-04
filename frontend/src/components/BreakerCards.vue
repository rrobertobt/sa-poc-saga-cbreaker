<script setup lang="ts">
import { shortId, statusColor, time } from '../format';
import type { Breaker, BreakerEvent, Downstream } from '../types';

const props = defineProps<{
  breakers: Breaker[];
  openedAt: Partial<Record<Downstream, number>>;
  now: number;
  feed: BreakerEvent[];
}>();

const LABELS = { CLOSED: 'Closed', OPEN: 'Open', HALF_OPEN: 'Half-Open' } as const;

function countdown(breaker: Breaker): string | null {
  const opened = props.openedAt[breaker.name];
  if (breaker.state !== 'OPEN' || opened === undefined) return null;
  const left = Math.max(0, opened + breaker.options.resetTimeout - props.now);
  return `Half-Open en ${(left / 1000).toFixed(1)}s`;
}

const EVENT_COLORS: Record<string, string> = {
  open: 'red',
  failure: 'red',
  timeout: 'red',
  reject: 'amber',
  halfOpen: 'yellow',
  close: 'green',
};

const failureRate = (b: Breaker) => (b.stats.fires ? Math.round((b.stats.failures / b.stats.fires) * 100) : 0);
</script>

<template>
  <section class="panel">
    <h2>Circuit Breakers</h2>
    <div class="cards">
      <article v-for="b in breakers" :key="b.name" :class="['card', b.state]">
        <header>
          <span class="name">{{ b.name }}</span>
          <span :class="['badge', statusColor(b.state)]">{{ LABELS[b.state] }}</span>
        </header>
        <div class="hint">
          <template v-if="countdown(b)">{{ countdown(b) }}</template>
          <template v-else-if="b.state === 'HALF_OPEN'">Se permite 1 llamada de prueba</template>
          <template v-else>Llamadas pasan al servicio</template>
        </div>
        <dl>
          <div><dt>Éxitos</dt><dd>{{ b.totals.successes }}</dd></div>
          <div><dt>Fallos</dt><dd>{{ b.totals.failures }}</dd></div>
          <div><dt>Timeouts</dt><dd>{{ b.totals.timeouts }}</dd></div>
          <div><dt>Rechazos</dt><dd>{{ b.totals.rejects }}</dd></div>
          <div><dt>Fallbacks</dt><dd>{{ b.totals.fallbacks }}</dd></div>
          <div><dt>Llamadas</dt><dd>{{ b.totals.fires }}</dd></div>
        </dl>
        <div class="window muted">
          Ventana 10s: {{ b.stats.failures }}/{{ b.stats.fires }} fallos ({{ failureRate(b) }}%) · abre con
          &gt;{{ b.options.errorThresholdPercentage }}% y ≥{{ b.options.volumeThreshold }} llamadas
        </div>
      </article>
    </div>

    <h2 class="feed-title">Eventos</h2>
    <ol class="feed">
      <li v-for="(e, i) in feed" :key="i">
        <span class="mono muted">{{ time(e.at) }}</span>
        <span class="mono">{{ e.breaker ?? 'todos' }}</span>
        <span :class="['badge', EVENT_COLORS[e.event] ?? 'gray']">{{ e.event }}</span>
        <span class="msg">{{ e.message }}</span>
        <span v-if="e.sagaId" class="mono muted">{{ shortId(e.sagaId) }}</span>
      </li>
      <li v-if="!feed.length" class="muted">Sin eventos (los éxitos no se listan)</li>
    </ol>
  </section>
</template>

<style scoped>
.cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.card { border: 2px solid var(--border); border-radius: 10px; padding: 12px; transition: border-color 0.2s, background 0.2s; }
.card.CLOSED { border-color: var(--green); }
.card.OPEN { border-color: var(--red); background: var(--red-bg); }
.card.HALF_OPEN { border-color: var(--yellow); background: var(--yellow-bg); }
header { display: flex; justify-content: space-between; align-items: center; }
.name { font-weight: 700; font-size: 15px; }
.hint { font-size: 12px; color: var(--muted); margin: 4px 0 10px; min-height: 16px; }
dl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 0; }
dl div { background: var(--gray-bg); border-radius: 6px; padding: 4px 6px; }
dt { font-size: 11px; color: var(--muted); }
dd { margin: 0; font-weight: 700; font-size: 16px; font-variant-numeric: tabular-nums; }
.window { font-size: 11px; margin-top: 8px; }
.feed-title { margin-top: 16px; }
.feed { list-style: none; margin: 0; padding: 0; max-height: 180px; overflow-y: auto; }
.feed li { display: flex; gap: 8px; align-items: center; padding: 3px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
.msg { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 900px) { .cards { grid-template-columns: 1fr; } }
</style>
