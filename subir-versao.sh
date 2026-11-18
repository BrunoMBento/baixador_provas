#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

if [[ $# -ne 1 || ! "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "Uso: ./subir-versao.sh 1.0.2" >&2
  exit 1
fi

version=$1
tag="v$version"
if [[ "$(git symbolic-ref --quiet --short HEAD)" != "main" ]]; then
  echo "Mude para a branch main antes de publicar." >&2
  exit 1
fi
if [[ ! -x ./publicar-release.sh ]]; then
  echo "O script publicar-release.sh não foi encontrado ou não é executável." >&2
  exit 1
fi
if git show-ref --verify --quiet "refs/tags/$tag"; then
  echo "A tag local $tag já existe. Escolha uma nova versão." >&2
  exit 1
fi
if git ls-remote --exit-code --tags origin "refs/tags/$tag" > /dev/null; then
  echo "A tag $tag já existe em origin. Escolha uma nova versão." >&2
  exit 1
else
  result=$?
  if [[ $result -ne 2 ]]; then
    echo "Não foi possível verificar as tags em origin." >&2
    exit "$result"
  fi
fi

echo "Todas as alterações não ignoradas serão incluídas no commit da versão $version."
npm version "$version" --no-git-tag-version
git add .
git commit -m "Preparar versão $version"
git push origin main
./publicar-release.sh
