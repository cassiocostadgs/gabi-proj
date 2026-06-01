#!/usr/bin/env bash
# Roda o SonarScanner contra localhost:9000
# Uso: ./sonar-scan.sh <TOKEN>
#   TOKEN: gerado em http://localhost:9000 → My Account → Security → Generate Token

set -e

TOKEN="${1:-$SONAR_TOKEN}"

if [ -z "$TOKEN" ]; then
  echo "Erro: informe o token como argumento ou via variável SONAR_TOKEN"
  echo "  ./sonar-scan.sh <token>"
  exit 1
fi

# Verifica se sonar-scanner está disponível
if ! command -v sonar-scanner &>/dev/null; then
  echo "sonar-scanner não encontrado."
  echo "Instale via: brew install sonar-scanner"
  exit 1
fi

sonar-scanner \
  -Dsonar.token="$TOKEN"
