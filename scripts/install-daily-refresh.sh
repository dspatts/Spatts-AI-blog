#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_DIR="${HOME}/.config/systemd/user"
mkdir -p "$UNIT_DIR"
cp "$ROOT/systemd/spatts-ai-blog-refresh.service" "$UNIT_DIR/"
cp "$ROOT/systemd/spatts-ai-blog-refresh.timer" "$UNIT_DIR/"
cp "$ROOT/systemd/spatts-ai-blog.service" "$UNIT_DIR/"
systemctl --user daemon-reload
systemctl --user enable --now spatts-ai-blog-refresh.timer
systemctl --user enable --now spatts-ai-blog.service
systemctl --user list-timers --all | grep spatts || true
LAN_IP="$(ip -4 -o addr show scope global | awk '$2 !~ /nordlynx|tun|wg/ {print $4}' | cut -d/ -f1 | head -n1)"
echo "Installed. This PC: http://127.0.0.1:4173"
if [ -n "$LAN_IP" ]; then
  echo "Home network: http://${LAN_IP}:4173"
fi
echo "Daily refresh: 07:00 local time (catches up if the machine was asleep)."
