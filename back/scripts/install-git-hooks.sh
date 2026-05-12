#!/usr/bin/env bash
# Instala los git hooks de ALAS en .git/hooks/.
# Correr UNA vez después de clonar el repo.
#
# Uso (desde la raíz del repo):
#   bash back/scripts/install-git-hooks.sh

set -eu

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"
SRC_DIR="$REPO_ROOT/back/scripts/git-hooks"

if [ ! -d "$HOOKS_DIR" ]; then
  echo "❌ No se encontró $HOOKS_DIR — ¿estás dentro de un repo git?"
  exit 1
fi

if [ ! -d "$SRC_DIR" ]; then
  echo "❌ No se encontró $SRC_DIR."
  exit 1
fi

for hook in "$SRC_DIR"/*; do
  name=$(basename "$hook")
  cp "$hook" "$HOOKS_DIR/$name"
  chmod +x "$HOOKS_DIR/$name"
  echo "✅ instalado: $name"
done

echo ""
echo "Hooks instalados en .git/hooks/. Para deshabilitar uno: borralo de ahí."
