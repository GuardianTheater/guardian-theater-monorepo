#!/bin/bash

set -x 
TMPFILE=$(mktemp)
cat <<EOF > ${TMPFILE}
FROM node:12-alpine

WORKDIR /app
COPY . .
RUN yarn install

EOF

if [ "${CI}" ]; then
  echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin || exit 1
fi
docker build -t guardiantheater/gt-build-common:latest -f ${TMPFILE} .
docker push guardiantheater/gt-build-common:latest
rm -f ${TMPFILE}
  