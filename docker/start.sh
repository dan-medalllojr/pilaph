#!/bin/sh
# Container entrypoint: point nginx at $PORT, cache config/routes/views, then
# start nginx + PHP-FPM + queue worker + scheduler under supervisord.
# Migrations are not run here; on Railway they run as the pre-deploy command.
set -e

PORT="${PORT:-8080}"
sed -i "s/__PORT__/${PORT}/g" /etc/nginx/nginx.conf

cd /app
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache
# The caches above were written as root; PHP-FPM and the workers run as www-data.
chown -R www-data:www-data storage bootstrap/cache

exec supervisord -c /etc/supervisord.conf
