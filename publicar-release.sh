#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

if [[ $# -ne 0 ]]; then
  echo "Uso: ./publicar-release.sh" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  echo "Há alterações não commitadas. Confirme e envie todas as alterações antes de publicar." >&2
  exit 1
fi

branch=$(git symbolic-ref --quiet --short HEAD) || {
  echo "Escolha uma branch antes de publicar." >&2
  exit 1
}

version=$(node -e '
  const pkg = require("./package.json");
  const lock = require("./package-lock.json");
  if (typeof pkg.version !== "string" || !pkg.version ||
      lock.version !== pkg.version || lock.packages?.[""]?.version !== pkg.version) {
    console.error("As versões do package.json e do package-lock.json não correspondem.");
    process.exit(1);
  }
  process.stdout.write(pkg.version);
')
tag="v$version"
git check-ref-format "refs/tags/$tag"

if ! git cat-file -e HEAD:.github/workflows/release.yml; then
  echo "O workflow de release não está presente no commit atual." >&2
  exit 1
fi

if remote_branch=$(git ls-remote --exit-code --heads origin "refs/heads/$branch"); then
  remote_commit=${remote_branch%%$'\t'*}
else
  echo "Não foi possível consultar a branch $branch em origin. Envie-a antes de publicar." >&2
  exit 1
fi

if [[ "$remote_commit" != "$(git rev-parse HEAD)" ]]; then
  echo "O commit atual não corresponde à branch origin/$branch. Sincronize-a antes de publicar." >&2
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

if git show-ref --verify --quiet "refs/tags/$tag"; then
  if [[ "$(git rev-parse "refs/tags/$tag^{commit}")" != "$(git rev-parse HEAD)" ]]; then
    echo "A tag local $tag aponta para outro commit. Escolha uma nova versão." >&2
    exit 1
  fi
else
  git tag "$tag"
fi

git push origin "refs/tags/$tag"
echo "Tag $tag enviada. Acompanhe a publicação na aba Actions do GitHub."
