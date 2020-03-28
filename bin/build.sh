#!/bin/bash
set -x

for I in $(ls apps)
do
  ./bin/build-image.sh $I
done
  

