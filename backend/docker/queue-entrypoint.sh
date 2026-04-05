#!/bin/sh
# Queue worker entrypoint — waits for MySQL then starts the worker.
# Migrations are already handled by the backend container's entrypoint.
set -e

echo "[Queue] Waiting for MySQL..."
attempt=0
until php -r "
    try {
        new PDO(
            'mysql:host=' . getenv('DB_HOST') . ';dbname=' . getenv('DB_DATABASE'),
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
        echo "[Queue] ERROR: MySQL not ready after 60s."
        exit 1
    fi
    sleep 2
done

echo "[Queue] MySQL ready. Starting queue worker..."
exec php artisan queue:work redis --sleep=3 --tries=3 --max-time=3600
