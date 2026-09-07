#!/usr/bin/env bash
#
# Capture App Store screenshots at the 6.9" iPhone class (1320 x 2868).
#
# Apple needs exactly one set at this size — it auto-scales to every smaller
# iPhone. Verified on this machine: the iPhone 17 Pro Max simulator captures at
# precisely 1320 x 2868.
#
# Run this INTERACTIVELY, not from an agent session: `expo start --ios` needs a
# real TTY to install Expo Go and open the Simulator, and it will not bind its
# port when launched detached.
#
#   ./scripts/screenshots.sh
#
# Then tap through the tabs in the simulator when prompted.

set -euo pipefail

DEVICE="${DEVICE:-iPhone 17 Pro Max}"
OUT="${OUT:-./screenshots}"
mkdir -p "$OUT"

echo "==> Booting $DEVICE"
xcrun simctl boot "$DEVICE" 2>/dev/null || echo "    (already booted)"
open -a Simulator

echo "==> Verifying capture resolution"
xcrun simctl io booted screenshot "$OUT/.probe.png" >/dev/null 2>&1
DIMS=$(sips -g pixelWidth -g pixelHeight "$OUT/.probe.png" | awk '/pixel/ {printf "%s", $2 "x"}' | sed 's/x$//')
rm -f "$OUT/.probe.png"
if [ "$DIMS" != "1320x2868" ]; then
  echo "    !! Got ${DIMS}, expected 1320x2868."
  echo "    !! Use a 6.9\" class device: iPhone 16 Pro Max, 17 Pro Max, or newer."
  exit 1
fi
echo "    OK: ${DIMS}"

cat <<'EOF'

==> Now start the app, in a SEPARATE terminal:

      npx expo start --ios

    Wait for it to install Expo Go and open the app, then come back here.

EOF
read -r -p "Press return once the app is showing on the simulator... " _

shoot () {
  local name="$1" prompt="$2"
  read -r -p "Navigate to: ${prompt}  — then press return: " _
  xcrun simctl io booted screenshot "$OUT/${name}.png" >/dev/null 2>&1
  echo "    saved $OUT/${name}.png"
}

# Tab names reflect the CURRENT UI. If the simplification pass renames them
# (Home / Add Portfolio / Learn More), update these prompts to match.
shoot "01-overview"   "the Overview tab"
shoot "02-holdings"   "the Holdings tab"
shoot "03-detail"     "a holding's detail screen (tap any row in Holdings)"
shoot "04-quality"    "the Data Quality tab"
shoot "05-info"       "the Methodology tab"

echo
echo "==> Done. Verifying every capture is 1320x2868:"
for f in "$OUT"/*.png; do
  d=$(sips -g pixelWidth -g pixelHeight "$f" | awk '/pixel/ {printf "%s", $2 "x"}' | sed 's/x$//')
  printf "    %-28s %s%s\n" "$(basename "$f")" "$d" \
    "$([ "$d" = "1320x2868" ] && echo "" || echo "   <-- WRONG SIZE")"
done

echo
echo "Upload to App Store Connect -> your app -> iOS App -> 1.0 Prepare for Submission"
echo "-> App Previews and Screenshots -> iPhone 6.9\" Display."
