#!/usr/bin/env bash
# Install the shared libraries headless Chromium needs on images that lack them
# (no root required: packages are unpacked under ~/.local/lib/morph-browser).
#
# Most machines can simply run `npx playwright install --with-deps chromium`.
# On restricted containers where sudo is unavailable, use this script and then
# `source scripts/browser-env.sh` before running Playwright.
set -euo pipefail

UA="http://archive.ubuntu.com/ubuntu"
ROOT="${BROWSER_LIB_ROOT:-$HOME/.local/lib/morph-browser}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

PACKAGES=(
  "pool/main/n/nspr/libnspr4_4.35-1.1build1_amd64.deb"
  "pool/main/n/nss/libnss3_3.98-1build1_amd64.deb"
  "pool/main/a/at-spi2-core/libatk1.0-0t64_2.52.0-1build1_amd64.deb"
  "pool/main/a/at-spi2-core/libatk-bridge2.0-0t64_2.52.0-1build1_amd64.deb"
  "pool/main/a/at-spi2-core/libatspi2.0-0t64_2.52.0-1build1_amd64.deb"
  "pool/main/libx/libxcomposite/libxcomposite1_0.4.5-1build3_amd64.deb"
  "pool/main/libx/libxdamage/libxdamage1_1.1.6-1build1_amd64.deb"
  "pool/main/libx/libxfixes/libxfixes3_6.0.0-2build1_amd64.deb"
  "pool/main/libx/libxrandr/libxrandr2_1.5.2-2build1_amd64.deb"
  "pool/main/libx/libxrender/libxrender1_0.9.10-1.1build1_amd64.deb"
  "pool/main/libx/libxi/libxi6_1.8.1-1build1_amd64.deb"
  "pool/main/libx/libxext/libxext6_1.3.4-1build2_amd64.deb"
  "pool/main/libx/libxkbcommon/libxkbcommon0_1.6.0-1build1_amd64.deb"
  "pool/main/w/wayland/libwayland-server0_1.22.0-2.1build1_amd64.deb"
  "pool/main/a/alsa-lib/libasound2t64_1.2.11-1build2_amd64.deb"
  "pool/main/d/dbus/libdbus-1-3_1.14.10-4ubuntu4_amd64.deb"
  "pool/main/p/pango1.0/libpango-1.0-0_1.52.1+ds-1build1_amd64.deb"
  "pool/main/c/cairo/libcairo2_1.18.0-3build1_amd64.deb"
  "pool/main/c/cups/libcups2t64_2.4.7-1.2ubuntu7_amd64.deb"
  "pool/main/libd/libdrm/libdrm2_2.4.120-2build1_amd64.deb"
  "pool/main/m/mesa/libgbm1_24.0.5-1ubuntu1_amd64.deb"
  "pool/main/f/fonts-dejavu/fonts-dejavu-core_2.37-8_all.deb"
  "pool/main/f/fontconfig/libfontconfig1_2.15.0-1.1ubuntu2_amd64.deb"
)

mkdir -p "$ROOT"
for pkg in "${PACKAGES[@]}"; do
  file="$WORK/$(basename "$pkg")"
  echo "fetching $(basename "$pkg")"
  curl -sSfL -o "$file" "$UA/$pkg"
  dpkg-deb -x "$file" "$ROOT"
done

# Chromium aborts with "SkFontMgr_FontConfigInterface: Not implemented" when
# fontconfig has no configuration file, so write a minimal one.
mkdir -p "$ROOT/usr/share/fonts" /tmp/fc-cache
cat > "$ROOT/fonts.conf" <<EOF
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>$ROOT/usr/share/fonts</dir>
  <cachedir>/tmp/fc-cache</cachedir>
  <config></config>
</fontconfig>
EOF

echo "done. run: source scripts/browser-env.sh"
