# CALM views lens service (demo). Build from the repo root:
#   docker build -f poc/hub-extensions/calm-views/Dockerfile -t calm-views:local .
# Needs nothing outside this repo: tools are built in the first stage.
FROM node:24-bookworm-slim AS tools
ENV NODE_ENV=development
WORKDIR /srv/tools
COPY poc/tools/package.json poc/tools/package-lock.json ./
RUN npm ci
COPY poc/tools/tsconfig.json ./
COPY poc/tools/src ./src
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /srv/views
COPY poc/hub-extensions/calm-views/package.json poc/hub-extensions/calm-views/package-lock.json ./
RUN npm ci --include=dev
COPY --from=tools /srv/tools/dist /tools/dist
COPY poc/tools/package.json /tools/package.json
COPY poc/hub-extensions/calm-views/tsconfig.json poc/hub-extensions/calm-views/extension.json poc/hub-extensions/calm-views/notation.json ./
COPY poc/hub-extensions/calm-views/src ./src
RUN npm run build && npm prune --omit=dev
COPY poc/views /srv/views
COPY poc/model /srv/model
ENV NODE_ENV=production CALM_VIEWS_DIR=/srv/views HOST=0.0.0.0 PORT=8095
EXPOSE 8095
CMD ["node", "dist/main.js"]
