#!/bin/bash

cd $(dirname $0)

npm install

rm -Rf build
mkdir -p build
set -e

tsc



node_modules/.bin/esbuild dist/main.js --bundle --outfile=build/tst --platform=node

cd build

echo "#!/usr/bin/env node" > tst.cjs
../node_modules/.bin/minify --js < tst >> tst.cjs
rm tst
chmod +x tst.cjs
ln -s tst.cjs tst
