#!/bin/bash
# Źródła wejść (src/refs.js). Użycie: tools/refs.sh [YYYY-MM-DD | YYYY-MM]  (domyślnie dziś UTC)
curl -s -H "x-scan-key: $(cat ~/.secrets/scan_key.txt)" "https://webskan.com/api/refs?day=${1:-$(date -u +%F)}" | python3 -I -c "
import json,sys
for r in sorted(json.load(sys.stdin), key=lambda r:(r['day'],-r['n'])): print(r['day'], r['n'], r['src'], r['path'], r['country'])"
