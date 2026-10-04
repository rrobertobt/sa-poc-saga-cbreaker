#!/usr/bin/env bash
# Scenario 7: Inventory slow (slow 3500 ms > timeout of 3000 ms).
# Expected: timeouts count as failures and open the inventory breaker
set -euo pipefail
source "$(dirname "$0")/../lib.sh"
reset_all
STOCK0=$(stock P-001)
fault "$INVENTORY" slow 3500

# 7a: with sequential calls each one takes 3s, so opossum's 10s window never reaches
# 10 calls (volumeThreshold) and the breaker doesn't open even though they all fail. See docs/breaker-differences.md (1).
title "Escenario 7a: Inventory lento, llamadas secuenciales"
say "Inventory en slow 3500 ms; el breaker corta a los 3000 ms. 4 compras seguidas (~12s)"
for i in $(seq 4); do
  start=$(ms)
  r=$(buy P-001 1 10)
  elapsed=$(( $(ms) - start ))
  printf '    compra %d: %-20s %5d ms   breaker inventory: %-7s ventana 10s: %s/%s fallos\n' "$i" \
    "$(body "$r" | json .order.failureReason)" "$elapsed" "$(breaker inventory .state)" \
    "$(breaker inventory .stats.failures)" "$(breaker inventory .stats.fires)"
  [ "$i" -eq 1 ] && check "la llamada se corta por timeout a los 3s" "inventory: TIMEOUT" "$(body "$r" | json .order.failureReason)"
done
check "cada timeout cuenta como fallo" "4 4" "$(breaker inventory .totals.timeouts) $(breaker inventory .totals.failures)"
check "con poco tráfico la ventana no llega a 10 llamadas: sigue CLOSED" CLOSED "$(breaker inventory .state)"

title "Escenario 7b: Inventory lento, 12 compras concurrentes"
curl -s -o /dev/null -X POST "$ORDER/breakers/reset"
say "12 compras a la vez: los 12 timeouts caen dentro de la misma ventana de 10s"
TMP=$(mktemp -d)
start=$(ms)
for i in $(seq 12); do
  curl -s -o "$TMP/$i.json" -X POST "$ORDER/orders" -H 'Content-Type: application/json' \
    -H "Idempotency-Key: $(uuidgen)" -d '{"productId":"P-001","quantity":1,"amount":10}' &
done
wait
say "Las 12 terminaron en $(( $(ms) - start )) ms"
for i in $(seq 12); do printf '    compra %2d: %s\n' "$i" "$(json .order.failureReason < "$TMP/$i.json")"; done
rm -rf "$TMP"
check "las 12 fallan por timeout" "12 12" "$(breaker inventory .totals.timeouts) $(breaker inventory .totals.failures)"
check "los timeouts abren el breaker" OPEN "$(breaker inventory .state)"

start=$(ms)
r=$(buy P-001 1 10)
elapsed=$(( $(ms) - start ))
say "Compra siguiente (${elapsed} ms):"
show_purchase "$r"
check "con Open, fallback inmediato sin llamar a Inventory" "inventory: CIRCUIT_OPEN: Servicio no disponible, intente más tarde" "$(body "$r" | json .order.failureReason)"
check "respuesta inmediata (< 500 ms)" yes "$([ "$elapsed" -lt 500 ] && echo yes || echo "no (${elapsed}ms)")"
check "la saga compensa el pago" REFUNDED "$(curl -s "$PAYMENT/payments/$(body "$r" | json .saga.context.paymentId)" | json .status)"
fault "$INVENTORY" none
show_breakers

say "Limitación conocida: Inventory termina las reservas después del timeout y no se compensan"
sleep 4
say "Stock de P-001: antes $STOCK0, ahora $(stock P-001) (aunque todas las órdenes quedaron CANCELLED)"
curl -s -o /dev/null -X POST "$INVENTORY/admin/stock/reset"
summary
