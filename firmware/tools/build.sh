#!/usr/bin/env bash
# Bouwt beide varianten en zet ze in ../fw/<variant>/ (op de site: /fw/<variant>/).
# Vereist: ESP-IDF v5.5.4 (source export.sh). Gebruik: tools/build.sh [versie]
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=${1:-$(grep -A2 'config OVERHEAD_VERSION' main/Kconfig.projbuild | sed -n 's/.*default "\(.*\)"/\1/p')}
./tools/fetch_components.sh >/dev/null
export IDF_COMPONENT_MANAGER=0
OUT=../fw
for v in rev1 rev3; do
  rm -f "build-$v/sdkconfig"
  printf 'CONFIG_OVERHEAD_VERSION="%s"\n' "$VERSION" > "build-$v.version"
  idf.py -B "build-$v" -D SDKCONFIG="build-$v/sdkconfig" \
    -D SDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.defaults.$v;build-$v.version" build
  mkdir -p "$OUT/$v"
  ( cd "build-$v" && python -m esptool --chip esp32p4 merge-bin -o "../$OUT/$v/overhead-full.bin" \
      --flash-mode dio --flash-freq 80m --flash-size 16MB @flash_args )
  cp "build-$v/overhead.bin" "$OUT/$v/overhead.bin"
  echo "$VERSION" > "$OUT/$v/version.txt"
  cat > "$OUT/$v/manifest.json" <<JSON
{
  "name": "Overhead-scherm",
  "version": "$VERSION",
  "new_install_prompt_erase": true,
  "builds": [{ "chipFamily": "ESP32-P4", "parts": [{ "path": "overhead-full.bin", "offset": 0 }] }]
}
JSON
  rm "build-$v.version"
done
ls -la "$OUT"/*
