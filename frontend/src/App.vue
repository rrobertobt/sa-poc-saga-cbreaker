<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { api, ApiError } from './api';
import BreakerCards from './components/BreakerCards.vue';
import FaultControls from './components/FaultControls.vue';
import OrdersList from './components/OrdersList.vue';
import PurchaseForm from './components/PurchaseForm.vue';
import SagaTimeline from './components/SagaTimeline.vue';
import { uuid } from './uuid';
import type { AppEvent, Breaker, BreakerEvent, Downstream, Order, Product, PurchaseInput, PurchaseResponse, Saga } from './types';

const orders = ref<Order[]>([]);
const products = ref<Product[]>([]);
const breakers = ref<Breaker[]>([]);
const breakerFeed = ref<BreakerEvent[]>([]);
const openedAt = reactive<Partial<Record<Downstream, number>>>({});
const now = ref(Date.now());

const saga = ref<Saga | null>(null);
const selectedSagaId = ref<string | null>(null);
const followLatest = ref(true);

const busy = ref(false);
const burst = ref<{ done: number; total: number } | null>(null);
const lastResult = ref<PurchaseResponse | null>(null);
const lastReplayed = ref(false);
const lastError = ref<string | null>(null);
// Last purchase sent: it can be resent with the same Idempotency-Key to demonstrate idempotency.
const lastRequest = ref<{ input: PurchaseInput; key: string } | null>(null);

const sseConnected = ref(false);
const faultControls = ref<InstanceType<typeof FaultControls> | null>(null);

// --- Data loading ------------------------------------------------------------

const safe = async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await fn();
  } catch {
    return undefined;
  }
};

async function loadOrders() {
  const list = await safe(api.orders);
  if (list) orders.value = list;
}
async function loadProducts() {
  const list = await safe(api.products);
  if (list) products.value = list;
}
async function loadBreakers() {
  const list = await safe(api.breakers);
  if (list) breakers.value = list;
}
async function loadSaga() {
  if (!selectedSagaId.value) return;
  const s = await safe(() => api.saga(selectedSagaId.value!));
  if (s && s.id === selectedSagaId.value) saga.value = s;
}

// Groups several consecutive refresh requests (e.g. during a burst) into a single one.
function debounce(fn: () => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(t);
    t = setTimeout(fn, ms);
  };
}
const refreshOrders = debounce(() => {
  void loadOrders();
  void loadProducts();
}, 150);
const refreshSaga = debounce(() => void loadSaga(), 50);

watch(selectedSagaId, () => {
  saga.value = null;
  void loadSaga();
});

// --- SSE events --------------------------------------------------------------

function onEvent(e: AppEvent) {
  if (e.type === 'breaker') {
    if (e.breakers) breakers.value = e.breakers;
    if (e.event === 'open' && e.breaker) openedAt[e.breaker] = Date.parse(e.at);
    if (e.event !== 'success') breakerFeed.value = [e, ...breakerFeed.value].slice(0, 40);
    return;
  }
  if (e.kind === 'status' && e.status === 'STARTED' && followLatest.value) selectedSagaId.value = e.sagaId;
  if (e.sagaId === selectedSagaId.value) refreshSaga();
  if (e.kind === 'status') refreshOrders();
}

let source: EventSource | undefined;
function connect() {
  source = new EventSource(api.eventsUrl);
  source.onopen = () => {
    sseConnected.value = true;
    // On (re)connect, recover whatever happened while there was no connection.
    void loadBreakers();
    refreshOrders();
  };
  source.onerror = () => (sseConnected.value = false);
  source.onmessage = (msg) => onEvent(JSON.parse(msg.data) as AppEvent);
}

// --- Actions -----------------------------------------------------------------

async function send(input: PurchaseInput, key: string) {
  lastRequest.value = { input, key };
  try {
    const { replayed, ...result } = await api.purchase(input, key);
    lastReplayed.value = replayed;
    lastResult.value = result;
    lastError.value = null;
  } catch (err) {
    lastError.value = err instanceof ApiError ? `${err.status} ${err.message}` : 'No se pudo conectar con Order Service';
  }
}

