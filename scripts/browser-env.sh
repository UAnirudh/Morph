#!/usr/bin/env bash
# Headless Chromium needs a handful of shared libraries and at least one font.
# Minimal container images often ship neither, and without root we cannot use
# `playwright install-deps`. scripts/install-browser-deps.sh downloads the .deb
# files into ~/.local/lib/morph-browser; this script points the dynamic loader
# and fontconfig at that directory.
#
#   source scripts/browser-env.sh
#   npx playwright test

set -a
BROWSER_LIB_ROOT="${BROWSER_LIB_ROOT:-$HOME/.local/lib/morph-browser}"
if [ -d "$BROWSER_LIB_ROOT/usr/lib/x86_64-linux-gnu" ]; then
  export LD_LIBRARY_PATH="$BROWSER_LIB_ROOT/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi
if [ -f "$BROWSER_LIB_ROOT/fonts.conf" ]; then
  export FONTCONFIG_FILE="$BROWSER_LIB_ROOT/fonts.conf"
  export FONTCONFIG_PATH="$BROWSER_LIB_ROOT/etc/fonts"
fi
set +a
