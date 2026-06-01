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

sonar-scanner
