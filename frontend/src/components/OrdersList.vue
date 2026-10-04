<script setup lang="ts">
import { shortId, statusColor, time } from '../format';
import type { Order } from '../types';

defineProps<{ orders: Order[]; selectedId: string | null }>();
const emit = defineEmits<{ select: [id: string] }>();
</script>

<template>
  <section class="panel">
    <h2>Órdenes ({{ orders.length }})</h2>
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th>Hora</th>
            <th>Orden</th>
            <th>Producto</th>
            <th>Cant.</th>
            <th>Monto</th>
            <th>Estado</th>
            <th>Motivo</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="o in orders"
            :key="o.id"
            :class="{ selected: o.id === selectedId }"
            title="Ver la saga de esta orden"
            @click="emit('select', o.id)"
          >
            <td class="mono muted">{{ time(o.createdAt) }}</td>
            <td class="mono">{{ shortId(o.id) }}</td>
            <td>{{ o.productId }}</td>
            <td>{{ o.quantity }}</td>
            <td>{{ o.amount }}</td>
            <td><span :class="['badge', statusColor(o.status)]">{{ o.status }}</span></td>
            <td class="reason muted">{{ o.failureReason }}</td>
          </tr>
          <tr v-if="!orders.length"><td colspan="7" class="muted">Sin órdenes</td></tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.scroll { max-height: 420px; overflow: auto; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { text-align: left; font-size: 11px; color: var(--muted); font-weight: 600; padding: 4px 6px; position: sticky; top: 0; background: var(--panel); }
td { padding: 5px 6px; border-top: 1px solid var(--border); }
tbody tr { cursor: pointer; }
tbody tr:hover { background: var(--gray-bg); }
tr.selected { background: var(--blue-bg); }
.reason { font-size: 12px; }
</style>
