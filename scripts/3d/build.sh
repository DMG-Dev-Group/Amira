#!/usr/bin/env bash
# Empacota o frasco 3D da home (scripts/3d/frasco-3d.src.js) com SÓ as
# partes usadas do three.js, minificado, em frontend/src/pages/vendor/.
# O site não tem build: o arquivo gerado é commitado. Rode de novo só
# quando mudar o frasco ou a versão do three.
#
#   bash scripts/3d/build.sh
set -euo pipefail
cd "$(dirname "$0")"
VERSAO_THREE="0.186.1"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp frasco-3d.src.js "$TMP/"
( cd "$TMP" && npm init -y >/dev/null && npm i --silent --no-audit --no-fund "three@$VERSAO_THREE" "esbuild@0.25" )
"$TMP/node_modules/.bin/esbuild" "$TMP/frasco-3d.src.js" \
  --bundle --format=esm --minify --target=es2020 --legal-comments=none \
  --outfile=../../frontend/src/pages/vendor/frasco-3d.js
ls -la ../../frontend/src/pages/vendor/frasco-3d.js
