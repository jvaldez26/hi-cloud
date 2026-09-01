import { useMemo, useState } from 'react';
import {
  Card, Row, Col, Table, Tag, Button, Space, Statistic, Alert,
  Tooltip, Modal, Typography, Badge,
} from 'antd';
import {
  CloudUploadOutlined, DownloadOutlined, SyncOutlined,
  CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined,
  DatabaseOutlined, SafetyOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/es';
import api from '../../api/client';
import { dRD, fechaHora } from '../../utils/fechaRD';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { medianaBytes, evaluarTamanio } from '../../utils/tamanioBackup';

dayjs.extend(relativeTime);
dayjs.locale('es');

const { Text, Title } = Typography;

/**
 * Ruta de la API para NAVEGACIONES del navegador —la descarga de un respaldo—,
 * no para las XHR de axios.
 *
 * Sale de la misma VITE_API_URL que usa axios, pero se queda con la RUTA y
 * descarta el host a propósito. La sesión viaja en la cookie httpOnly
 * `access_token` con SameSite=strict, y esa cookie solo acompaña a una
 * navegación del MISMO ORIGEN: una URL absoluta a otro host llegaría sin ella y
 * el guard respondería 401 en una pestaña nueva.
 *
 * Con eso, los dos entornos funcionan por la misma razón y no por casualidad:
 * en producción VITE_API_URL ya es '/api/v1'; en desarrollo es
 * http://localhost:3000/api/v1 —otro origen— y el dev server proxea /api a ese
 * mismo puerto, así que la ruta relativa es la que sí lleva la cookie.
 *
 * Si algún día la API vive de verdad en otro host, esto se romperá a la vista
 * en lugar de en silencio, y el arreglo no será otro prefijo: será pedir la URL
 * prefirmada por XHR y abrir esa.
 */
const API_PATH = (() => {
  const v = import.meta.env.VITE_API_URL ?? '/api/v1';
  try { return new URL(v, window.location.origin).pathname.replace(/\/+$/, ''); }
  catch { return '/api/v1'; }
})();

const adminApi = {
  backups:   (page = 1) => api.get(`/admin/backups?page=${page}`).then(r => r.data?.data ?? r.data),
  s3Status:  ()         => api.get('/admin/backups/s3-status').then(r => r.data?.data ?? r.data),
  trigger:   ()         => api.post('/admin/backups/trigger').then(r => r.data?.data ?? r.data),
};

/**
 * Que decir por cada motivo de fallo de S3. El backend clasifica; aqui solo se
 * pinta. Antes los tres casos salian con el mismo "no responde".
 */
const MOTIVO_S3: Record<string, string> = {
  'sin-credenciales':  'El BACKEND no tiene credenciales de AWS',
  'sin-permisos':      'Las credenciales del backend no tienen permiso de lectura sobre el bucket',
  'no-existe':         'El bucket no existe',
  'region-incorrecta': 'El bucket esta en otra region',
  'desconocido':       'S3 no responde',
};

const QUE_HACER_S3: Record<string, string> = {
  'sin-credenciales':  'No es problema del bucket ni de los permisos: el proceso no puede firmar la peticion. Los respaldos pueden estar subiendose bien por su cuenta (el script usa sus propias credenciales). Revisa AWS_PROFILE y AWS_SHARED_CREDENTIALS_FILE en el .env del servidor, o dale un rol IAM a la instancia.',
  'sin-permisos':      'Subir (s3:PutObject) y consultar (s3:ListBucket) son permisos distintos: el respaldo puede estar funcionando aunque esto falle.',
  'no-existe':         'Revisa AWS_S3_BACKUP_BUCKET en el .env del servidor.',
  'region-incorrecta': 'Revisa AWS_REGION en el .env del servidor.',
  'desconocido':       'Mira el log del backend para el error completo.',
};

/**
 * Conteos del tooltip de "Probada".
 *
 * Cada valor es `{ restaurado, produccion }`, un OBJETO. Interpolarlo en una
 * plantilla daba literalmente "facturas: [object Object]" — el tooltip llevaba
 * desde el primer día sin decir nada.
 *
 * Se pintan los dos números a propósito. El dump es de las 02:00 y producción
 * se cuenta al verificar: una diferencia pequeña es deriva normal, no un fallo,
 * y con un solo número habría que adivinar cuál es cuál.
 */
function resumenFilas(filas: Record<string, { restaurado: number; produccion: number }>) {
  return Object.entries(filas)
    .map(([tabla, n]) => `${tabla}: ${n?.restaurado ?? '?'}/${n?.produccion ?? '?'}`)
    .join(' · ');
}

export default function BackupsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-backups', page],
    queryFn:  () => adminApi.backups(page),
    refetchInterval: 30_000,
  });

  const { data: s3 } = useQuery({
    queryKey: ['admin-s3-status'],
    queryFn:  adminApi.s3Status,
    staleTime: 60_000,
  });

  const triggerMut = useMutation({
    mutationFn: adminApi.trigger,
    onSuccess: (r) => {
      Modal.success({ title: 'Backup iniciado', content: r?.mensaje ?? 'El backup está en progreso. Se notificará al completar.' });
      // invalidateQueries por sí solo ya refetchea las queries montadas, y esta
      // lo está: `refetch()` detrás disparaba una SEGUNDA petición idéntica.
      // La clave sin página invalida todas — el backup nuevo puede caer en
      // cualquiera de ellas, no solo en la que se está mirando.
      setTimeout(() => qc.invalidateQueries({ queryKey: ['admin-backups'] }), 3000);
    },
    onError: () => Modal.error({ title: 'Error', content: 'No se pudo iniciar el backup.' }),
  });

  const items      = data?.items ?? [];
  const stats      = data?.stats ?? {};
  const meta       = data?.meta  ?? {};
  const ultimo     = items[0];

  // El veredicto lo da el BACKEND (estadoRespaldo), no esta pantalla. Un solo
  // sitio decide si esto está bien o mal, y es el mismo que dispara la alerta
  // a Sentry — así no pueden discrepar.
  //
  // Lo que había aquí: `horasDesde !== null && horasDesde > 25`. Con la tabla
  // VACÍA, horasDesde es null y la condición daba false: no salía ninguna
  // alerta. O sea, "no hay ni un solo respaldo" se veía exactamente igual que
  // "todo en orden" — el peor estado posible pintado como el mejor.
  const respaldo = data?.respaldo;

  // CUÁNTOS RESPALDOS HAY EN LA TABLA, no cuántos caben en esta página.
  //
  // `items.length === 0` es cierto también en una página vacía de un historial
  // sano —la última, tras borrar filas, o cualquiera si se navega fuera de
  // rango— y ahí el panel entero se ponía a gritar "no hay ni un respaldo,
  // revisa el cron" con doce respaldos correctos en la base. Una alarma que
  // grita cuando todo está bien es una alarma que se aprende a ignorar, y esta
  // pantalla existe precisamente porque nadie miraba los respaldos.
  //
  // El total autoritativo es el del backend (`respaldo.totalRegistros`, el
  // mismo número con el que decide `critico`); `meta.total` es el de la
  // paginación. Solo si faltan los dos se cae a la página, y únicamente en la
  // primera, que es la única donde vacío sí implica tabla vacía.
  const totalRegistros: number | undefined =
    typeof respaldo?.totalRegistros === 'number' ? respaldo.totalRegistros
    : typeof meta.total === 'number'             ? meta.total
    : undefined;

  const tablaVacia = totalRegistros !== undefined
    ? totalRegistros === 0
    : page === 1 && items.length === 0;

  const critico  = respaldo?.critico ?? (tablaVacia && !isLoading);
  const horasDesde = respaldo?.horasDesdeUltimo
    ?? (ultimo ? Math.floor((Date.now() - new Date(ultimo.createdAt).getTime()) / 3_600_000) : null);
  const sinRegistros = respaldo?.motivo === 'sin-registros' || (!isLoading && tablaVacia);

  // Referencia de tamaño "normal" para detectar dumps truncados. Se recalcula
  // por página: es la muestra que el frontend tiene delante.
  const refTamanio = useMemo(() => medianaBytes(items), [items]);

  const COLS_DEF = [
    { key: 'createdAt',            label: 'Fecha'        },
    { key: 'tipo',                 label: 'Tipo'         },
    { key: 'estado',               label: 'Estado'       },
    { key: 'tamanio',              label: 'Tamaño'       },
    { key: 'duracionSegundos',     label: 'Duración'     },
    { key: 'integridadVerificada', label: 'Restauración' },
    { key: 's3Key',                label: 'S3 Key'       },
  ];
  const { visibleColumns, updateVisibility, filterColumns } =
    useColumnVisibility('sa-backups', COLS_DEF);

  const cols = [
    {
      title: 'Fecha', dataIndex: 'createdAt', key: 'createdAt', width: 155,
      render: (v: string) => (
        <Tooltip title={dRD(v).format('DD/MM/YYYY HH:mm:ss')}>
          <span style={{ fontSize: 12 }}>{dRD(v).format('DD MMM YYYY HH:mm')}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Tipo', dataIndex: 'tipo', key: 'tipo', width: 90,
      render: (v: string) => {
        const colors: Record<string, string> = { daily:'blue', weekly:'purple', monthly:'orange', manual:'cyan' };
        return <Tag color={colors[v] ?? 'default'} style={{ fontSize: 11 }}>{v.toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Estado', dataIndex: 'estado', key: 'estado', width: 120,
      render: (v: string) => {
        if (v === 'EXITOSO')      return <Tag color="green"  icon={<CheckCircleOutlined />}>Exitoso</Tag>;
        if (v === 'FALLIDO')      return <Tag color="red"    icon={<CloseCircleOutlined />}>Fallido</Tag>;
        return                           <Tag color="blue"   icon={<SyncOutlined spin />}>En progreso</Tag>;
      },
    },
    {
      title: 'Tamaño', dataIndex: 'tamanio', key: 'tamanio', width: 90, align: 'right' as const,
      render: (v: string) => {
        if (!v) return <Text type="secondary">—</Text>;
        const { color, aviso } = evaluarTamanio(v, refTamanio);
        const texto = (
          <Text style={{ color, fontSize: 12, fontFamily: 'monospace' }}>
            {aviso ? '⚠ ' : ''}{v}
          </Text>
        );
        return aviso ? <Tooltip title={aviso}>{texto}</Tooltip> : texto;
      },
    },
    {
      title: 'Duración', dataIndex: 'duracionSegundos', key: 'duracionSegundos', width: 90, align: 'right' as const,
      render: (v: number) => v ? <Text style={{ fontSize: 12 }}>{v}s</Text> : <Text type="secondary">—</Text>,
    },
    {
      // Esta columna decia "✅ SHA-256 verificado" para archivos que nadie habia
      // abierto nunca: el backend levantaba la bandera sin comprobar nada. Un
      // backup roto se veia exactamente igual que uno bueno.
      //
      // Ahora solo hay tick si se restauro de verdad. Y cuando no lo hay, se
      // dice por qué — "N/A" sonaba a dato que falta, no a advertencia.
      title: 'Restauración', dataIndex: 'integridadVerificada', key: 'integridadVerificada', width: 130, align: 'center' as const,
      render: (v: boolean, r: any) => {
        if (v) {
          return (
            <Tooltip title={
              `Bajado de S3, contrastado su SHA-256 y restaurado el ${fechaHora(r.restauracionProbadaEn ?? r.verificadoEn)}` +
              // ^ aquí el fallback a verificadoEn sí es legítimo: la bandera ya
              //   está en true, o sea que hubo restauración real; solo se busca
              //   su fecha, y en las filas más viejas vive en verificadoEn.
              (r.verificacionSegundos ? ` · tardó ${r.verificacionSegundos}s` : '') +
              (r.filasVerificadas ? ' · ' + resumenFilas(r.filasVerificadas) : '')
            }>
              <Tag color="green" icon={<SafetyOutlined />}>Probada</Tag>
            </Tooltip>
          );
        }

        // Que la prueba FALLARA y que nadie la haya hecho no son el mismo
        // estado, y hasta ahora los dos salían como "Sin probar". Un dump que
        // no restaura pintado como "todavía no lo hemos mirado" es la misma
        // mentira tranquilizadora que el tick verde sin restaurar: lo urgente
        // se ve igual que lo pendiente.
        //
        // El discriminante es `restauracionProbadaEn`, NO `verificadoEn`.
        //
        // `verificadoEn` es una columna heredada: el código viejo la escribía en
        // cada backup exitoso sin comprobar nada, igual que levantaba la bandera
        // verde. Un timestamp suyo no prueba que se intentara restaurar nada, y
        // leerlo aquí convierte "nadie lo miró nunca" en un "LA RESTAURACIÓN
        // FALLÓ" en rojo — la falsa alarma es la misma mentira del otro lado.
        //
        // `restauracionProbadaEn` nació con la verificación real (migración
        // AddVerificacionRestauracionBackups) y solo la escribe
        // registrarVerificacion(), que es quien restaura de verdad. Si está,
        // hubo intento; si no está, no lo hubo. Sin depender de que ninguna
        // migración de limpieza pasara por esta base.
        if (r.restauracionProbadaEn) {
          return (
            <Tooltip title={
              `LA RESTAURACIÓN FALLÓ el ${fechaHora(r.restauracionProbadaEn)}` +
              (r.verificacionSegundos ? ` (tras ${r.verificacionSegundos}s)` : '') +
              `. ${r.verificacionMensaje ?? 'Sin detalle.'}`
            }>
              <Tag color="error" icon={<CloseCircleOutlined />}>Falló</Tag>
            </Tooltip>
          );
        }

        return (
          <Tooltip title="Nadie ha restaurado este archivo. Que el backup se creara sin error no significa que se pueda restaurar.">
            <Tag color="warning" icon={<ExclamationCircleOutlined />}>Sin probar</Tag>
          </Tooltip>
        );
      },
    },
    {
      title: 'S3 Key', dataIndex: 's3Key', key: 's3Key', ellipsis: true,
      render: (v: string) => v
        ? <Text code style={{ fontSize: 10 }}>{v}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      // Esta descarga es la vía práctica para sacar una copia FUERA de AWS sin
      // SSH, así que conviene que no engañe.
      //
      // El botón se habilitaba con cualquier s3Key no vacía. Cuando S3 no está
      // configurado, el script guarda "local:/tmp/...", que no es una clave de
      // S3: la descarga devolvía un XML de error. Parecía funcionar, que es
      // peor que estar deshabilitado.
      title: '', key: 'acc', width: 110, align: 'right' as const,
      render: (_: any, r: any) => {
        const soloLocal = typeof r.s3Key === 'string' && r.s3Key.startsWith('local:');
        const puede = r.estado === 'EXITOSO' && r.s3Key && !soloLocal;
        const boton = (
          <Button size="small" icon={<DownloadOutlined />} disabled={!puede}
            // Sin cabeceras de axios A PROPÓSITO, y funciona por diseño, no por
            // suerte: SuperAdminGuard saca el JWT con extractJwtFromRequest(),
            // que lee PRIMERO la cookie httpOnly `access_token` y solo después
            // el `Authorization: Bearer`. Una navegación top-level al mismo
            // origen lleva esa cookie sola — SameSite=strict la permite; lo que
            // bloquea es la petición cross-site, y por eso API_PATH es relativo.
            //
            // El endpoint responde 302 a una URL prefirmada de S3 de 15 min, así
            // que tampoco podría ir por axios: seguir ese redirect con
            // `Authorization` puesto lo rompería contra S3.
            onClick={() => window.open(`${API_PATH}/admin/backups/${r.id}/download`, '_blank')}>
            Descargar
          </Button>
        );
        if (soloLocal) {
          return (
            <Tooltip title="Este respaldo solo existe en el disco de la EC2, no se subió a S3. Se pierde con el servidor.">
              {boton}
            </Tooltip>
          );
        }
        return boton;
      },
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" gutter={[0, 8]} style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <DatabaseOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            Backups del Sistema
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Copias de seguridad automáticas · Daily 02:00 AM · S3 STANDARD_IA
          </Text>
        </Col>
        <Col xs={24} sm="auto">
          <Space wrap>
            <Button icon={<SyncOutlined />} onClick={() => refetch()}>Actualizar</Button>
            <Button type="primary" icon={<CloudUploadOutlined />}
              loading={triggerMut.isPending}
              onClick={() => {
                Modal.confirm({
                  title: 'Ejecutar backup manual',
                  content: 'Se ejecutará pg_dump y se subirá a S3. Puede tardar 1-3 minutos.',
                  okText: 'Ejecutar', cancelText: 'Cancelar',
                  onOk: () => triggerMut.mutate(),
                });
              }}>
              Backup manual
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Estado del respaldo. VACÍO NO ES VERDE: si no hay ni un registro, esto
          sale en rojo igual que si el último fuera de hace una semana. */}
      {critico && (
        <Alert type="error" showIcon style={{ marginBottom: 16 }}
          icon={<ExclamationCircleOutlined />}
          message={
            sinRegistros
              ? '🚨 Sin registros de respaldo — puede que el cron no esté instalado en el servidor'
              : `🚨 El último respaldo fue hace ${horasDesde} horas`
          }
          description={
            sinRegistros
              ? <>
                  No hay <strong>ninguna</strong> fila en <Text code>backup_registros</Text>. Eso significa
                  una de dos, y las dos son graves: o no se está respaldando nada, o el respaldo corre pero
                  no consigue avisar al backend (revisa <Text code>INTERNAL_API_KEY</Text>).
                  {' '}Compruébalo en el servidor con <Text code>crontab -l | grep backup</Text> y{' '}
                  <Text code>tail /var/log/hicloud-backup.log</Text>.
                </>
              : <>
                  El respaldo es diario. Pasadas 48 h son dos ciclos perdidos.
                  {respaldo?.mensaje ? ` ${respaldo.mensaje}` : ''}
                </>
          }
          action={
            <Button danger size="small" onClick={() => triggerMut.mutate()} loading={triggerMut.isPending}>
              Ejecutar ahora
            </Button>
          }
        />
      )}

      {/* S3 status */}
      {s3 && (
        <Alert
          type={s3.ok ? 'success' : s3.habilitado ? 'error' : 'warning'}
          showIcon style={{ marginBottom: 16 }}
          // "S3 no responde" hacía que tres causas distintas —bucket inexistente,
          // sin permisos, backend sin credenciales— se vieran igual. Costó tres
          // rondas de diagnóstico descubrir que el bucket estaba perfecto y lo
          // que faltaban eran credenciales en el backend. Ahora se dice cuál es.
          message={
            s3.ok ? `✅ S3 conectado — bucket: ${s3.bucket}` :
            s3.habilitado ? `❌ ${MOTIVO_S3[s3.motivo as string] ?? 'S3 no responde'} — bucket: ${s3.bucket}` :
            '⚠️ S3 no configurado — establece AWS_S3_BACKUP_BUCKET en el .env del servidor'
          }
          description={!s3.ok && s3.habilitado ? (
            <div style={{ fontSize: 12 }}>
              {QUE_HACER_S3[s3.motivo as string] ?? null}
              {s3.detalle && <div style={{ marginTop: 4, opacity: .7 }}>Error del SDK: <Text code>{s3.detalle}</Text></div>}
            </div>
          ) : undefined}
        />
      )}

      {/* Estadísticas.
          Sin un solo registro el bloque ENTERO va en alarma, no solo una cifra
          suelta. Este cuadro en verde es la razón de que nadie mirara los
          respaldos en meses: decía 100% de éxito sobre cero respaldos. */}
      <div style={{
        marginBottom: 16,
        ...(sinRegistros ? {
          border: '1px solid #ef4444',
          borderRadius: 10,
          background: '#ef44440d',
          padding: 12,
        } : {}),
      }}>
        {sinRegistros && (
          <Text strong style={{ color: '#ef4444', fontSize: 12, display: 'block', marginBottom: 10 }}>
            🚨 Estas cifras son de CERO respaldos — no describen un sistema sano, describen uno que no existe
          </Text>
        )}
      <Row gutter={16}>
        <Col xs={12} md={6}>
          <Card size="small">
            {/* "Nunca" salía en verde. Es el peor valor posible de esta tarjeta.

                Y "Nunca" se decide por la TABLA, no por `ultimo` —items[0]—,
                que es el primero de la página abierta. Mismo defecto que tenía
                sinRegistros: en una página vacía de un historial sano la
                tarjeta anunciaba que no se ha respaldado nunca.

                El tamaño de abajo sí es el de items[0], así que solo se enseña
                en la página 1, donde esa fila es de verdad la más reciente. En
                la 3 estaba etiquetando como "último" un respaldo de hace días. */}
            <Statistic title="Último backup"
              value={tablaVacia ? 'Nunca' : horasDesde !== null ? `hace ${horasDesde}h` : '—'}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ fontSize: 16, color: critico ? '#ef4444' : '#10b981' }} />
            {page === 1 && ultimo?.tamanio && (
              <Text type="secondary" style={{ fontSize: 11 }}>{ultimo.tamanio}</Text>
            )}
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            {/* Sin registros la tasa daba 100% en verde: 0 de 0 salía como
                pleno éxito. Sin datos no hay tasa — se dice, no se inventa. */}
            <Statistic title="Tasa de éxito"
              value={sinRegistros ? 'Sin datos' : (stats.tasaExito ?? 0)}
              suffix={sinRegistros ? '' : '%'}
              valueStyle={{
                fontSize: 16,
                color: sinRegistros ? '#ef4444'
                     : (stats.tasaExito ?? 0) >= 95 ? '#10b981' : '#ef4444',
              }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            {/* Cero exitosos NO es verde. El tick daba sensación de "todo bien"
                justo cuando el número decía que no había ni un respaldo. */}
            <Statistic title="Exitosos" value={stats.exitosos ?? 0}
              prefix={(stats.exitosos ?? 0) > 0 ? '✅' : '⚠️'}
              valueStyle={{ fontSize: 16, color: (stats.exitosos ?? 0) > 0 ? '#10b981' : '#ef4444' }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Fallidos" value={stats.fallidos ?? 0} prefix="❌"
              valueStyle={{ fontSize: 16, color: stats.fallidos > 0 ? '#ef4444' : '#94a3b8' }} />
          </Card>
        </Col>
      </Row>
      </div>

      {/* Tabla */}
      <Card
        title={<Space><DatabaseOutlined /> Historial de backups</Space>}
        extra={
          <Space size={4}>
            <Badge count={meta.total ?? 0} style={{ background: '#6b7280' }} showZero />
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          </Space>
        }
      >
        <Table
          columns={filterColumns(cols as any)}
          dataSource={items}
          rowKey="id"
          loading={isLoading}
          size="small"
          scroll={{ x: 'max-content' }}
          pagination={{
            current: page,
            pageSize: 10,
            total: meta.total ?? 0,
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (t) => `${t} backups`,
          }}
          rowClassName={(r: any) => r.estado === 'FALLIDO' ? 'ant-table-row-error' : ''}
          // Mismo cuidado que en la alarma: "no hay ni un respaldo" y "esta
          // página no trae ninguno" son cosas distintas y decían lo mismo.
          locale={{ emptyText: tablaVacia
            ? 'Sin backups registrados aún — ejecuta el primero manualmente'
            : 'Esta página no tiene filas — vuelve a la primera' }}
        />
      </Card>

      {/* Instrucciones de configuración */}
      <Card title="⚙️ Configuración del servidor EC2" size="small" style={{ marginTop: 16 }}>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Variables .env requeridas:</Text>
            <pre style={{ background: '#f1f5f9', padding: 12, borderRadius: 6, fontSize: 12, margin: 0 }}>
{`AWS_S3_BACKUP_BUCKET=hicloud-backups-xxxxx
AWS_REGION=us-east-2
INTERNAL_API_KEY=genera-un-secreto-aqui
BACKUP_SCRIPT_PATH=/home/ubuntu/scripts/backup-hicloud.sh`}
            </pre>
          </Col>
          <Col xs={24} md={12}>
            {/*
              Las DOS líneas, no solo la del respaldo.
              Quien montara un servidor siguiendo esto se quedaba con respaldos
              que nadie prueba — justo el agujero que la columna "Restauración"
              existe para enseñar. El deploy instala ambos crones solo, pero esta
              pantalla decía la mitad.
            */}
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Configurar crontab (respaldo 02:00, verificación 03:30):</Text>
            <pre style={{ background: '#f1f5f9', padding: 12, borderRadius: 6, fontSize: 12, margin: 0 }}>
{`# En el servidor EC2 (el deploy ya lo hace solo):
chmod +x /home/ubuntu/scripts/*.sh
crontab -e
# Agregar estas dos líneas:
0 2 * * * /home/ubuntu/scripts/backup-hicloud.sh
30 3 * * * /home/ubuntu/scripts/verificar-backup.sh`}
            </pre>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
              La segunda línea es la que baja el respaldo de S3, comprueba su SHA-256
              y lo restaura en una base temporal. Sin ella ningún respaldo llega a
              marcarse como <Text code style={{ fontSize: 11 }}>Probada</Text>.
            </Text>
          </Col>
        </Row>
      </Card>
    </div>
  );
}

