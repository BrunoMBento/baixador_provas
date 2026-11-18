const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function command(cwd, executable, ...args) {
  const result = spawnSync(executable, args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  return result;
}

function git(cwd, ...args) {
  const result = command(cwd, "git", ...args);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "baixador-release-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const remote = path.join(directory, "remote.git");
  const repository = path.join(directory, "repo");
  fs.mkdirSync(remote);
  fs.mkdirSync(repository);
  git(remote, "init", "--bare");
  git(repository, "init", "-b", "main");
  git(repository, "config", "user.name", "Release Test");
  git(repository, "config", "user.email", "release-test@example.invalid");
  git(repository, "config", "commit.gpgsign", "false");
  git(repository, "remote", "add", "origin", remote);
  fs.mkdirSync(path.join(repository, ".github", "workflows"), { recursive: true });
  fs.writeFileSync(path.join(repository, ".github", "workflows", "release.yml"), "name: Release\n");
  fs.writeFileSync(path.join(repository, "package.json"), '{"version":"1.2.3"}');
  fs.writeFileSync(path.join(repository, "package-lock.json"), '{"version":"1.2.3","packages":{"":{"version":"1.2.3"}}}');
  fs.copyFileSync(path.join(__dirname, "../publicar-release.sh"), path.join(repository, "publicar-release.sh"));
  fs.copyFileSync(path.join(__dirname, "../subir-versao.sh"), path.join(repository, "subir-versao.sh"));
  git(repository, "add", ".");
  git(repository, "commit", "-m", "Prepare release");
  git(repository, "push", "-u", "origin", "main");
  return { repository, remote };
}

test("publishes the matching tag and rejects an existing remote tag", { skip: process.platform === "win32" }, (t) => {
  const { repository, remote } = setup(t);
  const result = command(repository, "bash", "publicar-release.sh");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git(repository, "--git-dir", remote, "rev-parse", "refs/tags/v1.2.3"), git(repository, "rev-parse", "HEAD"));
  assert.equal(git(repository, "status", "--porcelain"), "");
  const repeated = command(repository, "bash", "publicar-release.sh");
  assert.notEqual(repeated.status, 0);
  assert.match(repeated.stderr, /já existe em origin/);
});

test("rejects unpublished changes and mismatched versions", { skip: process.platform === "win32" }, (t) => {
  const { repository } = setup(t);
  fs.writeFileSync(path.join(repository, "package.json"), '{"version":"1.2.4"}');
  let result = command(repository, "bash", "publicar-release.sh");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /alterações não commitadas/);
  git(repository, "add", "package.json");
  git(repository, "commit", "-m", "Change version");
  result = command(repository, "bash", "publicar-release.sh");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /versões.*não correspondem/);
  fs.writeFileSync(path.join(repository, "package-lock.json"), '{"version":"1.2.4","packages":{"":{"version":"1.2.4"}}}');
  git(repository, "add", "package-lock.json");
  git(repository, "commit", "-m", "Update lockfile");
  result = command(repository, "bash", "publicar-release.sh");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /não corresponde à branch/);
});

test("reuses the local tag after a failed push", { skip: process.platform === "win32" }, (t) => {
  const { repository, remote } = setup(t);
  const hook = path.join(remote, "hooks", "pre-receive");
  fs.writeFileSync(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  let result = command(repository, "bash", "publicar-release.sh");
  assert.notEqual(result.status, 0);
  assert.equal(git(repository, "rev-parse", "refs/tags/v1.2.3"), git(repository, "rev-parse", "HEAD"));
  fs.unlinkSync(hook);
  result = command(repository, "bash", "publicar-release.sh");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git(repository, "--git-dir", remote, "rev-parse", "refs/tags/v1.2.3"), git(repository, "rev-parse", "HEAD"));
});

test("updates version, commits all changes and publishes the tag", { skip: process.platform === "win32" }, (t) => {
  const { repository, remote } = setup(t);
  fs.writeFileSync(path.join(repository, "alteracao.txt"), "conteúdo");
  const result = command(repository, "bash", "subir-versao.sh", "1.2.4");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(repository, "package.json"))).version, "1.2.4");
  assert.equal(JSON.parse(fs.readFileSync(path.join(repository, "package-lock.json"))).version, "1.2.4");
  assert.equal(git(repository, "show", "HEAD:alteracao.txt"), "conteúdo");
  assert.equal(git(repository, "--git-dir", remote, "rev-parse", "refs/heads/main"), git(repository, "rev-parse", "HEAD"));
  assert.equal(git(repository, "--git-dir", remote, "rev-parse", "refs/tags/v1.2.4"), git(repository, "rev-parse", "HEAD"));
});

test("rejects invalid versions and existing tags before modifying files", { skip: process.platform === "win32" }, (t) => {
  const { repository } = setup(t);
  for (const version of ["--help", "1.2.3"]) {
    if (version === "1.2.3") git(repository, "tag", "v1.2.3");
    const result = command(repository, "bash", "subir-versao.sh", version);
    assert.notEqual(result.status, 0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(repository, "package.json"))).version, "1.2.3");
    assert.equal(git(repository, "status", "--porcelain"), "");
  }
});
