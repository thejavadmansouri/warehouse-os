#!/bin/bash
# VpnWatch — one-time privileged setup.
# Creates a sudoers rule allowing ONLY the kill-switch helper to run
# without a password, restricted to the console user.
# Run as root (the app invokes this via the native admin-password prompt,
# or you can run it manually: sudo bash setup-killswitch.sh [helper-path]).
set -e

HELPER="${1:-$HOME/Library/VpnWatch/scripts/vpnwatch-killswitch.sh}"
CONSOLE_USER="$(stat -f %Su /dev/console)"

if [ ! -f "$HELPER" ]; then
  echo "VpnWatch: helper not found at $HELPER" >&2
  exit 1
fi
chmod 755 "$HELPER"

RULE_FILE=/etc/sudoers.d/vpnwatch-killswitch
RULE="$CONSOLE_USER ALL=(root) NOPASSWD: $HELPER"

echo "$RULE" > "$RULE_FILE"
chmod 440 "$RULE_FILE"

# Validate; roll back if invalid (never leave a broken sudoers behind)
if ! visudo -c -f "$RULE_FILE" >/dev/null 2>&1; then
  rm -f "$RULE_FILE"
  echo "VpnWatch: sudoers check failed, rule removed" >&2
  exit 1
fi

echo "VpnWatch: kill switch installed for $CONSOLE_USER"