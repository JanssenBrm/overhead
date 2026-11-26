#!/usr/bin/env bash
# Haalt de externe ESP-IDF-componenten op (vaste versies) naar components/.
# Ze komen rechtstreeks uit de GitHub-repo's van Espressif.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p components
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

fetch() { # repo tag subdir doel
  local repo=$1 tag=$2 sub=$3 dest=components/$4
  [ -d "$dest" ] && return 0
  git -c advice.detachedHead=false clone -q --depth 1 --recursive --shallow-submodules -b "$tag" "https://github.com/$repo.git" "$tmp/$4"
  cp -r "$tmp/$4/$sub" "$dest"
  rm -rf "$dest/examples" "$dest/docs" "$dest/test_apps" "$dest/slave"
}
fetch espressif/esp-hosted-mcu   v2.12.13            .                                   esp_hosted
fetch espressif/esp-wifi-remote  wifi_remote-v1.6.5  components/esp_wifi_remote          esp_wifi_remote
fetch espressif/esp-iot-solution master              components/display/lcd/esp_lcd_ek79007 esp_lcd_ek79007
# esp_lcd_ek79007 heeft cmake_utilities alleen nodig voor een versienummer
sed -i "/include(package_manager)/d;/cu_pkg_define_version/d" components/esp_lcd_ek79007/CMakeLists.txt
echo "target_compile_definitions(\${COMPONENT_LIB} PRIVATE ESP_LCD_EK79007_VER_MAJOR=2 ESP_LCD_EK79007_VER_MINOR=0 ESP_LCD_EK79007_VER_PATCH=2)" >> components/esp_lcd_ek79007/CMakeLists.txt
echo "Componenten staan klaar in components/"
