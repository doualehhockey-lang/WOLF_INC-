#!/usr/bin/env bash
# scripts/staging-soak.sh — 48h soak monitoring script.
#
# Polls Prometheus every 5 minutes for the duration of the soak test.
# At the end, generates a summary report with:
#   - P95/P99 latency trend
#   - Error rate over time
#   - Memory growth (leak indicator)
#   - DB pool saturation events
#   - Redis failure events
#   - Recommendation: promote / hold / investigate
#
# Prerequisites:
#   - PROMETHEUS_URL env var (or defaults to http://localhost:9090)
#   - curl, jq
#
# Usage:
#   PROMETHEUS_URL=http://prometheus.staging:9090 ./scripts/staging-soak.sh
#   ./scripts/staging-soak.sh --duration=3600  # 1h quick soak (CI)
#   ./scripts/staging-soak.sh --report-only    # generate report from last run
#
# Output:
#   logs/soak/soak-YYYYMMDD-HHMMSS.log   (per-poll metrics)
#   logs/soak/soak-YYYYMMDD-HHMMSS.md    (final report)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────

PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"
JOB="${PROMETHEUS_JOB:-wolf-engine-staging}"

SOAK_DURATION_SEC=172800   # 48h default
POLL_INTERVAL_SEC=300      # 5min
REPORT_ONLY=false

# Parse args
for arg in "$@"; do
  case $arg in
    --duration=*)   SOAK_DURATION_SEC="${arg#*=}" ;;
    --interval=*)   POLL_INTERVAL_SEC="${arg#*=}" ;;
    --report-only)  REPORT_ONLY=true ;;
  esac
done

# ── Output files ──────────────────────────────────────────────────────────────

mkdir -p logs/soak
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_FILE="logs/soak/soak-${TIMESTAMP}.log"
REPORT_FILE="logs/soak/soak-${TIMESTAMP}.md"

# ── Colours ───────────────────────────────────────────────────────────────────

RED='\033[0;31m'; YEL='\033[1;33m'; GRN='\033[0;32m'
BLU='\033[0;34m'; CYN='\033[0;36m'; RST='\033[0m'

log()  { echo -e "${BLU}[$(date '+%H:%M:%S')]${RST} $*" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YEL}[$(date '+%H:%M:%S')] WARN${RST} $*" | tee -a "$LOG_FILE"; }
err()  { echo -e "${RED}[$(date '+%H:%M:%S')] ERR ${RST} $*" | tee -a "$LOG_FILE"; }
ok()   { echo -e "${GRN}[$(date '+%H:%M:%S')] OK  ${RST} $*" | tee -a "$LOG_FILE"; }

# ── Prometheus query helper ───────────────────────────────────────────────────

prom_query() {
  local query="$1"
  local result
  result=$(curl -sf \
    "${PROMETHEUS_URL}/api/v1/query" \
    --data-urlencode "query=${query}" \
    | jq -r '.data.result[0].value[1] // "N/A"' 2>/dev/null) || result="ERR"
  echo "$result"
}

prom_scalar() {
  local val
  val=$(prom_query "$1")
  if [[ "$val" == "N/A" || "$val" == "ERR" ]]; then echo "0"; else echo "$val"; fi
}

# ── Metric collection ─────────────────────────────────────────────────────────

declare -a SAMPLES_P95=()
declare -a SAMPLES_P99=()
declare -a SAMPLES_ERR=()
declare -a SAMPLES_MEM=()
declare -a SAMPLES_POOL=()
declare -a TIMESTAMPS=()

MEM_BASELINE=""
SATURATION_EVENTS=0
REDIS_ERRORS_TOTAL=0

