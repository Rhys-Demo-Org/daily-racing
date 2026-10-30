#!/usr/bin/env bash
# GIT_ASKPASS for publish.sh's push: x-access-token as the user, the PAT in GITHUB_TOKEN_FILE as the
# password, so the token is never in argv, git config or the environment of git itself.
case ${1:-} in Username*) echo x-access-token ;; *) tr -d '[:space:]' <"$GITHUB_TOKEN_FILE"; echo ;; esac
