#!/bin/sh
set -eu
# A newly attached persistent disk can be owned by root.
mkdir -p "$STORYMOTION_DATA_DIR"
chown node:node "$STORYMOTION_DATA_DIR"
# Keep init and its children under the same UID. Hosting platforms can remove
# CAP_KILL, preventing a root init from forwarding signals to a node-owned child.
exec gosu node /usr/bin/tini -- "$@"
