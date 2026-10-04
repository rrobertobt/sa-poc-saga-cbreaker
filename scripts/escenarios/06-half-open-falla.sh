#!/usr/bin/env bash
# Scenario 6: Payment keeps failing in Half-Open.
# Expected: payment breaker Half-Open → Open
set -euo pipefail
source "$(dirname "$0")/../lib.sh"
reset_all

title "Escenario 6: Half-Open → Open"
say "Preparación: Payment en error y 10 compras para abrir el breaker"
fault "$PAYMENT" error
for _ in $(seq 10); do buy P-001 1 10 >/dev/null; done
check "breaker OPEN" OPEN "$(breaker payment .state)"

say "Payment sigue en error. Se esperan los 10s de resetTimeout"
check "breaker HALF_OPEN" HALF_OPEN "$(wait_state payment HALF_OPEN 15)"

say "Llamada de prueba (llega a Payment y falla)"
r=$(buy P-001 1 10)
show_purchase "$r"
check "la llamada de prueba sí llega a Payment" "payment: INJECTED_FAULT (500)" "$(body "$r" | json .order.failureReason)"
check "un solo fallo devuelve el breaker a OPEN" OPEN "$(breaker payment .state)"

r=$(buy P-001 1 10)
say "Siguiente compra:"
show_purchase "$r"
check "las siguientes se rechazan con el fallback" "payment: CIRCUIT_OPEN: Servicio no disponible, intente más tarde" "$(body "$r" | json .order.failureReason)"
show_breakers
reset_faults
summary
