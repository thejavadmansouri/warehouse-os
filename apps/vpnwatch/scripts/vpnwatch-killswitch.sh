#!/bin/bash
# VpnWatch kill-switch helper — turns Wi-Fi on/off.
# usage: vpnwatch-killswitch.sh [on|off]
# This script is the ONLY command the sudoers rule allows, for safety.
ACTION="${1:-off}"
case "$ACTION" in
  on|off) ;;
  *) echo "usage: $0 on|off"; exit 1 ;;
esac

# Find the Wi-Fi interface (AirPort on older macOS, Wi-Fi on newer)
DEV="$(networksetup -listallhardwareports 2>/dev/null | awk '/AirPort|Wi-Fi/{getline; print $2; exit}')"
if [ -z "$DEV" ]; then
  DEV="$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')"
fi
if [ -z "$DEV" ]; then
  echo "VpnWatch: no network interface found" >&2
  exit 1
fi

networksetup -setairportpower "$DEV" "$ACTION"
echo "VpnWatch: Wi-Fi $ACTION ($DEV)"
