#!/usr/bin/env bash
# Check the local Java/Maven toolchain before claiming a Selenium framework can build or run.
set -u

PASS=1
STATUS="runtime_ready"

check_cmd() {
  local name="$1" cmd="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "MISSING: $name ($cmd not on PATH)"
    PASS=0
    STATUS="runtime_missing"
    return 1
  fi
  return 0
}

echo "== Selenium/Java toolchain doctor =="

if check_cmd "Java" java; then
  JAVA_VERSION=$(java -version 2>&1 | head -n 1)
  echo "OK: java -> $JAVA_VERSION"
  MAJOR=$(java -version 2>&1 | head -n 1 | grep -oE '"[0-9]+' | tr -d '"' | head -n1)
  if [ -n "${MAJOR:-}" ] && [ "$MAJOR" -lt 17 ]; then
    echo "WARN: Java major version $MAJOR is below the required 17 or 21"
    PASS=0
    STATUS="dependency_mismatch"
  fi
fi

if check_cmd "Maven" mvn; then
  MVN_VERSION=$(mvn -version 2>&1 | head -n 1)
  echo "OK: mvn -> $MVN_VERSION"
fi

PROJECT_DIR="${1:-.}"
if [ -f "$PROJECT_DIR/pom.xml" ]; then
  echo "OK: pom.xml found under $PROJECT_DIR"
else
  echo "INFO: no pom.xml under $PROJECT_DIR yet (expected before GENERATE mode has run)"
fi

echo "== verdict =="
if [ "$PASS" -eq 1 ]; then
  echo '{"status":"runtime_ready","java":"ok","maven":"ok"}'
  exit 0
else
  echo "{\"status\":\"$STATUS\"}"
  exit 1
fi
