<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue';
import { api } from '../api';
import type { Downstream, FaultMode } from '../types';

const SERVICES: Downstream[] = ['payment', 'inventory', 'shipping'];
const MODES: FaultMode[] = ['none', 'error', 'slow', 'down'];

interface ServiceFault {
  mode: FaultMode;
  delayMs: number;
  reachable: boolean;
}

const faults = reactive<Record<Downstream, ServiceFault>>({
  payment: { mode: 'none', delayMs: 5000, reachable: true },
  inventory: { mode: 'none', delayMs: 5000, reachable: true },
  shipping: { mode: 'none', delayMs: 5000, reachable: true },
});
// Don't overwrite the delay while the user is editing it.
const editing = ref<Downstream | null>(null);

async function load() {
  await Promise.all(
    SERVICES.map(async (service) => {
      try {
        const config = await api.faults(service);
        faults[service].mode = config.mode;
        if (editing.value !== service) faults[service].delayMs = config.delayMs;
        faults[service].reachable = true;
      } catch {
        faults[service].reachable = false;
      }
    }),
  );
}

async function apply(service: Downstream, mode = faults[service].mode) {
  faults[service].mode = mode;
  const config = await api.setFault(service, { mode, delayMs: faults[service].delayMs });
  faults[service].mode = config.mode;
  faults[service].delayMs = config.delayMs;
}

async function clearAll() {
  await Promise.all(SERVICES.map((service) => apply(service, 'none')));
}

let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  void load();
  timer = setInterval(load, 3000);
});
onUnmounted(() => clearInterval(timer));

defineExpose({ clearAll });
</script>

<template>
  <section class="panel">
    <h2>Inyección de fallos</h2>
    <div v-for="service in SERVICES" :key="service" class="service">
      <div class="name">
        {{ service }}
        <span v-if="!faults[service].reachable" class="badge red">sin conexión</span>
      </div>
      <div class="modes">
        <button
          v-for="mode in MODES"
          :key="mode"
          :class="['mode', mode, { active: faults[service].mode === mode }]"
          @click="apply(service, mode)"
        >
          {{ mode }}
        </button>
      </div>
      <label class="delay" title="Retardo del modo slow">
        <input
          v-model.number="faults[service].delayMs"
          type="number"
          min="0"
          step="500"
          @focus="editing = service"
          @blur="editing = null"
          @change="apply(service)"
        />
        ms
      </label>
    </div>
    <p class="muted hint">slow &gt; 3000 ms supera el timeout del breaker.</p>
  </section>
</template>

<style scoped>
.service { display: grid; grid-template-columns: 110px 1fr auto; gap: 10px; align-items: center; padding: 6px 0; }
.name { font-weight: 600; display: flex; gap: 6px; align-items: center; }
.modes { display: flex; }
.mode { border-radius: 0; margin-left: -1px; padding: 5px 10px; }
.mode:first-child { border-radius: 6px 0 0 6px; margin-left: 0; }
.mode:last-child { border-radius: 0 6px 6px 0; }
.mode.active { color: #fff; font-weight: 600; position: relative; }
.mode.none.active { background: var(--green); border-color: var(--green); }
.mode.error.active { background: var(--red); border-color: var(--red); }
.mode.slow.active { background: var(--amber); border-color: var(--amber); }
.mode.down.active { background: #495057; border-color: #495057; }
.delay { display: flex; align-items: center; gap: 4px; color: var(--muted); font-size: 12px; }
.delay input { width: 80px; }
.hint { margin: 8px 0 0; font-size: 12px; }
</style>
