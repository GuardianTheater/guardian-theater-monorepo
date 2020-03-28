#!/bin/bash

set -x
IMAGE=${1:?}

docker build --pull --build-arg APP=${IMAGE} . -t guardiantheater/${IMAGE}:latest 

if [ ${CI} ] && [ "${TRAVIS_BRANCH}" == "master" ]; then
  docker tag guardiantheater/${IMAGE}:latest guardiantheater/${IMAGE}:${TRAVIS_BUILD_NUMBER}
  docker push guardiantheater/${IMAGE}:${TRAVIS_BUILD_NUMBER}
elif [ ! ${CI} ]; then
  docker push guardiantheater/${IMAGE}:latest
fi