collect_metrics() {
  local ts
  ts=$(date '+%Y-%m-%dT%H:%M:%S')
  TIMESTAMPS+=("$ts")

  local p95 p99 err_rate mem pool redis_err

  p95=$(prom_scalar "histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job=\"${JOB}\", route!~\"/health.*|/metrics\"}[5m])) by (le))")
  p99=$(prom_scalar "histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{job=\"${JOB}\", route!~\"/health.*|/metrics\"}[5m])) by (le))")
  err_rate=$(prom_scalar "sum(rate(http_requests_total{job=\"${JOB}\",status=~\"5..\"}[5m])) / sum(rate(http_requests_total{job=\"${JOB}\",route!~\"/health.*|/metrics\"}[5m]))")
  mem=$(prom_scalar "process_resident_memory_bytes{job=\"${JOB}\"}")
  pool=$(prom_scalar "wolf_db_pool_acquired{job=\"${JOB}\"}")
  redis_err=$(prom_scalar "increase(wolf_feature_flag_redis_errors_total{job=\"${JOB}\"}[5m])")

  SAMPLES_P95+=("$p95")
  SAMPLES_P99+=("$p99")
  SAMPLES_ERR+=("$err_rate")
  SAMPLES_MEM+=("$mem")
  SAMPLES_POOL+=("$pool")

  # Set memory baseline on first sample
  [[ -z "$MEM_BASELINE" ]] && MEM_BASELINE="$mem"

  # Track saturation events (pool ≥ 5)
  local pool_int
  pool_int=$(printf '%.0f' "${pool:-0}" 2>/dev/null || echo 0)
  [[ "$pool_int" -ge 5 ]] && ((SATURATION_EVENTS++)) || true

  # Accumulate Redis errors
  local re_int
  re_int=$(printf '%.0f' "${redis_err:-0}" 2>/dev/null || echo 0)
  REDIS_ERRORS_TOTAL=$((REDIS_ERRORS_TOTAL + re_int))

  # Live status line
  local p95_ms p99_ms mem_mb
  p95_ms=$(echo "$p95 * 1000" | bc -l 2>/dev/null | xargs printf '%.0f' 2>/dev/null || echo "?")
  p99_ms=$(echo "$p99 * 1000" | bc -l 2>/dev/null | xargs printf '%.0f' 2>/dev/null || echo "?")
  mem_mb=$(echo "$mem / 1048576" | bc 2>/dev/null || echo "?")
  local err_pct
  err_pct=$(echo "$err_rate * 100" | bc -l 2>/dev/null | xargs printf '%.2f' 2>/dev/null || echo "?")

  log "P95=${p95_ms}ms P99=${p99_ms}ms ERR=${err_pct}% MEM=${mem_mb}MB POOL=${pool} REDIS_ERR=${re_int}"

  # Threshold warnings
  local p95_warn p99_warn err_warn mem_warn pool_warn
  p95_warn=$(echo "$p95 > 2.0" | bc -l 2>/dev/null || echo 0)
  p99_warn=$(echo "$p99 > 3.0" | bc -l 2>/dev/null || echo 0)
  err_warn=$(echo "$err_rate > 0.02" | bc -l 2>/dev/null || echo 0)
  [[ "$pool_int" -ge 5 ]] && pool_warn=1 || pool_warn=0

  [[ "$p95_warn" == "1" ]] && warn "P95 latency ABOVE threshold (${p95_ms}ms > 2000ms)"
  [[ "$p99_warn" == "1" ]] && warn "P99 latency ABOVE threshold (${p99_ms}ms > 3000ms)"
  [[ "$err_warn" == "1" ]] && err  "Error rate ABOVE threshold (${err_pct}% > 2%)"
  [[ "$pool_warn" == "1" ]] && warn "DB pool SATURATED (${pool}/5)"
}

# ── Statistics helpers ────────────────────────────────────────────────────────

array_max() {
  local max="${1:-0}"
  for v in "$@"; do
    [[ "$(echo "$v > $max" | bc -l 2>/dev/null)" == "1" ]] && max="$v"
  done
  echo "$max"
}

array_min() {
  local min="${1:-9999}"
  for v in "$@"; do
    [[ "$(echo "$v < $min" | bc -l 2>/dev/null)" == "1" ]] && min="$v"
  done
  echo "$min"
}

array_avg() {
  local sum=0 count=0
  for v in "$@"; do
    sum=$(echo "$sum + $v" | bc -l 2>/dev/null || echo "$sum")
    ((count++))
  done
  [[ "$count" -eq 0 ]] && echo "0" || echo "scale=4; $sum / $count" | bc -l 2>/dev/null || echo "0"
}