async function buy(input: PurchaseInput) {
  busy.value = true;
  await send(input, uuid());
  busy.value = false;
}

async function retry() {
  if (!lastRequest.value) return;
  busy.value = true;
  await send(lastRequest.value.input, lastRequest.value.key);
  busy.value = false;
}

// Sequential: each purchase waits for the previous one, so the breaker opens predictably.
async function runBurst(input: PurchaseInput, count: number) {
  busy.value = true;
  burst.value = { done: 0, total: count };
  for (let i = 0; i < count; i++) {
    await send(input, uuid());
    burst.value = { done: i + 1, total: count };
  }
  busy.value = false;
  setTimeout(() => (burst.value = null), 2000);
}

function selectOrder(id: string) {
  followLatest.value = false;
  selectedSagaId.value = id;
}

async function resetStock() {
  const list = await safe(api.resetStock);
  if (list) products.value = list;
}
async function resetBreakers() {
  const list = await safe(api.resetBreakers);
  if (list) breakers.value = list;
  breakerFeed.value = [];
}
async function clearFaults() {
  await faultControls.value?.clearAll();
}

// --- Lifecycle ----------------------------------------------------------------

let clock: ReturnType<typeof setInterval> | undefined;
let poll: ReturnType<typeof setInterval> | undefined;

onMounted(async () => {
  connect();
  await Promise.all([loadOrders(), loadProducts(), loadBreakers()]);
  if (orders.value[0]) selectedSagaId.value = orders.value[0].id;
  clock = setInterval(() => (now.value = Date.now()), 200);
  // opossum's 10s window empties without emitting events: it's polled periodically.
  poll = setInterval(() => {
    void loadBreakers();
    void loadProducts();
  }, 2000);
});

onUnmounted(() => {
  source?.close();
  clearInterval(clock);
  clearInterval(poll);
});
</script>

<template>
  <header class="top">
    <h1>Saga + Circuit Breaker</h1>
    <span :class="['badge', sseConnected ? 'green' : 'red']">{{ sseConnected ? 'SSE conectado' : 'SSE desconectado' }}</span>
    <div class="row tools">
      <button @click="resetStock">Restaurar stock</button>
      <button @click="resetBreakers">Reiniciar breakers</button>
      <button @click="clearFaults">Quitar fallos</button>
    </div>
  </header>

  <main class="grid">
    <PurchaseForm
      class="purchase"
      :products="products"
      :busy="busy"
      :burst="burst"
      :last-result="lastResult"
      :last-replayed="lastReplayed"
      :last-error="lastError"
      :can-retry="!!lastRequest"
      @buy="buy"
      @burst="runBurst"
      @retry="retry"
    />
    <FaultControls ref="faultControls" class="faults" />
    <BreakerCards class="breakers" :breakers="breakers" :opened-at="openedAt" :now="now" :feed="breakerFeed" />
    <SagaTimeline v-model:follow="followLatest" class="saga" :saga="saga" />
    <OrdersList class="orders" :orders="orders" :selected-id="selectedSagaId" @select="selectOrder" />
  </main>
</template>

<style scoped>
.top {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 24px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}
h1 { margin: 0; font-size: 18px; }
.tools { margin-left: auto; }
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-areas:
    'purchase faults'
    'breakers breakers'
    'saga orders';
  gap: 16px;
  padding: 16px 24px 32px;
  max-width: 1400px;
  margin: 0 auto;
}
.purchase { grid-area: purchase; }
.faults { grid-area: faults; }
.breakers { grid-area: breakers; }
.saga { grid-area: saga; }
.orders { grid-area: orders; }
@media (max-width: 900px) {
  .top { flex-wrap: wrap; padding: 12px 16px; }
  .tools { margin-left: 0; }
  .grid { grid-template-columns: 1fr; grid-template-areas: 'purchase' 'faults' 'breakers' 'saga' 'orders'; padding: 16px; }
}
</style>
