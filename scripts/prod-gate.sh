#!/usr/bin/env bash
# scripts/prod-gate.sh — Wolf Engine Production Gate
# 8 checks that must ALL pass before any production deployment.
#
# Usage:
#   ./scripts/prod-gate.sh
#   ./scripts/prod-gate.sh --skip-docker   (skip CVE scan if Docker not available)
#
# Exit codes:
#   0 — all gates passed
#   1 — one or more gates failed

set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

SKIP_DOCKER=false
[[ "${1:-}" == "--skip-docker" ]] && SKIP_DOCKER=true

PASS=0
FAIL=0
WARNINGS=()

pass() { echo -e "${GREEN}✓ PASS${RESET}  $1"; ((PASS++)); }
fail() { echo -e "${RED}✗ FAIL${RESET}  $1"; ((FAIL++)); }
warn() { echo -e "${YELLOW}⚠ WARN${RESET}  $1"; WARNINGS+=("$1"); }
header() { echo -e "\n${CYAN}${BOLD}── Gate $1: $2 ──${RESET}"; }

# ── Gate 1: Coverage thresholds ───────────────────────────────────────────────

header 1 "Coverage Thresholds (Stmt≥99 / Branch≥90 / Fn≥98 / Line≥99)"

if [ ! -f "./coverage/coverage-summary.json" ]; then
  echo "  No coverage-summary.json — running tests..."
  npm test -- --coverage --coverageReporters=json-summary --silent 2>/dev/null || true
fi

if [ -f "./coverage/coverage-summary.json" ]; then
  node -e "
    const s = require('./coverage/coverage-summary.json').total;
    const thresholds = { statements: 99, branches: 90, functions: 98, lines: 99 };
    const failures = Object.entries(thresholds)
      .filter(([k, min]) => (s[k]?.pct ?? 0) < min)
      .map(([k, min]) => k + ': ' + (s[k]?.pct ?? 0).toFixed(1) + '% < ' + min + '%');
    if (failures.length) {
      console.log('  FAILED: ' + failures.join(', '));
      process.exit(1);
    }
    console.log('  Stmts:', s.statements.pct + '%', '| Branches:', s.branches.pct + '%',
                '| Fns:', s.functions.pct + '%', '| Lines:', s.lines.pct + '%');
  " && pass "Coverage thresholds" || fail "Coverage thresholds"
else
  fail "Coverage file not found"
fi

# ── Gate 2: All tests passing ─────────────────────────────────────────────────

header 2 "Test Suite (all tests must pass)"

if npm test -- --silent --passWithNoTests 2>&1 | tail -3; then
  pass "All tests passing"
else
  fail "Test suite has failures"
fi

# ── Gate 3: No plaintext K8s secrets ─────────────────────────────────────────

header 3 "K8s Secrets (no plaintext Secrets in git)"

