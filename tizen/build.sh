#!/usr/bin/env bash
set -euo pipefail

DIRECTORY="$(pwd)/tizen"
OUTPUT="${DIRECTORY}/partygame.wgt"

rm -f "${OUTPUT}"

(cd "${DIRECTORY}" && zip -r "${OUTPUT}" config.xml index.html icon.png)

echo "Built ${OUTPUT}"
