#!/usr/bin/env bash
# Scenario 8: the compensation temporarily fails.
# Expected: successful retry; if the failure persists, saga COMPENSATION_FAILED
set -euo pipefail
source "$(dirname "$0")/../lib.sh"
reset_all

# For Payment to fail right during the compensation: Inventory slow (1.5s per call) and Shipping in error.
# Timeline: reserve finishes ~1.5s, shipping fails, release finishes ~3s, refund attempt 1 ~3s, 2 ~3.5s, 3 ~4.5s.
refund_attempts() { body "$1" | json '.saga.log.filter(l=>l.step==="payment"&&l.action==="compensate").map(l=>l.result).join(" ")'; }

title "Escenario 8a: fallo temporal en la compensación (retry exitoso)"
say "Shipping en error, Inventory en slow 1500 ms; Payment pasa a error a los 0.8s y se arregla a los 4s"
fault "$INVENTORY" slow 1500
fault "$SHIPPING" error
( sleep 0.8; fault "$PAYMENT" error; sleep 3.2; fault "$PAYMENT" none ) &
r=$(buy P-001 1 20)
wait
show_purchase "$r" log
check "el refund se reintenta y funciona" "retry retry success" "$(refund_attempts "$r")"
check "saga COMPENSATED" COMPENSATED "$(body "$r" | json .saga.status)"
check "pago reembolsado" REFUNDED "$(curl -s "$PAYMENT/payments/$(body "$r" | json .saga.context.paymentId)" | json .status)"

title "Escenario 8b: fallo persistente en la compensación"
say "Igual, pero Payment no se arregla"
( sleep 0.8; fault "$PAYMENT" error ) &
r=$(buy P-001 1 20)
wait
reset_faults
show_purchase "$r" log
check "el refund agota los 3 intentos" "retry retry failure" "$(refund_attempts "$r")"
check "saga COMPENSATION_FAILED" COMPENSATION_FAILED "$(body "$r" | json .saga.status)"
check "el resto de compensaciones sí se ejecutan" "inventory:success createOrder:success" \
  "$(body "$r" | json '.saga.log.filter(l=>l.action==="compensate"&&l.step!=="payment").map(l=>`${l.step}:${l.result}`).join(" ")')"
check "el pago queda CHARGED para revisión manual" CHARGED "$(curl -s "$PAYMENT/payments/$(body "$r" | json .saga.context.paymentId)" | json .status)"
summary
