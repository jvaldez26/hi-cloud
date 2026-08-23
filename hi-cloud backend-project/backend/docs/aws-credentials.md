# AWS — Autenticación y credenciales

> Última actualización: 2026-08-22
> Incidente que motivó este documento: `CredentialsProviderError` en
> `GET /api/v1/admin/backups/:id/download` por falta de credenciales en el proceso PM2.

---

## Quién necesita credenciales AWS

| Componente | Qué hace | Cuándo las usa |
|---|---|---|
| **Script `backup-hicloud.sh`** | Sube dumps de PostgreSQL a S3 | Diario 02:00 y 17:00 h RD |
| **Backend NestJS** (`BackupService`) | Genera URLs firmadas de descarga (15 min) | Al hacer clic en "Descargar" en el panel Super Admin |
| **Backend NestJS** (`S3Service`) | Sube imágenes de productos, logos, comprobantes | Al guardar productos/configuración/pagos |

---

## Dónde viven las credenciales

### Archivo: `/home/ubuntu/.aws/credentials`

```ini
[hicloud-backup]
aws_access_key_id     = AKIA...          # IAM User: hicloud-backup-agent (ver nota)
aws_secret_access_key = ...

[hicloud-media]
aws_access_key_id     = AKIA...          # IAM User: hicloud-media
aws_secret_access_key = ...
```

**Propietario:** `ubuntu:ubuntu`, permisos `600`.  
**Las claves NO están en el repositorio ni en el .env del backend.**  
El `.env` solo tiene punteros a los perfiles (ver siguiente sección).

> **Nota de nombres**: el IAM User en la consola de AWS se llama `hicloud-backup-agent`,
> pero el perfil en `~/.aws/credentials` es `[hicloud-backup]`. Son nombres distintos —
> el perfil es lo que usan el código y el script; el nombre del IAM User es solo una etiqueta
> en la consola. No confundirlos al buscar en AWS Console o al rotar claves.

### IAM Users en AWS

| Perfil local | IAM User (consola AWS) | Política | Bucket |
|---|---|---|---|
| `[hicloud-backup]` | `hicloud-backup-agent` | PutObject, GetObject, HeadBucket, ListBucket | `hicloud-backups-966448715183` |
| `[hicloud-media]` | `hicloud-media` | PutObject, GetObject, DeleteObject, ListBucket | `hicloud-media-966448715183` |

**Principio de mínimo privilegio**: cada IAM User tiene acceso SOLO a su bucket.
`hicloud-backup-agent` no puede leer ni escribir en el bucket de media, y viceversa.

---

## Cómo el backend carga las credenciales

Desde el commit `7c69a128`, cada `S3Client` usa `fromIni({ profile })` explícito —
**nunca depende de `AWS_PROFILE` global del proceso**. Antes de ese commit, un único
`AWS_PROFILE` global podía causar que el cliente equivocado tomara credenciales del otro
bucket (fue el mecanismo del incidente del 2026-08-21).

El `.env` del backend (en producción) tiene:

```
# ── AWS — punteros a perfiles, no copias de claves ───────────────────────────
AWS_SHARED_CREDENTIALS_FILE=/home/ubuntu/.aws/credentials
AWS_S3_BACKUP_PROFILE=hicloud-backup       # lee [hicloud-backup] del credentials file
AWS_S3_PROFILE=hicloud-media               # lee [hicloud-media] del credentials file
AWS_S3_BUCKET=hicloud-media-966448715183
AWS_S3_BACKUP_BUCKET=hicloud-backups-966448715183
AWS_REGION=us-east-2
# AWS_PROFILE=                             # ← COMENTADO: ya no se usa; cada cliente tiene su perfil
```

**Ruta exacta del .env en producción:**
```
/home/ubuntu/hicloud/hi-cloud backend-project/backend/.env
```
(El directorio tiene un espacio en el nombre. No hay `.env` en `/home/ubuntu/hicloud/.env`.)

---

## Cómo el script de backup carga las credenciales

El script `backup-hicloud.sh` invoca `aws s3 cp ...` directamente.
El AWS CLI usa el perfil `hicloud-backup` del archivo `~/.aws/credentials`.
**No necesita variables de entorno adicionales.**

---

## Buckets S3

| Variable `.env` | Bucket | Versioning | Uso |
|---|---|---|---|
| `AWS_S3_BACKUP_BUCKET` | `hicloud-backups-966448715183` | activado | Dumps de BD |
| `AWS_S3_BUCKET` | `hicloud-media-966448715183` | activado | Imágenes de productos, logos, favicons, comprobantes de pago |

Ambos buckets: acceso público bloqueado, región `us-east-2`, SSE-S3.
Las imágenes se sirven con URL firmada (15 min), nunca directamente públicas.

Prefijos en el bucket de backups: `database/daily/`, `database/weekly/`, `database/monthly/`, `database/manual/`.  
Prefijos en el bucket de media: `imagenes/productos/`, `pdfs/`, `uploads/comprobantes/`.

---

## Rotar las claves

### Claves del bucket de backups (`hicloud-backup-agent`)

1. Generar nuevo par en AWS Console → IAM → Users → `hicloud-backup-agent` → Security credentials.
2. Editar el bloque `[hicloud-backup]` en `/home/ubuntu/.aws/credentials` en la EC2.
3. Reiniciar el backend:
   ```bash
   pm2 restart hicloud-backend --update-env
   ```
   ⚠️ **`--update-env` es obligatorio.** Sin él, PM2 sigue usando el entorno cacheado
   del proceso anterior (fue el mecanismo del incidente del 2026-08-21).
4. Verificar:
   ```bash
   AWS_PROFILE=hicloud-backup \
   AWS_SHARED_CREDENTIALS_FILE=/home/ubuntu/.aws/credentials \
   aws s3api head-bucket --bucket hicloud-backups-966448715183
   # Debe devolver BucketArn y BucketRegion
   ```
5. Invalidar el par antiguo en AWS Console (no antes de verificar el nuevo).

### Claves del bucket de media (`hicloud-media`)

Igual, pero IAM User `hicloud-media`, bloque `[hicloud-media]`, bucket `hicloud-media-966448715183`.

---

## Plan a medio plazo: rol IAM en EC2

Cuando la instalación esté estable (al menos un mes sin incidentes):

1. Crear un IAM Role con las dos políticas (backup + media).
2. Adjuntarlo a la instancia EC2: AWS Console → EC2 → Actions → Security → Modify IAM Role.
3. Eliminar `AWS_SHARED_CREDENTIALS_FILE`, `AWS_S3_BACKUP_PROFILE`, `AWS_S3_PROFILE` del `.env`
   y los bloques de `/home/ubuntu/.aws/credentials` — el SDK tomará el IMDS automáticamente.
4. Desactivar los IAM Users `hicloud-backup-agent` y `hicloud-media`.

Ventaja: sin secretos en disco, rotación automática gestionada por AWS.
