#!/usr/bin/env bash
# Scenario 5: wait 10s with Payment fixed.
# Expected: payment breaker Open → Half-Open → Closed
set -euo pipefail
source "$(dirname "$0")/../lib.sh"
reset_all

title "Escenario 5: Open → Half-Open → Closed"
say "Preparación: Payment en error y 10 compras para abrir el breaker"
fault "$PAYMENT" error
for _ in $(seq 10); do buy P-001 1 10 >/dev/null; done
check "breaker OPEN" OPEN "$(breaker payment .state)"

say "Se arregla Payment (none) y se esperan los 10s de resetTimeout"
fault "$PAYMENT" none
start=$(ms)
state=$(wait_state payment HALF_OPEN 15)
say "Pasó a $state tras $(( ($(ms) - start) / 1000 ))s"
check "breaker HALF_OPEN" HALF_OPEN "$state"

say "Llamada de prueba"
r=$(buy P-001 1 10)
show_purchase "$r"
check "la saga completa" COMPLETED "$(body "$r" | json .saga.status)"
check "breaker CLOSED" CLOSED "$(breaker payment .state)"
show_breakers
summary
