# CALM hackathon zeta: one command per job, all validated end to end.
# Run `make check` for the full green path. Nothing here pushes or publishes.
ROOT := $(CURDIR)
TOOLS := $(ROOT)/poc/tools
EXT := $(ROOT)/poc/hub-extensions/calm-views
HUB_URL ?= http://localhost:8080
LANDINGZONE_SOURCE ?= $(ROOT)/.local/multi-cloud-runway
LANDINGZONE_COMMIT := 2fe49b9829df7a8749915ba1200896390d95139b
LANDINGZONE_MARKER := $(ROOT)/.local/multi-cloud-runway.zeta-source

.PHONY: tools tools-build tools-test extension extension-test seed-test render validate gallery query clean check help
.PHONY: landingzone-source import-landingzone landingzone-views
.PHONY: keys hub-build hub-up hub-start hub-stop hub-down hub-reset hub-logs hub-status seed

help:
	@echo "tools            install, build and test poc/tools"
	@echo "landingzone-source fetch the pinned MIT source for importer tests/rebuild"
	@echo "import-landingzone regenerate the single multi-cloud model file"
	@echo "landingzone-views regenerate the five multi-cloud views"
	@echo "extension        install and build the Hub lens extension"
	@echo "extension-test   run the extension suite (needs tools built)"
	@echo "seed-test        test model seeding against a local HTTP stub"
	@echo "validate         check every sidecar view"
	@echo "render           regenerate local renders (deterministic date)"
	@echo "gallery          rebuild poc/renders/gallery.html"
	@echo "query            describe-view kyc-audit-view (smoke)"
	@echo "extension-start  run the lens service on :8095"
	@echo "check            tools + extension suites, all green"
	@echo "clean            remove local build output (keeps generated renders)"
	@echo "keys             generate dev-only Hub identity keys (.local, git-ignored)"
	@echo "hub-build        build the lens image from this repo"
	@echo "hub-up           keys + build + (re)create mongo/lens/Hub, wait for Hub"
	@echo "hub-start/stop   start/stop the demo Hub container only"
	@echo "hub-down         stop and remove demo containers (data volume stays)"
	@echo "hub-reset        remove demo containers and MongoDB data volume"
	@echo "hub-logs         last Hub container logs"
	@echo "hub-status       running containers, Hub health, lens wiring"
	@echo "seed             load the 3 demo models into the Hub (idempotent)"

landingzone-source:
	@mkdir -p .local
	@if [ -d "$(LANDINGZONE_SOURCE)/.git" ]; then \
	  test -f "$(LANDINGZONE_MARKER)" || { echo "Refusing unmanaged source directory: $(LANDINGZONE_SOURCE)" >&2; exit 1; }; \
	  test -z "$$(git -C "$(LANDINGZONE_SOURCE)" status --porcelain)" || { echo "Source checkout is dirty: $(LANDINGZONE_SOURCE)" >&2; exit 1; }; \
	  if [ "$$(git -C "$(LANDINGZONE_SOURCE)" rev-parse HEAD)" != "$(LANDINGZONE_COMMIT)" ]; then git -C "$(LANDINGZONE_SOURCE)" fetch --depth=1 origin "$(LANDINGZONE_COMMIT)" && git -C "$(LANDINGZONE_SOURCE)" checkout --detach "$(LANDINGZONE_COMMIT)"; fi; \
	else \
	  test ! -e "$(LANDINGZONE_SOURCE)" || { echo "Path exists and is not a Git checkout: $(LANDINGZONE_SOURCE)" >&2; exit 1; }; \
	  git clone --filter=blob:none --no-checkout https://github.com/cloudon-one/multi-cloud-runway.git "$(LANDINGZONE_SOURCE)" && \
	  git -C "$(LANDINGZONE_SOURCE)" fetch --depth=1 origin "$(LANDINGZONE_COMMIT)" && \
	  git -C "$(LANDINGZONE_SOURCE)" checkout --detach "$(LANDINGZONE_COMMIT)" && \
	  touch "$(LANDINGZONE_MARKER)"; \
	fi

tools: tools-build landingzone-source
	cd $(TOOLS) && npm test

tools-build:
	cd $(TOOLS) && npm ci && npm run build

tools-test: tools-build landingzone-source
	cd $(TOOLS) && npm test

import-landingzone: tools-build landingzone-source
	cd $(TOOLS) && SOURCE_DATE_EPOCH=1794957778 node dist/landingzone2calm.js --source "$(LANDINGZONE_SOURCE)" --out ../model

landingzone-views: tools-build
	cd $(TOOLS) && node dist/generate-landingzone-views.js

extension: tools-build
	cd $(EXT) && npm ci && npm run build

extension-test: extension
	cd $(EXT) && npm test

seed-test:
	node --test scripts/seed-hub.test.mjs

