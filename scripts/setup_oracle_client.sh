#!/usr/bin/env bash
# One-time setup: Oracle Instant Client 19.31 on Amazon Linux 2023 (x86_64).
# Run once after provisioning the EC2. Idempotent.
set -euo pipefail

INSTANT_CLIENT_VERSION="19.31"
INSTANT_CLIENT_LIB="/usr/lib/oracle/${INSTANT_CLIENT_VERSION}/client64/lib"
RPM_URL="https://yum.oracle.com/repo/OracleLinux/OL8/oracle/instantclient/x86_64/getPackage/oracle-instantclient${INSTANT_CLIENT_VERSION}-basiclite-${INSTANT_CLIENT_VERSION}.0.0.0-1.el8.x86_64.rpm"
SYSTEMD_SERVICE="/etc/systemd/system/gabi.service"

if ldconfig -p | grep -q libclntsh; then
  echo "Oracle Instant Client already installed — skipping."
else
  echo "Installing Oracle Instant Client ${INSTANT_CLIENT_VERSION}..."
  sudo dnf install -y libaio
  sudo dnf install -y "${RPM_URL}"
  sudo ldconfig
  echo "Installed at ${INSTANT_CLIENT_LIB}"
fi

if grep -q "ORACLE_INSTANT_CLIENT" "${SYSTEMD_SERVICE}"; then
  echo "ORACLE_INSTANT_CLIENT already set in ${SYSTEMD_SERVICE} — skipping."
else
  echo "Adding ORACLE_INSTANT_CLIENT to ${SYSTEMD_SERVICE}..."
  sudo sed -i "/\[Service\]/a Environment=ORACLE_INSTANT_CLIENT=${INSTANT_CLIENT_LIB}" "${SYSTEMD_SERVICE}"
  sudo systemctl daemon-reload
  sudo systemctl restart gabi
fi

echo "Done. Verify with: systemctl is-active gabi"
