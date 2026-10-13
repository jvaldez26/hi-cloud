# Prestamista — Decisiones de negocio pendientes de confirmar

Resumen para Jean, destilado de los README de cada etapa y de los
comentarios "TODO/pendiente/a confirmar" del código de `feat/prestamista-motor`.
Cada punto ya tiene un valor por defecto funcionando — nada de esto bloquea
usar el módulo.

**Actualizado 2026-10-13** (tras actualizar la rama contra `main` y repasar
este documento punto por punto): de los 14 puntos originales, **6 quedaron
cerrados como decisión técnica** (puntos 3, 9, 11, 12, 13 y 14 — ver el
detalle de cada uno, con el código/doc que lo prueba). Los **8 restantes
siguen abiertos** porque son decisiones de negocio o fiscales que solo Jean
puede tomar — cada uno con su default de arranque aplicado y marcado
"Pendiente de confirmar".

---

## Cerradas (decisión técnica, con su razón)

**Punto 3 — Umbrales de mora para escalar la cobranza (5/15/30/60 días).**
CERRADO: ahora son configurables por empresa. Antes eran una constante fija
(`CobranzaService.SQL_ESCALAMIENTO`) igual para todas las financieras. Hoy
`CobranzaService.getUmbralesEscalamiento(empresaId)` lee
`empresa.configuracion.cobranzaUmbral{Recordatorio,Telefonica,Carta,Legal}`
(mismo patrón JSONB por empresa que `CajaService.getEmpresaCfg()`), con
default 5/15/30/60 — toda empresa que nunca tocó esta config sigue viendo
exactamente el mismo comportamiento de antes. Un valor no numérico/≤0 cae al
default (nunca se interpola algo no numérico en el SQL). Se agregó un
control en pantalla ("Umbrales" en Cobranza, solo ADMIN) que guarda vía el
mismo endpoint genérico `PATCH /configuracion/empresa` que ya usan
`umbralDescuadreCaja`/`prestamoEfectivoPorCaja`. Código:
`hi-cloud backend-project/backend/src/prestamista/cobranza/cobranza.service.ts`
(`getUmbralesEscalamiento`, `sqlEscalamiento`, `carteraVencida`) +
`cobranza.service.spec.ts` (4 tests nuevos: default preservado, umbral
custom, valor inválido cae al default, y la respuesta expone
`umbralesEscalamiento`). Frontend:
`hi-cloud frontend-project/src/pages/prestamista/CobranzaPage.tsx` (botón +
modal "Umbrales de escalamiento"). No se agregó migración — es una clave
JSONB nueva dentro de una columna que ya existe (`empresa.configuracion`),
mismo mecanismo que todas las demás configs por empresa del ERP.

**Punto 9 — ¿`cancelar()` de un préstamo sin desembolsar debería exigir
autorización dual?**
CERRADO sin cambiar el comportamiento actual: sigue sin exigirla. Razón:
desde la auditoría de seguridad de Etapa 6, `cancelar()` ya rechaza
explícitamente cualquier préstamo con `estado='desembolso_parcial'` o con
`totalPagado > 0` (`prestamos.service.ts`, método `cancelar()`, líneas
~410-420) — es decir, **nunca puede tocar dinero real**; solo cancela un
préstamo aprobado que todavía no movió un peso. Exigir un supervisor para
una operación que no mueve dinero (a diferencia de anular/condonar/
refinanciar/ejecutar garantía, que SÍ mueven o perdonan dinero) agregaría
fricción sin ganancia de control. Si en el futuro se quiere exigirlo por
consistencia de todos modos, es un cambio de una línea
(`@UseGuards(RequiereSupervisorSiempre('cancelar_prestamo'))` + agregar la
clave al catálogo) — no se hizo porque no hay nada que proteger hoy.

**Punto 11 — Reestructurar un préstamo no pesa por sí solo en el score.**
CERRADO como deuda técnica aceptada, NO se construyó la tabla
`pr_reestructuraciones`. Razón: el score de la Etapa 7 ya penaliza
refinanciamientos y condonaciones (factor "Refinanciamientos/condonaciones",
25% del score) y, en la práctica, quien reestructura casi siempre también
refinanció o fue condonado alguna vez — la cobertura indirecta ya captura la
mayoría de los casos reales. Construir una tabla nueva solo para el caso
"reestructuró pero nunca refinanció ni fue condonado" es trabajo real
(migración + escritura en cada reestructuración + lectura en el scoring)
para un caso marginal — queda documentado como mejora futura, no como
trabajo pendiente de este roadmap.

**Punto 12 — El score se calcula al vuelo, nunca se guarda.**
CERRADO, se deja como está (sin caché). Razón: YAGNI — es una optimización
de performance para cuando el volumen de préstamos/pagos por tenant
justifique el costo de construir columna persistida + invalidación por
mutación (pago, condonación, refinanciamiento, etc.). Hoy, con el volumen
real de uso de Prestamista (ver `project_auditoria_pendientes_2026-07-26` en
la memoria del usuario: módulo con muy pocos datos reales en producción),
calcularlo al vuelo en cada `GET /prestamista/deudores/:id/score` no tiene
ningún problema de performance medido. Construir la caché antes de que haga
falta sería complejidad sin beneficio actual.