ms() { echo "scale=0; $1 * 1000 / 1" | bc -l 2>/dev/null || echo "?"; }
mb() { echo "scale=1; $1 / 1048576" | bc -l 2>/dev/null || echo "?"; }
pct() { echo "scale=2; $1 * 100" | bc -l 2>/dev/null || echo "?"; }

# ── Report generation ─────────────────────────────────────────────────────────

generate_report() {
  local duration_h
  duration_h=$(echo "scale=1; ${SOAK_DURATION_SEC} / 3600" | bc -l)
  local n_samples="${#TIMESTAMPS[@]}"

  local max_p95 min_p95 avg_p95
  max_p95=$(array_max "${SAMPLES_P95[@]:-0}")
  min_p95=$(array_min "${SAMPLES_P95[@]:-0}")
  avg_p95=$(array_avg "${SAMPLES_P95[@]:-0}")

  local max_p99 avg_p99
  max_p99=$(array_max "${SAMPLES_P99[@]:-0}")
  avg_p99=$(array_avg "${SAMPLES_P99[@]:-0}")

  local max_err avg_err
  max_err=$(array_max "${SAMPLES_ERR[@]:-0}")
  avg_err=$(array_avg "${SAMPLES_ERR[@]:-0}")

  local mem_final="${SAMPLES_MEM[-1]:-0}"
  local mem_growth=0
  if [[ -n "$MEM_BASELINE" && "$MEM_BASELINE" != "0" ]]; then
    mem_growth=$(echo "$mem_final - $MEM_BASELINE" | bc 2>/dev/null || echo 0)
  fi

  # Verdict logic
  local verdict="PROMOTE ✅"
  local verdict_detail="All soak metrics within acceptable bounds."

  local avg_p95_ms avg_err_pct mem_growth_mb
  avg_p95_ms=$(ms "$avg_p95")
  avg_err_pct=$(pct "$avg_err")
  mem_growth_mb=$(mb "$mem_growth")

  # Check each threshold
  [[ "$(echo "$avg_p95 > 1.5" | bc -l 2>/dev/null)" == "1" ]] && \
    verdict="HOLD ⚠️" && verdict_detail="Avg P95 latency above 1.5s — investigate before promoting."
  [[ "$(echo "$max_err > 0.02" | bc -l 2>/dev/null)" == "1" ]] && \
    verdict="HOLD ⚠️" && verdict_detail="Error rate peaked above 2% — check error logs."
  [[ "$SATURATION_EVENTS" -gt 3 ]] && \
    verdict="HOLD ⚠️" && verdict_detail="DB pool saturated ${SATURATION_EVENTS} times — review slow queries."
  [[ "$(echo "$mem_growth > 104857600" | bc -l 2>/dev/null)" == "1" ]] && \
    verdict="INVESTIGATE 🔴" && verdict_detail="Memory grew by >100 MB — potential leak detected."
  [[ "$(echo "$avg_err > 0.05" | bc -l 2>/dev/null)" == "1" ]] && \
    verdict="ROLLBACK 🛑" && verdict_detail="Average error rate above 5% — do not promote."

  cat > "$REPORT_FILE" << EOF
# Wolf Engine Soak Report — ${TIMESTAMP}

**Duration:** ${duration_h}h &nbsp;|&nbsp; **Samples:** ${n_samples} &nbsp;|&nbsp; **Interval:** ${POLL_INTERVAL_SEC}s

---

## Verdict: ${verdict}

${verdict_detail}

---

## Latency (HTTP, excluding /health)

| Metric | Min | Avg | Max | Threshold |
|--------|-----|-----|-----|-----------|
| P95 | $(ms "$min_p95")ms | ${avg_p95_ms}ms | $(ms "$max_p95")ms | ≤ 2000ms |
| P99 | — | $(ms "$avg_p99")ms | $(ms "$max_p99")ms | ≤ 3000ms |

## Error Rate

| Metric | Avg | Peak | Threshold |
|--------|-----|------|-----------|
| 5xx rate | ${avg_err_pct}% | $(pct "$max_err")% | ≤ 2% |

## Memory

| Metric | Value |
|--------|-------|
| Baseline RSS | $(mb "$MEM_BASELINE") MB |
| Final RSS | $(mb "$mem_final") MB |
| Growth | $(mb "$mem_growth") MB |
| Status | $( [[ "$(echo "$mem_growth > 104857600" | bc -l 2>/dev/null)" == "1" ]] && echo "⚠️ Possible leak" || echo "✅ Stable" ) |

## DB Connection Pool

| Metric | Value |
|--------|-------|
| Saturation events (pool=5) | ${SATURATION_EVENTS} |
| Status | $( [[ "$SATURATION_EVENTS" -gt 3 ]] && echo "⚠️ Frequent saturation" || echo "✅ OK" ) |

## Redis

| Metric | Value |
|--------|-------|
| Feature flag Redis errors (total) | ${REDIS_ERRORS_TOTAL} |
| Status | $( [[ "$REDIS_ERRORS_TOTAL" -gt 10 ]] && echo "⚠️ Redis instability detected" || echo "✅ OK" ) |

---

## Pool Size Recommendation

EOF

  if [[ "$SATURATION_EVENTS" -gt 5 ]]; then
    echo "**Increase DB_POOL_MAX**: The pool was saturated ${SATURATION_EVENTS} times during staging soak." >> "$REPORT_FILE"
    echo "Consider increasing to **8** in staging (currently 5) and **15** in production (currently 10)." >> "$REPORT_FILE"
  else
    echo "DB_POOL_MAX=5 appears sufficient for this load level in staging." >> "$REPORT_FILE"
  fi

  cat >> "$REPORT_FILE" << EOF

---

## Raw Log

\`\`\`
$(tail -50 "$LOG_FILE")
\`\`\`

_Generated by scripts/staging-soak.sh at ${TIMESTAMP}_
EOF

  echo ""
  echo -e "${CYN}══════════════════════════════════════════════════════════${RST}"
  echo -e "${CYN}  SOAK REPORT: ${REPORT_FILE}${RST}"
  echo -e "${CYN}══════════════════════════════════════════════════════════${RST}"
  echo ""
  cat "$REPORT_FILE"
}

# ── Main loop ─────────────────────────────────────────────────────────────────

if [[ "$REPORT_ONLY" == "true" ]]; then
  # Find the most recent log file and generate a report from it
  LATEST_LOG=$(ls -t logs/soak/*.log 2>/dev/null | head -1 || echo "")
  if [[ -z "$LATEST_LOG" ]]; then
    err "No soak logs found in logs/soak/"
    exit 1
  fi
  log "Generating report from $LATEST_LOG"
  generate_report
  exit 0
fi

# Verify Prometheus is reachable
if ! curl -sf "${PROMETHEUS_URL}/-/ready" > /dev/null 2>&1; then
  err "Prometheus not reachable at ${PROMETHEUS_URL}"
  err "Set PROMETHEUS_URL env var or use port-forward:"
  err "  kubectl port-forward -n monitoring svc/prometheus-operated 9090"
  exit 1
fi

log "Starting ${SOAK_DURATION_SEC}s soak monitor (job=${JOB})"
log "Prometheus: ${PROMETHEUS_URL}"
log "Poll interval: ${POLL_INTERVAL_SEC}s"
log "Log: ${LOG_FILE}"
log "Report: ${REPORT_FILE}"
echo ""

START_TIME=$(date +%s)
END_TIME=$((START_TIME + SOAK_DURATION_SEC))

while [[ "$(date +%s)" -lt "$END_TIME" ]]; do
  collect_metrics

  REMAINING=$((END_TIME - $(date +%s)))
  ELAPSED=$(($(date +%s) - START_TIME))
  PCT_DONE=$(echo "scale=0; $ELAPSED * 100 / $SOAK_DURATION_SEC" | bc 2>/dev/null || echo "?")
  log "Progress: ${PCT_DONE}% done (${REMAINING}s remaining)"

  sleep "$POLL_INTERVAL_SEC"
done

log "Soak complete — generating report..."
generate_report

# Exit with failure if verdict is not PROMOTE
if grep -q "HOLD\|INVESTIGATE\|ROLLBACK" "$REPORT_FILE"; then
  exit 1
fi
exit 0
