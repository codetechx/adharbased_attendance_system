#!/bin/sh
# =============================================================================
# AMS Backend Entrypoint
# Runs automatically every time the container starts.
# Handles: APP_KEY, migrations, storage link, then starts PHP-FPM.
# =============================================================================
set -e

echo ""
echo "========================================"
echo "  AMS Backend Starting..."
echo "========================================"

# ── 1. Generate APP_KEY if missing ───────────────────────────────────────────
if [ -z "$APP_KEY" ] || [ "$APP_KEY" = "REPLACE_ME" ]; then
    echo "[AMS] Generating APP_KEY..."
    KEY=$(php -r "echo 'base64:' . base64_encode(random_bytes(32));")
    export APP_KEY="$KEY"
    # Write it back into the Laravel .env inside the container (if it exists)
    if [ -f ".env" ]; then
        sed -i "s|^APP_KEY=.*|APP_KEY=${KEY}|" .env
    fi
    echo "[AMS] APP_KEY generated."
else
    echo "[AMS] APP_KEY is set."
fi

# ── 2. Wait for MySQL ─────────────────────────────────────────────────────────
echo "[AMS] Waiting for MySQL..."
attempt=0
until php -r "
    try {
        new PDO(
            'mysql:host=' . getenv('DB_HOST') . ';port=' . (getenv('DB_PORT') ?: 3306) . ';dbname=' . getenv('DB_DATABASE'),
            getenv('DB_USERNAME'),
            getenv('DB_PASSWORD'),
            [PDO::ATTR_TIMEOUT => 3]
        );
        echo 'ok';
    } catch (Exception \$e) {
        exit(1);
    }
" 2>/dev/null | grep -q ok; do
    attempt=$((attempt + 1))
    if [ $attempt -ge 30 ]; then
        echo "[AMS] ERROR: MySQL not ready after 60s. Check DB settings."
        exit 1
    fi
    echo "[AMS]   waiting... ($attempt/30)"
    sleep 2
done
echo "[AMS] MySQL is ready."

# ── 3. Ensure required directories exist and are writable ─────────────────────
mkdir -p /var/www/html/bootstrap/cache
mkdir -p /var/www/html/storage/app/public
mkdir -p /var/www/html/storage/framework/cache/data
mkdir -p /var/www/html/storage/framework/sessions
mkdir -p /var/www/html/storage/framework/views
mkdir -p /var/www/html/storage/logs
chmod -R 775 /var/www/html/storage /var/www/html/bootstrap/cache

# ── 4. Run migrations (safe — skips already-run migrations) ───────────────────
echo "[AMS] Running migrations..."
php artisan migrate --seed --force
echo "[AMS] Migrations done."

# ── 5. Storage symlink ────────────────────────────────────────────────────────
echo "[AMS] Creating storage symlink..."
php artisan storage:link --force 2>/dev/null || true

# ── 6. Config cache ───────────────────────────────────────────────────────────
echo "[AMS] Caching config..."
php artisan config:cache 2>/dev/null || true

echo "========================================"
echo "  AMS Backend Ready"
echo "========================================"
echo ""

# ── 7. Start PHP-FPM ─────────────────────────────────────────────────────────
exec php-fpm
