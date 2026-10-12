# Prestamista — Decisiones de negocio pendientes de confirmar

Resumen para Jean, destilado de los README de cada etapa y de los
comentarios "TODO/pendiente/a confirmar" del código de `feat/prestamista-motor`.
Cada punto ya tiene un valor por defecto funcionando — nada de esto bloquea
usar el módulo. Son ajustes que valen la pena confirmar antes o poco
después de activarlo con un cliente real.

---

1. **¿Qué pasa si un pago sobra (excedente)?**
   Hoy el sobrante de un pago se aplica automáticamente a las siguientes
   cuotas pendientes. La alternativa sería abonarlo directo a capital. Es
   configurable por producto de préstamo, pero el default es "siguientes
   cuotas" para todos los productos ya creados.

2. **¿Quién puede registrar un pago con fecha de ayer o antes?**
   Hoy, solo un cajero/vendedor necesita que un supervisor lo autorice; un
   Administrador o Contador puede hacerlo sin pedir permiso a nadie.
   Confirmar si ese mismo requisito debería aplicarle también a Contador.

3. **Umbrales de mora para escalar la cobranza (5/15/30/60 días).**
   Son iguales para todas las financieras y no se pueden ajustar por
   empresa todavía. Si alguna financiera necesita ser más estricta o más
   laxa que ese default, hay que construir esa configuración.

4. **Reasignar toda la cartera de un cobrador de un golpe.**
   No existe. Hoy, si un cobrador se va de la empresa, hay que reasignar
   sus préstamos uno por uno desde la pantalla de Cobranza.

5. **Aviso de mora por WhatsApp.**
   Es un link manual (`wa.me`) que el cobrador abre y envía él mismo — no
   hay envío automático todavía, porque ningún cliente de HiCloud tiene
   contratado un proveedor de WhatsApp Business. El día que alguno lo
   tenga, es un cambio acotado activarlo de verdad.

6. **Indicadores de cartera en riesgo por antigüedad (PAR 30/60/90).**
   No existen como tal. Lo más parecido hoy es la distribución de mora por
   días de atraso en el Dashboard.

7. **Un pago mixto (varias formas de pago a la vez) con una parte en
   efectivo no entra al cuadre de caja del cajero.**
   Solo entra al cuadre un pago 100% en efectivo. Prorratear la parte en
   efectivo de un pago mixto necesitaría una columna nueva — es el caso
   menos común, no se construyó.

8. **Tratamiento fiscal del cargo de apertura y del seguro del préstamo.**
   Interés, mora y cargos ya pueden (opcionalmente) emitir su línea en el
   comprobante fiscal (e-CF). Apertura y seguro, no — porque cobrarlos pasa
   por "desembolso", no por "pago", y ese camino fiscal no existe todavía
   en el motor de e-CF del ERP (que es compartido por todo el sistema, no
   solo Prestamista). Falta que el negocio decida cómo debe tratarse
   fiscalmente ese cobro antes de construirlo.

9. **¿Cancelar un préstamo que todavía no se desembolsó debería también
   necesitar la autorización de un supervisor?**
   Hoy no — porque ya no puede tocar dinero real (eso se cerró en la
   auditoría de seguridad). Si se quiere exigirlo igual, por consistencia
   con anular/condonar/reestructurar/ejecutar garantía, es un cambio
   pequeño.

10. **Los pesos exactos del puntaje de riesgo del deudor (0-100).**
    Hoy: Puntualidad 30%, Mora vigente 20%, Refinanciamientos/condonaciones
    25%, Trayectoria de préstamos ya pagados 15%, Garantías/garantes de
    respaldo 10%. Son el default de arranque — si Jean los quiere
    distintos, es un cambio puntual.

11. **Reestructurar un préstamo no pesa por sí solo en el puntaje de
    riesgo.**
    A diferencia de refinanciar o de que le condonen deuda a alguien (que
    sí bajan el puntaje), reestructurar no deja un registro propio en la
    base de datos — solo queda anotado en texto libre. Contarlo con
    precisión requeriría una tabla nueva. Queda cubierto indirectamente la
    mayoría de las veces (quien reestructura casi siempre también
    refinanció o fue condonado alguna vez).

12. **El puntaje de riesgo se calcula al momento, nunca se guarda.**
    Si el volumen de datos de alguna financiera crece mucho, se puede
    optimizar guardándolo y recalculándolo solo cuando algo relevante
    cambia (un pago, una condonación, etc.) — no se construyó porque hoy no
    hace falta.

13. **Una columna vieja (`diasMoraHistorico`) nunca se llena.**
    Es de antes de este roadmap, no se usa en ningún cálculo nuevo, y el
    reporte CSV de "Deudores con saldos" siempre la muestra en 0. No es
    grave (nada depende de ella), pero convendría limpiarla o corregirla
    en algún momento.

14. **El switch "Efectivo de préstamos por la caja del cajero" aparece en
    la Configuración de TODAS las empresas**, aunque no tengan Prestamista
    activo (ver `merge-readiness.md`, sección 2). No es un bug — solo
    ruido de interfaz para quien no usa el módulo. Vale la pena decidir si
    se oculta detrás de un flag de "módulo activo" antes de que más
    clientes lo vean sin necesitarlo.
