#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# push-to-github.sh
# Commits all staged/unstaged changes and pushes to GitHub.
# Requires: GITHUB_PERSONAL_ACCESS_TOKEN env secret
# Usage:    bash scripts/push-to-github.sh [optional commit message]
# ─────────────────────────────────────────────────────────────

set -euo pipefail

REPO_URL="https://TITANICBHAI:${GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/TITANICBHAI/numinjector.git"
BRANCH="main"
COMMIT_MSG="${1:-"chore: sync from Replit [$(date '+%Y-%m-%d %H:%M')]"}"

echo "==> Clearing any stale git locks..."
rm -f .git/config.lock .git/index.lock .git/HEAD.lock

echo "==> Configuring git identity..."
git config user.email "replit-agent@users.noreply.github.com"
git config user.name  "Replit Agent"

echo "==> Setting remote..."
git remote remove origin 2>/dev/null || true
git remote add origin "$REPO_URL"

echo "==> Staging all changes..."
git add -A

echo "==> Committing..."
if git diff --cached --quiet; then
  echo "    Nothing new to commit — working tree clean."
else
  git commit -m "$COMMIT_MSG"
fi

echo "==> Pushing to GitHub ($BRANCH)..."
git push -u origin "$BRANCH" 2>&1 | sed "s/${GITHUB_PERSONAL_ACCESS_TOKEN}/****/g"

echo "==> Done. Visit: https://github.com/TITANICBHAI/numinjector"
