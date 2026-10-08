#!/bin/bash
# Build new screens from src/ by inlining the shared base CSS, then check and screenshot.
cd "$(dirname "$0")/.."; export NODE_PATH=$(npm root -g)
for f in "$@"; do python3 -c "
import sys; s=open('src/$f.html').read(); b=open('src/base.css').read().rstrip('\n')
open('screens/$f.dc.html','w').write(s.replace('/*BASE*/',b))"
node tools/check.js screens/$f.dc.html || exit 1
w=$(grep -o '"\$preview":{"width":[0-9]*' screens/$f.dc.html | grep -o '[0-9]*$'); h=$(grep -o '"\$preview":{"width":[0-9]*,"height":[0-9]*' screens/$f.dc.html | grep -o '[0-9]*$')
node tools/render.js screens/$f.dc.html shots/t.html '{}' "run(50);${EXTRA}" && node tools/shot.js shots/$f${SUF}.png $w $h shots/t.html; done
