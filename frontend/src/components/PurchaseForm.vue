<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { shortId, statusColor } from '../format';
import type { Product, PurchaseInput, PurchaseResponse } from '../types';

const props = defineProps<{
  products: Product[];
  busy: boolean;
  burst: { done: number; total: number } | null;
  lastResult: PurchaseResponse | null;
  lastReplayed: boolean;
  lastError: string | null;
  canRetry: boolean;
}>();

const emit = defineEmits<{
  buy: [input: PurchaseInput];
  burst: [input: PurchaseInput, count: number];
  retry: [];
}>();

const form = reactive<PurchaseInput>({ productId: 'P-001', quantity: 1, amount: 50 });
const burstCount = ref(12);
const stockOf = (sku: string) => props.products.find((p) => p.sku === sku)?.stock;
const valid = computed(() => form.quantity >= 1 && form.amount > 0);
</script>

<template>
  <section class="panel">
    <h2>Compra</h2>
    <div class="fields">
      <label>
        Producto
        <select v-model="form.productId">
          <option value="P-001">P-001 (stock: {{ stockOf('P-001') ?? '?' }})</option>
          <option value="P-002">P-002 (stock: {{ stockOf('P-002') ?? '?' }})</option>
        </select>
      </label>
      <label>
        Cantidad
        <input v-model.number="form.quantity" type="number" min="1" />
      </label>
      <label>
        Monto
        <input v-model.number="form.amount" type="number" min="1" />
      </label>
    </div>

    <div class="row actions">
      <button class="primary" :disabled="busy || !valid" @click="emit('buy', { ...form })">Comprar</button>
      <button :disabled="busy || !canRetry" title="Reenvía la última compra con la misma Idempotency-Key" @click="emit('retry')">
        Reintentar (misma clave)
      </button>
    </div>

    <div class="row actions">
      <button :disabled="busy || !valid" @click="emit('burst', { ...form }, burstCount)">Ráfaga</button>
      <input v-model.number="burstCount" type="number" min="1" max="50" class="count" />
      <span class="muted">compras seguidas</span>
      <span v-if="burst" class="mono">{{ burst.done }}/{{ burst.total }}</span>
    </div>

    <div class="result">
      <template v-if="lastError">
        <span class="badge red">Error</span> {{ lastError }}
      </template>
      <template v-else-if="lastResult">
        <span class="mono">{{ shortId(lastResult.order.id) }}</span>
        <span :class="['badge', statusColor(lastResult.order.status)]">{{ lastResult.order.status }}</span>
        <span v-if="lastResult.saga" :class="['badge', statusColor(lastResult.saga.status)]">{{ lastResult.saga.status }}</span>
        <span v-if="lastReplayed" class="badge blue" title="El servidor devolvió la orden existente">Idempotent-Replayed</span>
        <div v-if="lastResult.order.failureReason" class="muted reason">{{ lastResult.order.failureReason }}</div>
      </template>
      <span v-else class="muted">Sin compras todavía</span>
    </div>
  </section>
</template>

<style scoped>
.fields { display: grid; grid-template-columns: 1.6fr 1fr 1fr; gap: 10px; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
label input, label select { width: 100%; }
.actions { margin-top: 12px; }
.count { width: 64px; }
.result { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border); display: flex; gap: 6px; flex-wrap: wrap; align-items: center; min-height: 32px; }
.reason { width: 100%; font-size: 12px; }
</style>
