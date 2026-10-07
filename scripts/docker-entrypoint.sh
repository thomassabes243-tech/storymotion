#!/bin/sh
set -eu
# A newly attached persistent disk can be owned by root.
mkdir -p "$STORYMOTION_DATA_DIR"
chown node:node "$STORYMOTION_DATA_DIR"
exec gosu node "$@"
