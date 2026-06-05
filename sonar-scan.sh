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
if [ -f coverage-js.lcov ]; then
  awk '/^SF:tests\//{skip=1} skip && /^end_of_record/{skip=0; next} !skip' \
    coverage-js.lcov > coverage-js-sonar.lcov
fi

sonar-scanner -Dsonar.javascript.lcov.reportPaths=coverage-js-sonar.lcov
