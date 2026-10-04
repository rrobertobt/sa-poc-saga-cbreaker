<script setup lang="ts">
import { computed } from 'vue';
import { shortId, statusColor, time } from '../format';
import type { Saga, SagaLogEntry } from '../types';

const props = defineProps<{ saga: Saga | null; follow: boolean }>();
const emit = defineEmits<{ 'update:follow': [value: boolean] }>();

const STEPS = ['createOrder', 'payment', 'inventory', 'shipping'];

type StepState = 'pending' | 'done' | 'failed' | 'compensated' | 'compensation-failed';

const stepStates = computed(() =>
  STEPS.map((step) => {
    const entries = props.saga?.log.filter((l) => l.step === step) ?? [];
    const last = (action: SagaLogEntry['action']) => entries.filter((l) => l.action === action).at(-1);
    const compensation = last('compensate');
    const execution = last('execute');
    let state: StepState = 'pending';
    if (compensation?.result === 'success') state = 'compensated';
    else if (compensation?.result === 'failure') state = 'compensation-failed';
    else if (execution?.result === 'failure') state = 'failed';
    else if (execution?.result === 'success') state = 'done';
    return { step, state };
  }),
);

const ICONS: Record<string, string> = {
  'execute:success': '✓',
  'execute:failure': '✗',
  'compensate:success': '↺',
  'compensate:failure': '✗',
  'compensate:retry': '⟳',
};
</script>

<template>
  <section class="panel">
    <div class="title">
      <h2>Saga</h2>
      <label class="muted follow">
        <input type="checkbox" :checked="follow" @change="emit('update:follow', ($event.target as HTMLInputElement).checked)" />
        seguir la última
      </label>
    </div>

    <template v-if="saga">
      <div class="row head">
        <span class="mono">{{ shortId(saga.id) }}</span>
        <span :class="['badge', statusColor(saga.status)]">{{ saga.status }}</span>
        <span v-if="saga.failureReason" class="muted reason">{{ saga.failureReason }}</span>
      </div>

      <div class="steps">
        <template v-for="(s, i) in stepStates" :key="s.step">
          <span v-if="i" class="arrow">→</span>
          <span :class="['step', s.state]">{{ s.step }}</span>
        </template>
      </div>

      <ol class="log">
        <li v-for="(entry, i) in saga.log" :key="i" :class="[entry.action, entry.result]">
          <span class="icon">{{ ICONS[`${entry.action}:${entry.result}`] }}</span>
          <span class="mono muted">{{ time(entry.at) }}</span>
          <span class="what">{{ entry.action === 'execute' ? 'ejecutar' : 'compensar' }} <b>{{ entry.step }}</b></span>
          <span class="msg">{{ entry.message }}</span>
        </li>
      </ol>
    </template>
    <p v-else class="muted">Haz una compra o selecciona una orden.</p>
  </section>
</template>

<style scoped>
.title { display: flex; justify-content: space-between; align-items: baseline; }
.follow { font-size: 12px; display: flex; gap: 4px; align-items: center; }
.head { margin-bottom: 10px; }
.reason { font-size: 12px; }
.steps { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
.arrow { color: var(--muted); }
.step { padding: 4px 10px; border-radius: 6px; font-weight: 600; font-size: 12px; border: 1px solid var(--border); background: var(--gray-bg); color: var(--muted); }
.step.done { background: var(--green-bg); color: var(--green); border-color: var(--green); }
.step.failed { background: var(--red-bg); color: var(--red); border-color: var(--red); }
.step.compensated { background: var(--amber-bg); color: var(--amber); border-color: var(--amber); text-decoration: line-through; }
.step.compensation-failed { background: var(--red-bg); color: var(--red); border: 2px dashed var(--red); }
.log { list-style: none; margin: 0; padding: 0; }
.log li { display: grid; grid-template-columns: 18px 90px 170px 1fr; gap: 8px; padding: 5px 0; border-bottom: 1px solid var(--border); align-items: baseline; font-size: 13px; }
.icon { font-weight: 700; text-align: center; }
.execute.success .icon { color: var(--green); }
.failure .icon { color: var(--red); }
.compensate.success .icon { color: var(--amber); }
.retry .icon { color: var(--yellow); }
.compensate .what { color: var(--amber); }
.msg { min-width: 0; overflow-wrap: anywhere; }
</style>
