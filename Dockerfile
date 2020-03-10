FROM gt-build-common AS builder

ARG APP=guardian-theater
WORKDIR /app
COPY . .
RUN yarn build ${APP}

FROM node:12-alpine
ARG APP=guardian-theater
WORKDIR /app

COPY --from=builder /app/dist/apps/${APP}/main.js main.js
COPY --from=builder /app/node_modules node_modules

ENTRYPOINT [ "node", "main.js" ]
