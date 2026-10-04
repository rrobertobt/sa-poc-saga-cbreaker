#!/usr/bin/env bash
# Runs the failure test scenarios and saves the evidence in docs/test-evidence/.
#   ./scripts/run-escenarios.sh          # all 8 scenarios (~2 min)
#   ./scripts/run-escenarios.sh 04 07    # only some of them
# For each scenario, <name>.log is saved with the script's output and, if the services are running in
# Docker, the logs of the 4 services during the scenario in chronological order.
set -uo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT="$ROOT/docs/test-evidence"
mkdir -p "$OUT"

if [ $# -gt 0 ]; then
  SCENARIOS=()
  for n in "$@"; do SCENARIOS+=("$ROOT"/scripts/escenarios/"$n"-*.sh); done
else
  SCENARIOS=("$ROOT"/scripts/escenarios/*.sh)
fi

DOCKER=false
docker compose -f "$ROOT/docker-compose.yml" ps --status running --quiet order >/dev/null 2>&1 && DOCKER=true

ROWS=()
FAILED=0
for script in "${SCENARIOS[@]}"; do
  name=$(basename "$script" .sh)
  log="$OUT/$name.log"
  expected=$(grep -m1 '^# Expected:' "$script" | sed 's/^# Expected: //')
  since=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  {
    echo "# $name"
    echo "# Fecha: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "# Esperado: $expected"
  } > "$log"
  bash "$script" 2>&1 | tee -a "$log"
  status=${PIPESTATUS[0]}

  if $DOCKER; then
    {
      echo
      echo "--- Logs de los servicios durante el escenario (docker compose) ---"
      docker compose -f "$ROOT/docker-compose.yml" logs --no-log-prefix --since "$since" order payment inventory shipping \
        | grep -E '^[0-9]{4}-' | sort
    } >> "$log"
  fi

  result=$(grep -m1 '^Resultado:' "$log" | sed 's/^Resultado: //')
  if [ "$status" -eq 0 ]; then verdict="OK"; else verdict="FALLA"; FAILED=$((FAILED + 1)); fi
  ROWS+=("| $name | $expected | $verdict ($result) | [$name.log]($name.log) |")
  sleep 1 # so one scenario's logs don't mix with the next one's
done

# The summary is only regenerated when running all scenarios, to avoid losing rows.
[ $# -eq 0 ] && {
  echo "# Evidencia de pruebas de fallos"
  echo
  echo "Generado con \`./scripts/run-escenarios.sh\` el $(date '+%Y-%m-%d %H:%M:%S')."
  $DOCKER || echo "Los servicios no corrían en Docker: los logs no incluyen la salida de los servicios."
  echo
  echo "| Escenario | Resultado esperado | Resultado | Evidencia |"
  echo "|---|---|---|---|"
  printf '%s\n' "${ROWS[@]}"
} > "$OUT/resumen.md"

echo
echo "Evidencia en docs/test-evidence/ ($(( ${#SCENARIOS[@]} - FAILED ))/${#SCENARIOS[@]} escenarios OK)"
[ "$FAILED" -eq 0 ]
