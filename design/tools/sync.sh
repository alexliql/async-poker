#!/bin/bash
# Regenerate every surface from Main (only title, $preview and LAYOUT_ID differ), check, render, screenshot.
cd "$(dirname "$0")/.." ; P=screens; export NODE_PATH=$(npm root -g)
mk(){ sed -e "s|<title>Poker table</title>|<title>$2</title>|" -e "s|\"\$preview\":{\"width\":390,\"height\":844}|\"\$preview\":{\"width\":$3,\"height\":$4}|" -e "s|^const LAYOUT_ID = 'phone';|const LAYOUT_ID = '$5';|" $P/Main.dc.html > $P/$1.dc.html; n=$(diff $P/Main.dc.html $P/$1.dc.html | grep -c '^>'); [ "$n" -le 3 ] || echo "PARITY FAIL $1 ($n lines)"; }
mk Recap "Table opened from the nudge link" 390 844 phone; sed -i "s|^const ENTRY = 'table';|const ENTRY = 'nudge';|" $P/Recap.dc.html
mk FoldCover "Table on a foldable cover screen" 344 972 cover
mk FoldOpen "Table on an unfolded foldable" 720 840 foldopen
mk Tablet "Table on tablet" 1180 820 tablet
mk Desktop "Table on desktop" 1440 900 desktop
declare -A S=([Recap]="390 844" [Main]="390 844" [FoldCover]="344 972" [FoldOpen]="720 840" [Tablet]="1180 820" [Desktop]="1440 900")
for f in Main Recap FoldCover FoldOpen Tablet Desktop; do node tools/check.js $P/$f.dc.html --table || exit 1
  node tools/render.js $P/$f.dc.html shots/$f.html "${PROPS:-{\}}" "if(c.state.recapOpen)c.closeRecap();run(${T:-50});${EXTRA}" && node tools/shot.js shots/$f${SUF}.png ${S[$f]} shots/$f.html; done
