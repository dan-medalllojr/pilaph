# One image for production (Railway) and local Docker runs.
# Web (nginx + PHP-FPM), queue worker and scheduler run together under supervisord.

ARG PHP_VERSION=8.5

# ---------------------------------------------------------------------------
# Base: PHP-FPM with the extensions Laravel and the app need
# ---------------------------------------------------------------------------
FROM php:${PHP_VERSION}-fpm-alpine AS base

COPY --from=mlocati/php-extension-installer:2 /usr/bin/install-php-extensions /usr/local/bin/
RUN install-php-extensions pdo_pgsql intl bcmath opcache pcntl zip \
    && apk add --no-cache nginx supervisor

COPY docker/php.ini /usr/local/etc/php/conf.d/zz-app.ini
WORKDIR /app

# ---------------------------------------------------------------------------
# Build: Composer dependencies + Vite assets
# (the Wayfinder Vite plugin runs `php artisan`, so this stage needs PHP and Node)
# ---------------------------------------------------------------------------
FROM base AS build

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
RUN apk add --no-cache nodejs npm

COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction

COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY . .
RUN composer dump-autoload --optimize --no-dev

# Vite inlines VITE_* variables at build time, so they must be build arguments.
# Railway passes service variables to every ARG declared here.
ARG VITE_APP_NAME=PilaPH
ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_ANON_KEY=""
RUN npm run build && rm -rf node_modules

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM base AS runtime

ENV APP_ENV=production \
    APP_DEBUG=false \
    LOG_CHANNEL=stderr \
    PHP_FPM_MAX_CHILDREN=12

COPY --from=build /app /app
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/supervisord.conf /etc/supervisord.conf
# After the image's own zz-docker.conf, so these settings win.
COPY docker/php-fpm.conf /usr/local/etc/php-fpm.d/zz-pilaph.conf
COPY docker/start.sh /usr/local/bin/start
RUN chmod +x /usr/local/bin/start \
    && chown -R www-data:www-data storage bootstrap/cache

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- "http://127.0.0.1:${PORT:-8080}/up" >/dev/null || exit 1

CMD ["start"]
