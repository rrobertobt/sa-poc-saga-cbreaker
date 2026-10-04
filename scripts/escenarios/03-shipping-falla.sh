#!/usr/bin/env bash
# Scenario 3: Shipping fails.
# Expected: full backward compensation (inventory → payment → order)
set -euo pipefail
source "$(dirname "$0")/../lib.sh"
reset_all

title "Escenario 3: Shipping en error"
STOCK0=$(stock P-001)
say "Shipping en modo error (500). Compra de P-001"
fault "$SHIPPING" error
r=$(buy P-001 1 40)
fault "$SHIPPING" none
show_purchase "$r" log

check "saga COMPENSATED, orden CANCELLED" "COMPENSATED CANCELLED" "$(body "$r" | json .saga.status) $(body "$r" | json .order.status)"
check "compensa en orden inverso" "inventory payment createOrder" \
  "$(body "$r" | json '.saga.log.filter(l=>l.action==="compensate").map(l=>l.step).join(" ")')"
check "stock restaurado ($STOCK0)" "$STOCK0" "$(stock P-001)"
check "pago reembolsado" REFUNDED "$(curl -s "$PAYMENT/payments/$(body "$r" | json .saga.context.paymentId)" | json .status)"
summary
