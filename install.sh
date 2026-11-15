#!/usr/bin/env bash
# Doc-DL installer / updater / uninstaller (no sudo).
#   curl -fsSL https://raw.githubusercontent.com/saintgermainlabs/docdownloader/main/install.sh | bash
#   curl -fsSL .../install.sh | bash -s -- --uninstall
# Env overrides:
#   DOC_DL_REPO   git URL or local path   (default: https://github.com/saintgermainlabs/docdownloader.git)
#   DOC_DL_REF    branch/tag/commit       (default: main)
#   DOC_DL_HOME   install dir             (default: ${XDG_DATA_HOME:-$HOME/.local/share}/doc-dl)
#   DOC_DL_BIN    launcher dir            (default: $HOME/.local/bin)
#   DOC_DL_SKIP_BROWSERS=1  skip `npx playwright install chromium`
set -euo pipefail

DOC_DL_REPO="${DOC_DL_REPO:-https://github.com/saintgermainlabs/docdownloader.git}"
DOC_DL_REF="${DOC_DL_REF:-main}"
DOC_DL_HOME="${DOC_DL_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/doc-dl}"
DOC_DL_BIN="${DOC_DL_BIN:-$HOME/.local/bin}"
MARKER="# doc-dl-launcher"

say()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarn:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

list_bins() {
  node -e 'const p=require(process.argv[1]);const b=p.bin||{};for(const[k,v]of Object.entries(typeof b==="string"?{[p.name]:b}:b))console.log(k+"\t"+v)' "$DOC_DL_HOME/package.json"
}

uninstall() {
  say "Removing launchers from $DOC_DL_BIN"
  for f in "$DOC_DL_BIN"/*; do
    [ -f "$f" ] && grep -q "^$MARKER" "$f" 2>/dev/null && { rm -f "$f"; echo "  removed $(basename "$f")"; }
  done
  if [ -d "$DOC_DL_HOME" ]; then say "Removing $DOC_DL_HOME"; rm -rf "$DOC_DL_HOME"; fi
  say "Doc-DL uninstalled."
}

case "${1:-}" in
  --uninstall) uninstall; exit 0 ;;
  -h|--help) sed -n '2,11p' "$0" 2>/dev/null || true; exit 0 ;;
  "") ;;
  *) die "unknown option: $1" ;;
esac

# --- dependency checks (python is NOT needed; only for optional sphinx docs) ---
for c in git node npm; do command -v "$c" >/dev/null 2>&1 || die "'$c' is required but not installed"; done
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || die "node >= 18 required (found $(node -v))"

# --- clone or update ---
if [ -d "$DOC_DL_HOME/.git" ]; then
  say "Updating $DOC_DL_HOME ($DOC_DL_REF)"
  git -C "$DOC_DL_HOME" remote set-url origin "$DOC_DL_REPO"
  git -C "$DOC_DL_HOME" fetch --tags --quiet origin "$DOC_DL_REF"
  git -C "$DOC_DL_HOME" checkout --quiet --detach FETCH_HEAD
elif [ -e "$DOC_DL_HOME" ] && [ -n "$(command ls -A "$DOC_DL_HOME" 2>/dev/null)" ]; then
  die "$DOC_DL_HOME exists and is not a git checkout; move it away or set DOC_DL_HOME"
else
  say "Cloning $DOC_DL_REPO -> $DOC_DL_HOME"
  mkdir -p "$(dirname "$DOC_DL_HOME")"
  git clone --quiet "$DOC_DL_REPO" "$DOC_DL_HOME"
  git -C "$DOC_DL_HOME" fetch --quiet origin "$DOC_DL_REF"
  git -C "$DOC_DL_HOME" checkout --quiet --detach FETCH_HEAD
fi

# --- build ---
cd "$DOC_DL_HOME"
say "npm ci"; npm ci --no-audit --no-fund --loglevel=error
say "npm run build"; npm run --silent build
if [ "${DOC_DL_SKIP_BROWSERS:-0}" != "1" ]; then
  say "Installing Playwright chromium (set DOC_DL_SKIP_BROWSERS=1 to skip)"
  npx --no-install playwright install chromium || warn "playwright browser install failed; run 'npx playwright install chromium' in $DOC_DL_HOME"
fi

# --- launchers ---
mkdir -p "$DOC_DL_BIN"
say "Installing launchers into $DOC_DL_BIN"
while IFS=$'\t' read -r name target; do
  [ -n "$name" ] || continue
  dest="$DOC_DL_BIN/$name"
  if [ -e "$dest" ] && ! grep -q "^$MARKER" "$dest" 2>/dev/null; then
    warn "skipping $name: $dest exists and was not created by doc-dl"; continue
  fi
  target="${target#./}"
  case "$target" in
    *.js|*.mjs|*.cjs) runner="exec node \"$DOC_DL_HOME/$target\" \"\$@\"" ;;
    *) runner="exec \"$DOC_DL_HOME/$target\" \"\$@\"" ;;
  esac
  printf '#!/usr/bin/env bash\n%s\n%s\n' "$MARKER" "$runner" > "$dest"
  chmod +x "$dest"
  echo "  $name -> $target"
done < <(list_bins)

case ":$PATH:" in
  *":$DOC_DL_BIN:"*) ;;
  *) warn "$DOC_DL_BIN is not on PATH. Add: export PATH=\"$DOC_DL_BIN:\$PATH\"" ;;
esac
say "Doc-DL installed ($(git -C "$DOC_DL_HOME" rev-parse --short HEAD)). Try: docs_dl --help"
