#!/bin/bash


if [ ${CI} ] && [ "${TRAVIS_BRANCH}" == "master" ]; then
  echo ${KUBE_CONFIG} | base64 -d > kubeconfig
  echo ${DEPLOY_CONFIG} | base64 -d > deploy-config.yaml
  export KUBECONFIG=kubeconfig
  helm_version=3.1.2
  wget -q https://get.helm.sh/helm-v${helm_version}-linux-amd64.tar.gz -O /tmp/helm.tgz && \
    cd /tmp; tar zxvf helm.tgz; cd -;
  /tmp/linux-amd64/helm upgrade -f deploy-config.yaml --set build=${TRAVIS_BUILD_NUMBER} guardian-theater guardian-theater -n default
fi