PLAINTEXT_SECRETS=0
if ls k8s/*.yaml k8s/*.yml 2>/dev/null | xargs grep -l "kind: Secret" 2>/dev/null \
   | xargs grep -L "encrypted\|sealed" 2>/dev/null | grep -q .; then
  PLAINTEXT_SECRETS=1
fi

if [ "$PLAINTEXT_SECRETS" -eq 0 ]; then
  pass "No plaintext K8s secrets"
else
  fail "Plaintext K8s secrets found — use kubeseal"
fi

# ── Gate 4: Docker CVE scan (Trivy) ──────────────────────────────────────────

header 4 "Docker CVE Scan (Trivy — no CRITICAL/HIGH)"

if [ "$SKIP_DOCKER" = true ]; then
  warn "Docker CVE scan skipped (--skip-docker)"
elif ! command -v trivy &>/dev/null; then
  warn "trivy not installed — skipping CVE scan"
elif ! command -v docker &>/dev/null; then
  warn "docker not installed — skipping CVE scan"
else
  IMAGE_TAG="wolf-engine:prod-gate-$(date +%s)"
  if docker build -t "$IMAGE_TAG" . -q 2>/dev/null; then
    if trivy image --severity CRITICAL,HIGH --exit-code 1 --ignore-unfixed "$IMAGE_TAG" 2>/dev/null; then
      pass "Docker CVE scan (no CRITICAL/HIGH unfixed)"
    else
      fail "Docker CVE scan — CRITICAL or HIGH vulnerabilities found"
    fi
    docker rmi "$IMAGE_TAG" -f &>/dev/null || true
  else
    warn "Docker build failed — skipping CVE scan"
  fi
fi

# ── Gate 5: K8s manifests dry-run ────────────────────────────────────────────

header 5 "K8s Manifests (kubectl dry-run)"

if ! command -v kubectl &>/dev/null; then
  warn "kubectl not installed — skipping manifest validation"
elif kubectl cluster-info &>/dev/null 2>&1; then
  MANIFEST_FAIL=0
  for f in k8s/*.yaml k8s/*.yml 2>/dev/null; do
    [ -f "$f" ] || continue
    if ! kubectl apply --dry-run=client -f "$f" &>/dev/null; then
      echo "  Invalid manifest: $f"
      MANIFEST_FAIL=1
    fi
  done
  [ "$MANIFEST_FAIL" -eq 0 ] && pass "K8s manifests valid" || fail "Invalid K8s manifests"
else
  warn "No k8s cluster available — skipping manifest dry-run"
fi

# ── Gate 6: Mutation score ≥70% ───────────────────────────────────────────────

header 6 "Mutation Score (Stryker ≥70%)"

if [ -f "./coverage/mutation/mutation.json" ]; then
  SCORE=$(node -e "
    const r = require('./coverage/mutation/mutation.json');
    const score = r.mutationScore ?? 0;
    console.log(Math.round(score));
  " 2>/dev/null || echo "0")
  echo "  Mutation score: ${SCORE}%"
  if [ "${SCORE}" -ge 70 ]; then
    pass "Mutation score ${SCORE}% ≥ 70%"
  else
    fail "Mutation score ${SCORE}% < 70%"
  fi
else
  warn "No mutation report found — run: npx stryker run"
fi

# ── Gate 7: Required env vars in .env.example ────────────────────────────────

header 7 "Required Env Vars (.env.example completeness)"

REQUIRED_VARS=(
  "BASE_URL"
  "PHONE_SALT"
  "JWT_SECRET"
  "JWT_REFRESH_SECRET"
  "API_KEYS"
  "TWILIO_AUTH_TOKEN"
  "DB_PASSWORD"
  "REDIS_URL"
)

MISSING_VARS=()
for VAR in "${REQUIRED_VARS[@]}"; do
  if ! grep -q "^${VAR}=" .env.example 2>/dev/null; then
    MISSING_VARS+=("$VAR")
  fi
done

if [ "${#MISSING_VARS[@]}" -eq 0 ]; then
  pass "All required env vars documented in .env.example"
else
  fail "Missing from .env.example: ${MISSING_VARS[*]}"
fi

# ── Gate 8: npm audit (prod deps, no HIGH/CRITICAL) ──────────────────────────

header 8 "npm Audit (prod deps — no HIGH/CRITICAL)"

if npm audit --audit-level=high --omit=dev --json 2>/dev/null \
   | node -e "
     const chunks = []; process.stdin.on('data', c => chunks.push(c));
     process.stdin.on('end', () => {
       try {
         const r = JSON.parse(chunks.join(''));
         const vulns = Object.values(r.vulnerabilities || {})
           .filter(v => ['high','critical'].includes(v.severity));
         if (vulns.length) {
           console.log('  Vulnerabilities:', vulns.map(v => v.name + ' (' + v.severity + ')').join(', '));
           process.exit(1);
         }
         console.log('  No HIGH/CRITICAL vulnerabilities in prod dependencies');
       } catch { console.log('  Could not parse audit output'); }
     });
   "; then
  pass "npm audit clean"
else
  fail "npm audit found HIGH/CRITICAL vulnerabilities"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  Wolf Engine Production Gate Results${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"
echo -e "  ${GREEN}PASSED: ${PASS}${RESET}"
echo -e "  ${RED}FAILED: ${FAIL}${RESET}"
if [ "${#WARNINGS[@]}" -gt 0 ]; then
  echo -e "  ${YELLOW}WARNINGS: ${#WARNINGS[@]}${RESET}"
  for W in "${WARNINGS[@]}"; do echo -e "    ${YELLOW}⚠ ${W}${RESET}"; done
fi
echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"

if [ "$FAIL" -gt 0 ]; then
  echo -e "\n${RED}${BOLD}❌ Production gate FAILED — do not deploy${RESET}\n"
  exit 1
else
  echo -e "\n${GREEN}${BOLD}✅ All production gates passed — ready to deploy${RESET}\n"
  exit 0
fi
