const IMMUTABLE_GIT_COMMIT_SHA = /^[a-f0-9]{40}$/u;

export function isImmutableGitCommitSha(value: string) {
  return IMMUTABLE_GIT_COMMIT_SHA.test(value);
}
