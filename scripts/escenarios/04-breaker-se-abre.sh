#!/usr/bin/env bash
# Scenario 4: Payment failing + burst of 12 purchases.
# Expected: payment breaker Closed → Open; the following calls use the fallback instantly
set -euo pipefail
source "$(dirname "$0")/../lib.sh"
reset_all

title "Escenario 4: Payment en error + ráfaga"
say "Payment en modo error. Breaker: abre con >50% de fallos y al menos 10 llamadas en 10s"
fault "$PAYMENT" error
for i in $(seq 12); do
  start=$(ms)
  r=$(buy P-001 1 10)
  elapsed=$(( $(ms) - start ))
  printf '    compra %2d: %-70s %4d ms   breaker payment: %s\n' "$i" "$(body "$r" | json .order.failureReason)" "$elapsed" "$(breaker payment .state)"
  [ "$i" -eq 10 ] && check "tras 10 fallos el breaker está OPEN" OPEN "$(breaker payment .state)"
  [ "$i" -eq 11 ] && check "con Open, fallback 'Servicio no disponible'" "payment: CIRCUIT_OPEN: Servicio no disponible, intente más tarde" "$(body "$r" | json .order.failureReason)"
  [ "$i" -eq 11 ] && check "respuesta inmediata (< 500 ms)" yes "$([ "$elapsed" -lt 500 ] && echo yes || echo "no (${elapsed}ms)")"
done
say "Estado de los breakers"
show_breakers
check "2 llamadas rechazadas sin llegar a Payment" 2 "$(breaker payment .totals.rejects)"
check "Payment solo recibió 10 llamadas (fallos), no 12" 10 "$(breaker payment .totals.failures)"
reset_faults
summary
