# If the first argument is "image"...
# https://stackoverflow.com/questions/2214575/passing-arguments-to-make-run
#
# capture image
ifeq (image,$(firstword $(MAKECMDGOALS)))
  # use the rest as arguments for "run"
  RUN_ARGS := $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS))
  # ...and turn them into do-nothing targets
  $(eval $(RUN_ARGS):;@:)
endif

all:
	$(MAKE) common
	./bin/build.sh

common:
	./bin/build-common.sh

image:
	./bin/build-image.sh $(RUN_ARGS)

deploy:
	./bin/deploy.sh

travis:
	./bin/gen-travis-ci.sh