# SOURCE_DATE_EPOCH pins the render date so local renders match on any day.
render: tools-build
	rm -rf $(ROOT)/poc/renders
	cd $(TOOLS) && SOURCE_DATE_EPOCH=1794873600 node dist/render.js ../views/kyc-onboarding/kyc-platform.calm-view.json --out ../renders/kyc-onboarding
	cd $(TOOLS) && SOURCE_DATE_EPOCH=1794873600 node dist/render.js ../views/kyc-onboarding/kyc-integration.calm-view.json --out ../renders/kyc-onboarding
	cd $(TOOLS) && SOURCE_DATE_EPOCH=1794873600 node dist/render.js ../views/kyc-onboarding/kyc-audit.calm-view.json --out ../renders/kyc-onboarding
	cd $(TOOLS) && SOURCE_DATE_EPOCH=1794873600 node dist/render.js ../views/kyc-onboarding/kyc-screening-neighborhood.calm-view.json --out ../renders/kyc-onboarding
	cd $(TOOLS) && SOURCE_DATE_EPOCH=1794873600 node dist/render.js ../views/kyc-onboarding/kyc-platform-inside.calm-view.json --out ../renders/kyc-onboarding
	cd $(TOOLS) && SOURCE_DATE_EPOCH=1794873600 node dist/render.js ../views/kyc-onboarding/kyc-audit-logging.calm-view.json --out ../renders/kyc-onboarding
	cd $(TOOLS) && SOURCE_DATE_EPOCH=1794873600 node dist/render.js ../views/ech-0122/ech-business.calm-view.json --out ../renders/ech-0122
	cd $(TOOLS) && SOURCE_DATE_EPOCH=1794873600 node dist/render.js ../views/ech-0122/ech-application.calm-view.json --out ../renders/ech-0122
	cd $(TOOLS) && SOURCE_DATE_EPOCH=1794873600 node dist/render.js ../views/ech-0122/ech-capabilities.calm-view.json --out ../renders/ech-0122
	cd $(TOOLS) && SOURCE_DATE_EPOCH=1794873600 node dist/render.js ../views/multicloud-landing-zone/multicloud-global.calm-view.json --out ../renders/multicloud-landing-zone
	cd $(TOOLS) && SOURCE_DATE_EPOCH=1794873600 node dist/render.js ../views/multicloud-landing-zone/multicloud-cloud.calm-view.json --out ../renders/multicloud-landing-zone
	cd $(TOOLS) && SOURCE_DATE_EPOCH=1794873600 node dist/render.js ../views/multicloud-landing-zone/multicloud-region.calm-view.json --out ../renders/multicloud-landing-zone
	cd $(TOOLS) && SOURCE_DATE_EPOCH=1794873600 node dist/render.js ../views/multicloud-landing-zone/multicloud-environment.calm-view.json --set env=prod --out ../renders/multicloud-landing-zone
	cd $(TOOLS) && SOURCE_DATE_EPOCH=1794873600 node dist/render.js ../views/multicloud-landing-zone/multicloud-layer.calm-view.json --set layer=network --out ../renders/multicloud-landing-zone

validate: tools-build
	cd $(TOOLS) && node dist/validate.js

gallery: render
	cd $(TOOLS) && node dist/gallery.js --out ../renders

query: tools-build
	cd $(TOOLS) && node dist/query.js describe-view kyc-audit-view

extension-start: extension
	@if [ -f "$(ROOT)/.local/hub-models.env" ]; then \
	  set -a; . "$(ROOT)/.local/hub-models.env"; set +a; \
	fi; \
	CALM_VIEWS_DIR="$(ROOT)/poc/views" PORT=8095 npm start --prefix "$(EXT)"

check: tools extension-test seed-test
	@echo "ALL GREEN"

clean:
	rm -rf $(TOOLS)/dist $(EXT)/dist

keys:
	mkdir -p .local/keys
	touch .local/hub-models.env
	test -f .local/keys/hub-key.pem || openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out .local/keys/hub-key.pem
	test -f .local/keys/hub-key.pub || openssl pkey -in .local/keys/hub-key.pem -pubout -out .local/keys/hub-key.pub
	chmod 644 .local/keys/hub-key.pem

hub-build:
	bash scripts/build-hub-image.sh

hub-up: keys hub-build
	docker compose up -d mongodb calmhub
	@echo "waiting for Hub on $(HUB_URL) ..."
	@for i in $$(seq 1 60); do curl -sf -o /dev/null $(HUB_URL)/q/health && break || sleep 2; done
	@curl -sf -o /dev/null $(HUB_URL)/q/health && echo "Hub is up: $(HUB_URL)"
	$(MAKE) seed
	@echo "waiting for the views lens on :8095 ..."
	@for i in $$(seq 1 60); do curl -sf -o /dev/null http://localhost:8095/healthz && break || sleep 2; done
	@curl -sf -o /dev/null http://localhost:8095/healthz && echo "views lens is up on :8095"

hub-start:
	docker compose start

hub-stop:
	docker compose stop

hub-down:
	docker compose down

hub-reset:
	docker compose down --volumes --remove-orphans

hub-logs:
	docker compose logs --tail=100 calmhub

hub-status:
	@containers="$$(docker ps --filter name=zeta --format '{{.Names}} ({{.Image}}) {{.Status}}')"; \
	if [ -n "$$containers" ]; then printf '%s\n' "$$containers"; else echo "no zeta containers running"; fi
	@curl --max-time 3 -s -o /dev/null -w "hub :8080 -> %{http_code}\n" $(HUB_URL)/ || true
	@curl --max-time 3 -s -o /dev/null -w "lens :8095/poc -> %{http_code}\n" http://localhost:8095/poc || true

seed:
	node scripts/seed-hub.mjs $(HUB_URL)
	docker compose up -d --build --force-recreate views
