# ══════════════════════════════════════════════════════════════════════════════
# Stage 1 — Laravel scaffold + dependency install
# Uses composer image to create a full Laravel 11 project and pull all packages.
# This layer is cached; only rebuilds when composer.json changes.
# ══════════════════════════════════════════════════════════════════════════════
FROM composer:2 AS builder

WORKDIR /app

# Create fresh Laravel 11 project (downloads from Packagist)
RUN composer create-project "laravel/laravel:^11.0" . \
    --prefer-dist --no-interaction --quiet

# Install our additional packages on top of the scaffold
RUN composer require \
    "laravel/sanctum:^4.0" \
    "guzzlehttp/guzzle:^7.2" \
    --no-interaction --quiet

# ══════════════════════════════════════════════════════════════════════════════
# Stage 2 — PHP-FPM runtime image
# ══════════════════════════════════════════════════════════════════════════════
FROM php:8.3-fpm-alpine

# ── System dependencies ────────────────────────────────────────────────────────
RUN apk add --no-cache \
    git curl libpng-dev libjpeg-turbo-dev freetype-dev \
    libxml2-dev zip libzip-dev oniguruma-dev icu-dev \
    linux-headers \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install \
        pdo_mysql mbstring exif pcntl bcmath gd zip intl opcache sockets

# ── PHP runtime config ─────────────────────────────────────────────────────────
COPY docker/php/php.ini  /usr/local/etc/php/conf.d/app.ini
COPY docker/php/www.conf /usr/local/etc/php-fpm.d/www.conf

WORKDIR /var/www/html

# ── Copy full Laravel project from builder (vendor/, artisan, public/, etc.) ──
COPY --from=builder /app .

# ── Overlay with our custom application source files ──────────────────────────
#   These replace / extend the defaults created by laravel/laravel scaffold.
COPY app/                    app/
COPY bootstrap/app.php       bootstrap/app.php
COPY bootstrap/providers.php bootstrap/providers.php
COPY database/migrations/    database/migrations/
COPY database/seeders/       database/seeders/
COPY routes/api.php          routes/api.php
COPY routes/web.php          routes/web.php
COPY routes/console.php      routes/console.php
COPY config/services.php     config/services.php

# ── Regenerate autoload so our new classes are discovered ─────────────────────
RUN composer dump-autoload --optimize --quiet

# ── Storage directories + permissions ─────────────────────────────────────────
RUN mkdir -p \
        storage/app/public \
        storage/app/aadhaar \
        storage/framework/cache \
        storage/framework/sessions \
        storage/framework/views \
        storage/logs \
        bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

# ── Entrypoint: runs setup on every container start, then launches php-fpm ────
COPY docker/entrypoint.sh /entrypoint.sh
COPY docker/queue-entrypoint.sh /queue-entrypoint.sh
RUN chmod +x /entrypoint.sh /queue-entrypoint.sh

EXPOSE 9000
ENTRYPOINT ["/entrypoint.sh"]
