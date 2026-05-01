#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="$SCRIPT_DIR/manifest.json"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
ZIP_NAME="simple-timesheets.zip"

# ─── Read current version ─────────────────────────────────────────────────────

CURRENT=$(grep '"version"' "$MANIFEST" | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

echo ""
echo "Simple Timesheets — Release Script"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Current version: $CURRENT"
echo ""
echo "What type of release is this?"
echo "  1) Major — $((MAJOR+1)).0.0  (breaking changes or full redesign)"
echo "  2) Minor — $MAJOR.$((MINOR+1)).0  (new features, backwards compatible)"
echo "  3) Patch — $MAJOR.$MINOR.$((PATCH+1))  (bug fixes only)"
echo ""
read -p "Enter 1, 2, or 3: " CHOICE

case $CHOICE in
  1) NEW_VERSION="$((MAJOR+1)).0.0" ;;
  2) NEW_VERSION="$MAJOR.$((MINOR+1)).0" ;;
  3) NEW_VERSION="$MAJOR.$MINOR.$((PATCH+1))" ;;
  *) echo "Invalid choice. Exiting."; exit 1 ;;
esac

echo ""
echo "Bumping: $CURRENT → $NEW_VERSION"

# ─── Update manifest.json ─────────────────────────────────────────────────────

sed -i '' "s/\"version\": \"$CURRENT\"/\"version\": \"$NEW_VERSION\"/" "$MANIFEST"
echo "✓ manifest.json updated to $NEW_VERSION"

# ─── Create zip ───────────────────────────────────────────────────────────────

cd "$PARENT_DIR"
rm -f "$ZIP_NAME"

zip -r "$ZIP_NAME" simple-timesheets \
  --exclude "*.git*" \
  --exclude "*.DS_Store" \
  --exclude "*generate.html" \
  --exclude "*google*.html" \
  --exclude "simple-timesheets/manifest.example.json" \
  --exclude "simple-timesheets/.gitignore" \
  --exclude "simple-timesheets/README.md" \
  --exclude "simple-timesheets/release.sh" \
  --exclude "simple-timesheets/terms.html" \
  --exclude "simple-timesheets/privacy-policy.html"

echo "✓ $ZIP_NAME created"

# ─── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Release $NEW_VERSION is ready."
echo ""
echo "Next steps:"
echo "  1. Upload $PARENT_DIR/$ZIP_NAME to the Chrome Web Store"
echo "  2. git add, commit, and push your changes"
echo "  3. Submit for review"
echo ""
