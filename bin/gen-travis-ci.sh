#!/bin/bash

set -x 

echo "---"                            > .travis.yml
echo "services:"                     >> .travis.yml
echo "  - docker"                    >> .travis.yml
echo ""                              >> .travis.yml
echo "stages:"                       >> .travis.yml
echo "  - common"                    >> .travis.yml
echo "  - images"                    >> .travis.yml
echo "  - deploy"                    >> .travis.yml
echo ""                              >> .travis.yml
echo "jobs:"                         >> .travis.yml
echo "  include:"                    >> .travis.yml
echo "    - stage: common"           >> .travis.yml
echo "      name: Build common"      >> .travis.yml
echo "      script: make common"     >> .travis.yml
for I in $(ls apps)
do

  echo "    - stage: images"         >> .travis.yml
  echo "      name: Build $I"        >> .travis.yml
  echo "      script: make image $I" >> .travis.yml
  echo "      isolated: true"        >> .travis.yml
done
echo "    - stage: deploy"           >> .travis.yml
echo "      name: Deploy"            >> .travis.yml
echo "      script: make deploy"     >> .travis.yml
