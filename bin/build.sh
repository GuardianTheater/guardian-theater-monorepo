#!/bin/bash

set -x 
TMPFILE=$(mktemp)
cat <<EOF > ${TMPFILE}
FROM node:12-alpine

WORKDIR /app
COPY . .
RUN yarn install

EOF
cat ${TMPFILE}
if [ "${CI}" ]; then
  echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin || exit 1
else
  docker login || exit 1
fi
docker build -t gt-build-common -f ${TMPFILE} .
rm -f ${TMPFILE}

for I in $(ls apps)
do
  docker build --build-arg APP=$I . -t guardiantheater/$I:latest 

  if [ ${CI} ] && [ "${TRAVIS_BRANCH}" == "master" ]; then
    docker tag guardiantheater/$I:latest guardiantheater/$I:${TRAVIS_BUILD_NUMBER}
    docker push guardiantheater/$I:${TRAVIS_BUILD_NUMBER}
  elif [ ! ${CI} ]; then
    docker push guardiantheater/$I:latest
  fi
done
  
if [ ${CI} ] && [ "${TRAVIS_BRANCH}" == "master" ]; then
  echo ${KUBE_CONFIG} | base64 -d > kubeconfig
  echo ${DEPLOY_CONFIG} | base64 -d > deploy-config.yaml
  export KUBECONFIG=kubeconfig
  helm_version=3.1.2
  wget -q https://get.helm.sh/helm-v${helm_version}-linux-amd64.tar.gz -O /tmp/helm.tgz && \
    cd /tmp; tar zxvf helm.tgz; cd -;
  /tmp/linux-amd64/helm upgrade -f deploy-config.yaml --set build=${TRAVIS_BUILD_NUMBER} guardian-theater guardian-theater -n default
fi
