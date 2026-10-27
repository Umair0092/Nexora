# syntax=docker/dockerfile:1
# One image for the whole app: Node builds the React client, then Rails serves
# the API and the built client on one port.
#
#   docker compose up --build      (app + Postgres, see docker-compose.yml)

# Keep in step with Backend/.ruby-version
ARG RUBY_VERSION=4.0.1

# ── Client build ──────────────────────────────────────────────────────────────
FROM node:20-slim AS client
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY vite.config.ts tsconfig.json tailwind.config.ts postcss.config.js components.json ./
COPY client ./client
# Writes to /app/Backend/public
RUN npm run build

# ── Rails ─────────────────────────────────────────────────────────────────────
FROM docker.io/library/ruby:$RUBY_VERSION-slim AS base
WORKDIR /rails

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y curl libjemalloc2 postgresql-client && \
    ln -s /usr/lib/$(uname -m)-linux-gnu/libjemalloc.so.2 /usr/local/lib/libjemalloc.so && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

ENV RAILS_ENV="production" \
    BUNDLE_DEPLOYMENT="1" \
    BUNDLE_PATH="/usr/local/bundle" \
    BUNDLE_WITHOUT="development" \
    LD_PRELOAD="/usr/local/lib/libjemalloc.so"

FROM base AS build
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential git libpq-dev libyaml-dev pkg-config && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

COPY Backend/Gemfile Backend/Gemfile.lock Backend/vendor ./
RUN bundle install && \
    rm -rf ~/.bundle/ "${BUNDLE_PATH}"/ruby/*/cache "${BUNDLE_PATH}"/ruby/*/bundler/gems/*/.git && \
    bundle exec bootsnap precompile -j 1 --gemfile

COPY Backend/ ./
RUN bundle exec bootsnap precompile -j 1 app/ lib/

FROM base
RUN groupadd --system --gid 1000 rails && \
    useradd rails --uid 1000 --gid 1000 --create-home --shell /bin/bash
USER 1000:1000

COPY --chown=rails:rails --from=build "${BUNDLE_PATH}" "${BUNDLE_PATH}"
COPY --chown=rails:rails --from=build /rails /rails
COPY --chown=rails:rails --from=client /app/Backend/public /rails/public

# Prepares the database, then starts Puma behind Thruster (compression, caching).
ENTRYPOINT ["/rails/bin/docker-entrypoint"]
EXPOSE 80
CMD ["./bin/thrust", "./bin/rails", "server"]
