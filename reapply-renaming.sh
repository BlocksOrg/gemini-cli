#!/bin/bash

echo "Re-applying package renaming from @google to @blocksuser..."

# Update package.json files
sed -i '' 's/"@google\/gemini-cli"/"@blocksuser\/gemini-cli"/g' package.json
sed -i '' 's/"@google\/gemini-cli"/"@blocksuser\/gemini-cli"/g' packages/cli/package.json
sed -i '' 's/"@google\/gemini-cli-core"/"@blocksuser\/gemini-cli-core"/g' packages/core/package.json
sed -i '' 's/"@google\/gemini-cli-core"/"@blocksuser\/gemini-cli-core"/g' packages/cli/package.json

# Remove private flag from root package.json
sed -i '' '/"private": "true",/d' package.json

# Update all source files
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.md" -o -name "*.yml" -o -name "*.json" \) \
  -not -path "./node_modules/*" \
  -not -path "./.git/*" \
  -not -path "./bundle/*" \
  -not -path "./dist/*" \
  -not -path "./package-lock.json" \
  -not -path "./packages/*/package-lock.json" \
  -exec sed -i '' 's/@google\/gemini-cli-core/@blocksuser\/gemini-cli-core/g' {} \;

find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.md" -o -name "*.yml" -o -name "*.json" \) \
  -not -path "./node_modules/*" \
  -not -path "./.git/*" \
  -not -path "./bundle/*" \
  -not -path "./dist/*" \
  -not -path "./package-lock.json" \
  -not -path "./packages/*/package-lock.json" \
  -exec sed -i '' 's/@google\/gemini-cli/@blocksuser\/gemini-cli/g' {} \;

# Update the prepare-package.js script to not copy .npmrc
sed -i '' "/'.npmrc': '.npmrc',/d" scripts/prepare-package.js

echo "Done re-applying all changes!"