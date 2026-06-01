#!/usr/bin/env bash
# Roda análise SonarQube com pysonar-scanner
# Uso: ./sonar-scan.sh <TOKEN>
#   TOKEN: gerado em http://localhost:9000 → My Account → Security → Generate Token

set -e

TOKEN="${1:-$SONAR_TOKEN}"

if [ -z "$TOKEN" ]; then
  echo "Erro: informe o token como argumento ou via variável SONAR_TOKEN"
  echo "  ./sonar-scan.sh <token>"
  exit 1
fi

if ! command -v pysonar &>/dev/null; then
  echo "pysonar não encontrado. Instalando..."
  pip install pysonar-scanner -q
fi

pysonar \
  --sonar-host-url=http://localhost:9000 \
  --sonar-token="$TOKEN" \
  --sonar-project-key=GABI
