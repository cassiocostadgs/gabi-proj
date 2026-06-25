#!/usr/bin/env bash
# Roda análise SonarQube usando sonar-project.properties (nunca commitado)
# Setup: cp sonar-project.properties.example sonar-project.properties
#        Preencha sonar.token com seu token de http://localhost:9000

set -e

if [ ! -f sonar-project.properties ]; then
  echo "Erro: sonar-project.properties não encontrado."
  echo "  cp sonar-project.properties.example sonar-project.properties"
  echo "  Preencha sonar.token no arquivo."
  exit 1
fi

# Remove coverage blocks for test files — Sonar excludes them from analysis
# and would warn about unresolved paths in the lcov report.
LCOV_SRC=".vitest-coverage/lcov.info"
LCOV_SONAR=".vitest-coverage/lcov-sonar.lcov"

if [ -f "$LCOV_SRC" ]; then
  awk '/^SF:.*test/{skip=1} skip && /^end_of_record/{skip=0; next} !skip' \
    "$LCOV_SRC" \
  | sed 's|^SF:src/|SF:frontend/src/|' \
  | sed 's|^SF:node-compat|SF:frontend/node-compat|' \
  | sed 's|^SF:postcss|SF:frontend/postcss|' \
  | sed 's|^SF:tailwind|SF:frontend/tailwind|' \
  > "$LCOV_SONAR"
fi

sonar-scanner
