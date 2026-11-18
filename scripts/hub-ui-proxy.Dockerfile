ARG HUB_UI_SOURCE_REV=e46aeeccbb626b3260dcfc3e615096e783bb7571

FROM node:26-bookworm AS ui-build
ARG HUB_UI_SOURCE_REV
WORKDIR /workspace
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
RUN git init . \
    && git remote add origin https://github.com/finos/architecture-as-code.git \
    && git fetch --depth=1 origin "$HUB_UI_SOURCE_REV" \
    && git checkout --detach FETCH_HEAD
COPY poc/hub-ui/view-lens-ui.patch /tmp/view-lens-ui.patch
RUN git apply --check /tmp/view-lens-ui.patch && git apply /tmp/view-lens-ui.patch
RUN npm ci --workspace calm-models --workspace calm-hub-ui --include-workspace-root=true --ignore-scripts
RUN npm run build:calm-hub-ui && npm test --workspace calm-hub-ui

FROM nginx:stable-alpine
COPY --from=ui-build /workspace/calm-hub-ui/build/ /usr/share/nginx/html/
COPY scripts/hub-ui-proxy.conf /etc/nginx/conf.d/default.conf
RUN nginx -t
EXPOSE 8080
