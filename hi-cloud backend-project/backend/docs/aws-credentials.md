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
| **Backend NestJS** (`S3Service`) | Sube imágenes de productos y PDFs | Al guardar productos con imagen |

---

## Dónde viven las credenciales

### Archivo compartido: `/home/ubuntu/.aws/credentials`

```ini
[hicloud-backup]
aws_access_key_id     = AKIA...          # IAM User: hicloud-backup (cuenta AWS)
aws_secret_access_key = ...
```

**Propietario:** `ubuntu:ubuntu`, permisos `600`.  
**Las claves NO están en el repositorio ni en el .env del backend.**  
El `.env` solo tiene un puntero al perfil (ver siguiente sección).

### IAM User en AWS

- **Usuario:** `hicloud-backup`
- **Política:** acceso a `s3:PutObject`, `s3:GetObject`, `s3:HeadBucket`, `s3:ListBucket`
  sobre el bucket `hicloud-backups-966448715183` (región `us-east-2`).
- **Sin permisos IAM, sin consola AWS, sin acceso a otros servicios.**

---

## Cómo el backend carga las credenciales

El AWS SDK v3 busca credenciales en este orden (cadena de proveedores):

1. Variables de entorno `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
2. **Perfil nombrado** → `AWS_PROFILE` + `AWS_SHARED_CREDENTIALS_FILE` ← **el que usamos**
3. Rol IAM del EC2 (instance profile) ← futuro, cuando exista
4. Otros (ECS task role, etc.)

El `.env` del backend (en producción) tiene:

```
# ── AWS autenticación — puntero al perfil, no copia de claves ────────────
AWS_PROFILE=hicloud-backup
AWS_SHARED_CREDENTIALS_FILE=/home/ubuntu/.aws/credentials
```

NestJS ConfigModule lee el `.env` al arrancar → pone esas variables en `process.env` →
el SDK las usa de forma lazy (al primer request real a S3).

**Ruta exacta del .env en producción:**
```
/home/ubuntu/hicloud/hi-cloud backend-project/backend/.env
```
(El directorio tiene un espacio en el nombre. No hay `.env` en `/home/ubuntu/hicloud/.env`.)

---

## Cómo el script de backup carga las credenciales

El script `backup-hicloud.sh` invoca `aws s3 cp ...` directamente.  
El AWS CLI lee `/home/ubuntu/.aws/credentials` de forma automática (perfil `[default]` o
con `--profile hicloud-backup`).

El script ya tiene configurado el perfil correcto. **No necesita variables de entorno adicionales.**

---

## Rotar las claves

1. Generar nuevo par en AWS Console → IAM → Users → `hicloud-backup` → Security credentials.
2. Editar `/home/ubuntu/.aws/credentials` en la EC2 con las nuevas claves.
3. Reiniciar el backend para que el SDK tome las nuevas credenciales:
   ```bash
   pm2 restart hicloud-backend --update-env
   ```
   ⚠️ **`--update-env` es obligatorio.** Sin él, PM2 sigue usando el entorno cacheado
   del proceso anterior y los cambios al `.env` no tienen efecto (fue el mecanismo
   que provocó el incidente del 21/08/2026).
4. Verificar con:
   ```bash
   AWS_PROFILE=hicloud-backup \
   AWS_SHARED_CREDENTIALS_FILE=/home/ubuntu/.aws/credentials \
   aws s3api head-bucket --bucket hicloud-backups-966448715183
   # Debe devolver BucketArn y BucketRegion
   ```
5. Invalidar el par antiguo en AWS Console (no antes de verificar el nuevo).

---

## Plan a medio plazo: rol IAM en EC2

Cuando la instalación esté estable, lo correcto es:

1. Crear un IAM Role (`hicloud-ec2-role`) con la misma política que el IAM User.
2. Adjuntarlo a la instancia EC2 en AWS Console → EC2 → Actions → Security → Modify IAM Role.
3. Eliminar `AWS_PROFILE` y `AWS_SHARED_CREDENTIALS_FILE` del `.env` — el SDK
   tomará automáticamente el Instance Metadata Service (IMDS).
4. Desactivar el IAM User `hicloud-backup`.

Ventaja: no hay secretos en disco, la rotación la gestiona AWS automáticamente.  
**No hacer esto hasta que el servidor lleve al menos un mes estable sin incidentes.**

---

## Bucket S3

| Variable | Valor | Uso |
|---|---|---|
| `AWS_S3_BACKUP_BUCKET` | `hicloud-backups-966448715183` | Dumps de BD + imágenes de productos (backup) |
| `AWS_REGION` | `us-east-2` | Región del bucket |

Los backups diarios se guardan bajo el prefijo `database/daily/`,
los semanales bajo `database/weekly/`, los manuales bajo `database/manual/`.
