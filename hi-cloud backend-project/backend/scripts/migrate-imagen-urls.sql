-- migrate-imagen-urls.sql
-- Convierte las 3 filas históricas donde imagenUrl es una URL absoluta de S3
-- al formato key (lo que guarda el servicio a partir del deploy de 2026-08-22).
--
-- Idempotente: solo toca filas que empiezan con la URL del bucket de media.
-- Las filas que ya tienen key (e.g. "imagenes/productos/2/abc.jpg") no se modifican.
--
-- Cómo correr (desde la EC2 o un host con acceso a RDS):
--
--   export PGPASSWORD='<contraseña>'
--   psql -h <RDS_HOST> -U <DB_USER> -d <DB_NAME> -f scripts/migrate-imagen-urls.sql
--
-- O con la variable DATABASE_URL del .env:
--
--   psql "$DATABASE_URL" -f scripts/migrate-imagen-urls.sql

BEGIN;

UPDATE productos
SET "imagenUrl" = regexp_replace(
    "imagenUrl",
    '^https://hicloud-media-966448715183\.s3\.us-east-2\.amazonaws\.com/',
    ''
)
WHERE "imagenUrl" LIKE 'https://hicloud-media-966448715183.s3.us-east-2.amazonaws.com/%';

-- Verificar el resultado
SELECT id, "imagenUrl"
FROM productos
WHERE "imagenUrl" LIKE 'imagenes/%'
ORDER BY id;

COMMIT;
