#!/usr/bin/env bash

set -o errexit  # Exit script when a command exits with non-zero status.
set -o errtrace # Exit on error inside any functions or sub-shells.
set -o nounset  # Exit script on use of an undefined variable.
set -o pipefail # Return exit status of the last command in the pipe that exited with a non-zero exit code

: readonly "${GIT:=git}"

init() {
    mkdir -p editor
    # get origin url
    local origin="$(git config --get remote.origin.url)"
    local root="${origin%/*}"
    # get contexts from file
    while read context; do
       context=`echo "${context}" | cut -f 1 -d ":"`
    	 "${GIT}" clone --single-branch -b editor "${root}/${context}" "editor/${context}"
    done < curriculum-contexts.txt
}

if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
  export -f init
else
  init "${@}"
  exit $?
fi