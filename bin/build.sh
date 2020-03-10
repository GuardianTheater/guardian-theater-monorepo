#!/bin/bash

TMPFILE=$(mktemp)
cat <<EOF > ${TMPFILE}
FROM node:12-alpine

WORKDIR /app
COPY . .
RUN yarn install

EOF
cat ${TMPFILE}

docker login
docker build -t gt-build-common -f ${TMPFILE} .
rm -f ${TMPFILE}

for I in $(ls apps)
do
  docker build --build-arg APP=$I . -t guardiantheater/$I:latest 
  docker push guardiantheater/$I:latest
done