**Punto 13 — `pr_deudores.diasMoraHistorico` es una columna muerta.**
CERRADO como fuera de alcance, documentado como deuda PRE-EXISTENTE a este
roadmap (la columna y su uso en el CSV de Reportes son de antes de
Prestamista v2 — Etapa 4/Reportes, no de Scoring). No se tocó código de
Reportes para esto, tal como se pidió. Sigue sin escribirse nunca
(`scoring.service.ts` y `reportes.service.ts` solo la LEEN, confirmado por
grep — ningún `UPDATE` la toca), el CSV de "Deudores con saldos" sigue
exportándola en 0. Corregirla (decidir si se empieza a calcular, o se
elimina la columna) es trabajo de una futura auditoría de Reportes/Etapa 4,
no de esta tarea.

**Punto 14 — El switch "Efectivo de préstamos por la caja del cajero"
aparecía en la Configuración de TODAS las empresas.**
CERRADO con el fix de gating: el switch ahora solo se renderiza si
`useModuloAddon('prestamista').activo === true` — mismo patrón que
`ClinicaLayout`/`TransporteLayout`/`FarmaciaLayout`/`TallerLayout`/
`OpticaLayout`. Se extrajo a un componente propio
(`SwitchPrestamoEfectivoPorCaja`, exportado desde `ConfiguracionPage.tsx`)
para poder probarlo sin montar todo el formulario de POS. Test:
`hi-cloud frontend-project/src/pages/configuracion/SwitchPrestamoEfectivoPorCaja.test.tsx`
(no se renderiza con el add-on inactivo, sí se renderiza activo). Ver
también el hueco de backend relacionado (`prestamoEfectivoPorCaja` con
default `true` ejecutando 2 queries extra sin el add-on activo) cerrado en
`caja.service.ts` — ver `merge-readiness.md`.

---

## Abiertas — decisión de negocio/fiscal, con el default aplicado

Estas 8 siguen exactamente como estaban: cada una con un default de
arranque razonable ya funcionando, pendientes de que Jean confirme si ese
default es el correcto para el negocio.

1. **¿Qué pasa si un pago sobra (excedente)?** — Pendiente de confirmar.
   Default: se aplica automáticamente a las siguientes cuotas pendientes
   (configurable por producto, pero todos los productos ya creados quedan
   en "siguientes cuotas"). La alternativa sería abonarlo directo a capital.

2. **¿Quién puede registrar un pago con fecha de ayer o antes (pago
   retroactivo)?** — Pendiente de confirmar. Default: solo cajero/vendedor
   necesita autorización de supervisor; Administrador o Contador no la
   necesitan. Confirmar si Contador debería necesitarla también, por
   consistencia con cajero.

3. ~~Umbrales de escalamiento~~ — **CERRADO, ver arriba.**

4. **Reasignar toda la cartera de un cobrador de un golpe.** — Pendiente de
   confirmar si vale la pena construirlo. Default: no existe: hay que
   reasignar préstamo por préstamo desde Cobranza. Mejora futura, no
   construida.

5. **Aviso de mora por WhatsApp.** — Pendiente de que algún cliente de
   HiCloud contrate un proveedor de WhatsApp Business. Default: link manual
   `wa.me` que el cobrador abre y envía él mismo — no hay envío automático.

6. **Indicadores de cartera en riesgo por antigüedad (PAR 30/60/90).** —
   Pendiente de confirmar si vale la pena construirlos. Default: no
   existen; lo más parecido es la distribución de mora por días de atraso
   en el Dashboard. Mejora futura, no construida.

7. **Un pago mixto (varias formas de pago a la vez) con una parte en
   efectivo no entra al cuadre de caja del cajero.** — Pendiente de
   confirmar si vale la pena prorratear la parte en efectivo. Default: solo
   entra al cuadre un pago 100% en efectivo — es el caso menos común, no se
   construyó.

8. **Tratamiento fiscal del cargo de apertura y del seguro del préstamo.**
   — Pendiente de que el negocio decida el tratamiento fiscal correcto.
   Default: sin integrar — cobrarlos pasa por "desembolso", no por "pago",
   y ese camino fiscal no existe todavía en el motor de e-CF del ERP
   (compartido por todo el sistema, no solo Prestamista). **Importante,
   verificado línea por línea el 2026-10-13**: esto es independiente del
   e-CF de interés que v1 ya emite en producción hoy (exento, siempre
   presente — `emitir-ecf.use-case.ts`, construcción de `detalles` para
   `DocumentoOrigenTipo.PAGO_PRESTAMO`, la línea de "Interés" se agrega
   siempre, sin condición) y de la capacidad NUEVA de mora/cargos de Etapa
   5 (que sí está construida, pero queda **apagada por default para todo
   producto, nuevo o existente**, hasta que alguien configure
   explícitamente su "Fiscal" — ver el detalle completo en
   `merge-readiness.md`, sección "Trampa de e-CF verificada").

9. ~~Cancelar sin desembolsar~~ — **CERRADO, ver arriba.**

10. **Los pesos exactos del puntaje de riesgo del deudor (0-100).** —
    Pendiente de confirmar si Jean los quiere distintos. Default: Puntualidad
    30%, Mora vigente 20%, Refinanciamientos/condonaciones 25%, Trayectoria
    de préstamos ya pagados 15%, Garantías/garantes de respaldo 10%.

11. ~~Reestructurar no pesa en el score~~ — **CERRADO, ver arriba.**

12. ~~Score sin caché~~ — **CERRADO, ver arriba.**

13. ~~`diasMoraHistorico` columna muerta~~ — **CERRADO, ver arriba.**

14. ~~Switch visible a todas las empresas~~ — **CERRADO, ver arriba.**
