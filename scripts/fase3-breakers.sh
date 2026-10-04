#!/usr/bin/env bash
# Phase 3: circuit breakers (opossum) on the saga's forward calls.
# Closed on the happy path, Closed → Open with Payment in error, Open → Half-Open → Closed,
# and Half-Open → Open if Payment keeps failing. Takes ~30s due to the 10s waits.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

reset_faults
curl -s -o /dev/null -X POST "$INVENTORY/admin/stock/reset"
curl -s -o /dev/null -X POST "$ORDER/breakers/reset"

echo "== Flujo feliz con breakers en Closed"
r=$(buy P-001 1 10)
check "saga COMPLETED" COMPLETED "$(body "$r" | json .saga.status)"
check "los 3 breakers en CLOSED" "CLOSED CLOSED CLOSED" "$(curl -s "$ORDER/breakers" | json '.map(b=>b.state).join(" ")')"
check "GET /breakers cuenta el éxito de payment" 1 "$(breaker payment .stats.successes)"

echo "== Los errores de negocio (4xx) no abren el breaker"
for _ in $(seq 10); do buy P-002 1 10 >/dev/null; done
check "10 compras sin stock: inventory sigue CLOSED" "CLOSED 0" "$(breaker inventory .state) $(breaker inventory .stats.failures)"

echo "== Payment en error: Closed → Open"
# Reset: the previous purchases count as successes in the 10s window and would raise the number of failures needed.
curl -s -o /dev/null -X POST "$ORDER/breakers/reset"
fault "$PAYMENT" error
for i in $(seq 10); do
  r=$(buy P-001 1 10)
  [ "$i" -eq 1 ] && check "las primeras llamadas llegan a Payment (500)" "payment: INJECTED_FAULT (500)" "$(body "$r" | json .order.failureReason)"
done
check "tras 10 fallos el breaker está OPEN" OPEN "$(breaker payment .state)"
REJECTS0=$(breaker payment .totals.rejects)
start=$(ms)
r=$(buy P-001 1 10)
elapsed=$(( $(ms) - start ))
check "con Open responde el fallback" "payment: CIRCUIT_OPEN: Servicio no disponible, intente más tarde" "$(body "$r" | json .order.failureReason)"
check "la saga se compensa (orden CANCELLED)" "CANCELLED COMPENSATED" "$(body "$r" | json .order.status) $(body "$r" | json .saga.status)"
check "respuesta inmediata (< 500ms)" yes "$([ "$elapsed" -lt 500 ] && echo yes || echo "no (${elapsed}ms)")"
buy P-001 1 10 >/dev/null
check "las llamadas se rechazan sin llegar a Payment" "$((REJECTS0 + 2))" "$(breaker payment .totals.rejects)"

echo "== Open → Half-Open → Closed (Payment recuperado)"
fault "$PAYMENT" none
check "tras 10s pasa a HALF_OPEN" HALF_OPEN "$(wait_state payment HALF_OPEN 15)"
r=$(buy P-001 1 10)
check "la llamada de prueba llega a Payment y la saga completa" COMPLETED "$(body "$r" | json .saga.status)"
check "el breaker vuelve a CLOSED" CLOSED "$(breaker payment .state)"

echo "== Half-Open → Open (Payment sigue fallando)"
fault "$PAYMENT" error
for _ in $(seq 10); do buy P-001 1 10 >/dev/null; done
check "el breaker se abre otra vez" OPEN "$(wait_state payment OPEN 2)"
check "tras 10s pasa a HALF_OPEN" HALF_OPEN "$(wait_state payment HALF_OPEN 15)"
r=$(buy P-001 1 10)
check "la llamada de prueba llega a Payment y falla" "payment: INJECTED_FAULT (500)" "$(body "$r" | json .order.failureReason)"
check "un solo fallo en Half-Open lo devuelve a OPEN" OPEN "$(breaker payment .state)"
fault "$PAYMENT" none

echo "== Timeout: una llamada lenta cuenta como fallo"
curl -s -o /dev/null -X POST "$ORDER/breakers/reset" # payment was left OPEN in the previous section
fault "$INVENTORY" slow 3500
start=$(ms)
r=$(buy P-001 1 10)
elapsed=$(( $(ms) - start ))
fault "$INVENTORY" none
check "el breaker corta a los 3s" "inventory: TIMEOUT" "$(body "$r" | json .order.failureReason)"
check "la saga no espera los 3.5s del servicio" yes "$([ "$elapsed" -lt 3500 ] && echo yes || echo "no (${elapsed}ms)")"
check "inventory cuenta 1 timeout y 1 fallo" "1 1" "$(breaker inventory .totals.timeouts) $(breaker inventory .totals.failures)"

# Leave the environment clean for other scripts.
reset_faults
sleep 4 # the slow reservation finishes in Inventory after the timeout (known limitation): wait before restoring stock
curl -s -o /dev/null -X POST "$INVENTORY/admin/stock/reset"
curl -s -o /dev/null -X POST "$ORDER/breakers/reset"

summary
