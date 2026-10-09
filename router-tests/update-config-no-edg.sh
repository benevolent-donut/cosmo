#!/bin/bash

set -e

# js composition

## using source code

echo "Generating config using 'wgc router compose'"
pnpx tsx ../cli/src/index.ts router compose -i ../demo/graph-no-edg.yaml -o ../router-tests/testenv/testdata/config.json
pnpx tsx ../cli/src/index.ts router compose -i ../router-tests/testdata/schemas/contexts/graph.yaml -o ../router-tests/testenv/testdata/configWithContexts.json
pnpx tsx ../cli/src/index.ts router compose -i ../router-tests/testdata/schemas/contexts/graph-no-post-setter.yaml -o ../router-tests/testenv/testdata/configWithContextsNoPostSetter.json

## using npm package

#npx --verbose --yes wgc@latest router compose -i ../demo/graph.yaml -o ../router-tests/testenv/testdata/config.json

# format test config

echo "Formatting config"
jq . ../router-tests/testenv/testdata/config.json > ../router-tests/testenv/testdata/config.json.tmp
mv ../router-tests/testenv/testdata/config.json.tmp ../router-tests/testenv/testdata/config.json

jq . ../router-tests/testenv/testdata/configWithContexts.json > ../router-tests/testenv/testdata/configWithContexts.json.tmp
mv ../router-tests/testenv/testdata/configWithContexts.json.tmp ../router-tests/testenv/testdata/configWithContexts.json

jq . ../router-tests/testenv/testdata/configWithContextsNoPostSetter.json > ../router-tests/testenv/testdata/configWithContextsNoPostSetter.json.tmp
mv ../router-tests/testenv/testdata/configWithContextsNoPostSetter.json.tmp ../router-tests/testenv/testdata/configWithContextsNoPostSetter.json
