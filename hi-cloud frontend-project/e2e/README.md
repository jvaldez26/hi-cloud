# Verificación e2e (Playwright) — módulo educativo, tanda 2

No hay infraestructura Playwright previa en el repo — esta es la primera. Se
usa exclusivamente para verificar contra `hicloud_test` (NUNCA producción)
antes de cada commit de la tanda 2 (disciplina, biblioteca, transporte,
comunicados), en vez de `curl`.

## Antes de correr

1. Backend apuntando a `hicloud_test` — swap de `.env` (ver memoria del
   proyecto / segmentos anteriores de esta sesión), rebuild limpio
   (`rm -f tsconfig.build.tsbuildinfo tsconfig.tsbuildinfo && rm -rf dist && npm run build`),
   `node dist/main.js` — nunca `nest start --watch` (bug conocido de build
   incremental).
2. `npm run dev` (Vite) en este proyecto, sirviendo en `:5173`.
3. Datos base sembrados en `hicloud_test`, empresa #1 ("HiCloud Demo"),
   módulo `educativo` activo:
   - `ed_secciones` id=1 "A", id=5 "B" (mismo grado, mismo año escolar).
   - `ed_estudiantes` id=1 Juan Pérez, id=5 María López.
   - `ed_docentes` id=1 "Carla Fernández" vinculada a `users.id=7`
     (`docente.test@hicloud.com` / `Docente1234!`, rol `vendedor` en
     `usuario_empresa`) vía `ed_docentes.usuarioId`, asignada SOLO a la
     sección A por `ed_asignaciones_docente`.
   - Un incidente de control en `ed_disciplina` (id=1) en la sección B,
     estudiante María López — el usuario docente nunca debe verlo.

## Correr

```
npx playwright test e2e/disciplina.spec.ts --reporter=list
```

## Después de correr

Restaurar el `.env` real (`cp .env.backup-realprod-DONOTCOMMIT .env`),
detener los procesos de `node dist/main.js` y `vite` (cuidado: quedan
detached del wrapper del shell — verificar `netstat` y matar por PID si
`TaskStop` no los mata).
