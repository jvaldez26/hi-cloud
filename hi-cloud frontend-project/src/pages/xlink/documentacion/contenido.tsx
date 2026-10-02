import { Typography, Alert, Tag, Table } from 'antd';

const { Title, Paragraph, Text } = Typography;

/** Mismos colores que ESTADO_TAG en XlinkPage.tsx (EnviadosTab) — una sola fuente visual. */
function EstadoTag({ estado }: { estado: 'pendiente' | 'procesado' | 'descartado' }) {
  const map = {
    pendiente: { color: 'blue', label: 'Pendiente' },
    procesado: { color: 'green', label: 'Procesado' },
    descartado: { color: 'red', label: 'Descartado' },
  } as const;
  return <Tag color={map[estado].color}>{map[estado].label}</Tag>;
}

/** Nombre de un botón/control de la app, con estilo de tecla — para que el usuario lo reconozca en pantalla. */
function Boton({ children }: { children: React.ReactNode }) {
  return (
    <Tag
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 12.5,
        padding: '1px 8px',
      }}
    >
      {children}
    </Tag>
  );
}

/** Metadata del índice — única fuente de verdad para el TOC y las anclas del contenido. */
export const SECCIONES: { id: string; titulo: string }[] = [
  { id: 'activar', titulo: '1. Activar la empresa' },
  { id: 'directorio', titulo: '2. Encontrar y vincular empresas' },
  { id: 'enviar', titulo: '3. Enviar documentos' },
  { id: 'recibir', titulo: '4. Recibir documentos' },
  { id: 'homologacion', titulo: '5. Homologación' },
  { id: 'seguimiento', titulo: '6. Seguimiento' },
  { id: 'protecciones', titulo: '7. Protecciones' },
  { id: 'limitaciones', titulo: '8. Qué no hace todavía' },
  { id: 'resumen', titulo: 'En una frase' },
];

const filasEquivalencia = [
  { key: '1', envia: 'Factura a crédito', recibe: 'Compra / factura de proveedor' },
  { key: '2', envia: 'Nota de crédito a cliente', recibe: 'Nota de crédito de proveedor' },
  { key: '3', envia: 'Orden de compra', recibe: 'Cotización en borrador (el pedido a preparar)' },
];

export default function ContenidoDocumentacion() {
  return (
    <>
      <Title level={2} style={{ marginTop: 0 }}>HiCloud Xlink: qué puede hacer un usuario</Title>
      <Paragraph>
        HiCloud Xlink es un buzón de documentos entre empresas que usan HiCloud. Una empresa publica
        un documento ya emitido y la otra lo recibe con un clic, ya convertido en el documento que le
        corresponde en su propio sistema: con productos, cantidades, precios, impuestos y comprobante
        fiscal, sin redigitar nada. Las dos empresas no necesitan tener ninguna relación previa. No
        tienen que ser del mismo dueño, compartir usuarios ni ser subsidiarias. Basta con que ambas
        usen HiCloud y hayan activado Xlink.
      </Paragraph>
      <Alert type="info" showIcon message="Va incluido en todos los planes." style={{ marginBottom: 32 }} />

      <section id="activar">
        <Title level={3}>1. Activar la empresa</Title>
        <Paragraph>
          Todo empieza en la pestaña Activar. Un administrador de la empresa enciende el interruptor
          "Visible en el Directorio de HiCloud Xlink". Desde ese momento, otras empresas HiCloud
          pueden encontrarla y enviarle documentos, y ella puede enviar los suyos. Mientras no esté
          activada, la página muestra un aviso amarillo con el botón <Boton>Mostrar en el Directorio</Boton> y
          no se puede enviar ni recibir nada.
        </Paragraph>
        <Paragraph>
          Solo el administrador de esa empresa puede activarlo. Lo que cuenta es el rol que el
          usuario tiene en esa empresa, no su rol general. Las empresas en período de prueba no
          pueden aparecer en el directorio. La empresa se puede ocultar en cualquier momento; al
          hacerlo deja de enviar y recibir hasta que se vuelva a mostrar.
        </Paragraph>
      </section>

      <section id="directorio">
        <Title level={3}>2. Encontrar y vincular empresas en el Directorio</Title>
        <Paragraph>
          El Directorio de Empresas lista todas las empresas HiCloud que tienen Xlink activo. Se
          puede buscar por nombre o por RNC, y de cada empresa se ve su nombre, RNC e industria.
          Nunca se ve información interna ni datos de su operación.
        </Paragraph>
        <Paragraph>
          Junto a cada empresa aparecen dos columnas, "Proveedor relacionado" y "Cliente relacionado",
          que dicen qué relación tiene ya con ella:
        </Paragraph>
        <ul>
          <li>Si ya está registrada como cliente o proveedor con el mismo RNC, basta con pulsar <Boton>Vincular</Boton>.</li>
          <li>Si no existe, el botón <Boton>Crear proveedor</Boton> o <Boton>Crear cliente</Boton> la crea al instante con su nombre y RNC, ya vinculada.</li>
        </ul>
        <Paragraph>
          El filtro <Boton>Solo empresas que ya tengo registradas</Boton> muestra cuáles de los clientes y proveedores
          actuales ya están en HiCloud y listos para conectarse. Es la forma más rápida de descubrir
          con quién se puede empezar a intercambiar documentos desde el primer día.
        </Paragraph>
        <Paragraph>
          El vínculo usa un identificador interno único de cada empresa, no el RNC ni el nombre. Si
          la contraparte cambia su razón social o su nombre comercial, la conexión sigue funcionando.
        </Paragraph>
      </section>

      <section id="enviar">
        <Title level={3}>3. Enviar documentos</Title>
        <Paragraph>
          Se pueden enviar tres tipos de documento, y cada uno llega a la otra empresa como su
          equivalente:
        </Paragraph>
        <Table
          size="small"
          pagination={false}
          bordered
          style={{ marginBottom: 20, maxWidth: 620 }}
          dataSource={filasEquivalencia}
          columns={[
            { title: 'La empresa envía', dataIndex: 'envia' },
            { title: 'La otra empresa lo recibe como', dataIndex: 'recibe' },
          ]}
        />
        <Paragraph>
          <Text strong>Enviar uno a uno.</Text> En el detalle de cualquiera de esos documentos
          aparece el botón <Boton>Enviar por HiCloud Xlink</Boton>. Un clic y el documento llega en
          el acto a la otra empresa.
        </Paragraph>
        <Paragraph>
          <Text strong>Enviar en lote.</Text> En los listados de facturas, notas de crédito y
          órdenes de compra hay una columna Xlink que muestra si cada documento se envió, se recibió
          o se descartó. El filtro <Boton>Solo pendientes de enviar</Boton> deja a la vista lo que
          falta. Se marcan todos y se envían de una vez, con un contador que va mostrando cuántos
          salieron bien y cuántos tuvieron problemas. Cincuenta órdenes de compra a diez proveedores
          distintos se envían en segundos.
        </Paragraph>
        <Paragraph>Antes de enviar, el sistema verifica:</Paragraph>
        <ul>
          <li><Text strong>Facturas y notas de crédito:</Text> el e-CF tiene que estar aceptado (o aceptado con observaciones) por DGII. Uno rechazado o pendiente no se envía.</li>
          <li><Text strong>Facturas:</Text> tienen que ser a crédito.</li>
          <li><Text strong>Órdenes de compra:</Text> tienen que estar en estado Enviada y tener término de pago.</li>
          <li><Text strong>Todos:</Text> el documento no puede estar anulado, el cliente o proveedor tiene que estar vinculado, la otra empresa tiene que estar activa, y los totales tienen que cuadrar al centavo con las líneas guardadas. Un documento que no cuadra no sale.</li>
        </ul>
      </section>

      <section id="recibir">
        <Title level={3}>4. Recibir documentos</Title>
        <Paragraph>
          Cuando llega un documento, los administradores y contadores de la empresa receptora
          reciben una notificación en la campanita, y en el menú, junto a HiCloud Xlink, aparece un
          número con los pendientes.
        </Paragraph>
        <Paragraph>
          En la pestaña Por Procesar están todos los documentos recibidos que nadie ha trabajado
          todavía. Se pueden filtrar por período, empresa relacionada, número, NCF y tipo de
          documento. Con cada uno se puede:
        </Paragraph>
        <ul>
          <li><Text strong>Ver el PDF original</Text> tal como lo imprime la empresa que lo envió, con su formato, logo y diseño. Es como tener la factura física en la mano.</li>
          <li><Boton>Recibir</Boton>: se convierte automáticamente en el documento equivalente del sistema propio.</li>
          <li><Text strong>Abrir el formulario prellenado:</Text> muestra el documento que se generaría, ya lleno, para revisarlo o agregar detalles (centro de costo, observaciones) antes de grabarlo.</li>
          <li><Boton>Descartar</Boton>, indicando el motivo, si no corresponde.</li>
          <li><Text strong>Marcar como procesado</Text> sin generar nada, si ya se registró por otra vía y solo se quiere archivar.</li>
        </ul>
        <Paragraph>
          También se pueden recibir muchos documentos a la vez. En las facturas, que son fiscales,
          se escoge el tipo de gasto del 606 (01 a 11) y, si aplica, el tipo de retención de ISR. Se
          pueden aplicar a todos los seleccionados de un golpe, y luego se pulsa{' '}
          <Boton>Recibir documentos seleccionados</Boton>.
        </Paragraph>

        <Title level={4}>Qué genera cada documento recibido</Title>
        <Paragraph>
          Una factura recibida se convierte en una compra recibida por el mismo camino que una
          compra registrada a mano. Eso significa que:
        </Paragraph>
        <ul>
          <li>la mercancía entra al inventario y se actualiza el costo promedio</li>
          <li>si es a crédito, se crea la cuenta por pagar al proveedor</li>
          <li>se genera el asiento contable de la compra</li>
          <li>la compra aparece en el 606 del mes con el e-NCF del proveedor, el tipo de gasto elegido y la forma de pago</li>
        </ul>
        <Paragraph>
          Los productos marcados como servicio no mueven inventario. Si toda la factura es de
          servicios, el sistema pide escoger la cuenta de gasto donde se registra.
        </Paragraph>
        <Paragraph>
          Si la empresa ya tenía una orden de compra abierta a ese proveedor, la factura puede
          aplicarse sobre esa misma OC en vez de crear una compra nueva. La OC se completa con los
          datos de la factura, que es la que manda en lo fiscal, y queda recibida. Así no quedan
          órdenes colgadas ni compras duplicadas. Cuando la factura viene de una OC que salió por
          Xlink, el sistema propone esa OC automáticamente.
        </Paragraph>
        <Paragraph>Una nota de crédito recibida se convierte en una nota de crédito de proveedor.</Paragraph>
        <Paragraph>
          Una orden de compra recibida se convierte en una cotización en borrador para el vendedor,
          con los productos y cantidades del cliente, lista para preparar el pedido.
        </Paragraph>
      </section>

      <section id="homologacion">
        <Title level={3}>5. Homologación: el sistema aprende</Title>
        <Paragraph>
          Cada empresa llama a sus productos a su manera. El proveedor factura "GASOLINA PREMIUM 95"
          con su código, y el comprador tiene ese mismo producto como "Combustible 01". Xlink
          resuelve esto con la homologación.
        </Paragraph>
        <Paragraph>
          La primera vez que llega un producto que el sistema no reconoce, aparece una ventana que
          lista de una sola vez todo lo que falta por identificar. Para cada producto se puede:
        </Paragraph>
        <ul>
          <li>Escoger uno existente del catálogo propio.</li>
          <li>Crearlo al instante, con el nombre, la unidad y la tasa de ITBIS de la factura, y con el precio sugerido.</li>
        </ul>
        <Paragraph>
          Lo mismo aplica a unidades de medida, términos de pago, impuestos y retenciones. Cada
          respuesta queda guardada para siempre para esa empresa. La siguiente factura del mismo
          proveedor con los mismos productos se recibe sin preguntar nada. Con el uso, la recepción
          se vuelve automática.
        </Paragraph>
        <Paragraph>
          Los impuestos se exigen exactos: una línea al 16% nunca se registra como 18%, ni al revés.
          Si la tasa no coincide, el sistema no la acomoda en silencio; pide resolverlo.
        </Paragraph>
      </section>

      <section id="seguimiento">
        <Title level={3}>6. Seguimiento: saber qué pasó con lo que se envió</Title>
        <Paragraph>
          En la pestaña Documentos Enviados, la empresa emisora ve todo lo que ha publicado, con
          fecha, destinatario, quién lo envió y su estado:
        </Paragraph>
        <ul>
          <li><EstadoTag estado="pendiente" />: llegó al buzón de la otra empresa, pero aún no lo trabajan.</li>
          <li><EstadoTag estado="procesado" />: la otra empresa ya lo registró. Se ve hasta el número del documento que se generó del otro lado: su número de compra, de cotización o de nota de crédito.</li>
          <li><EstadoTag estado="descartado" />: la otra empresa lo rechazó, con el motivo.</li>
        </ul>
        <Paragraph>
          La misma trazabilidad queda en la auditoría del documento original. Quien dé seguimiento
          abre su factura u orden de compra y ve que fue recibida y qué documento generó, sin llamar,
          escribir por WhatsApp ni esperar un correo de confirmación.
        </Paragraph>
        <Paragraph>
          Un envío que la otra empresa todavía no ha procesado se puede eliminar si fue un error. Si
          la empresa emisora anula después un documento que ya envió, el envío pendiente queda
          marcado como anulado en el origen, y si ya se había procesado, se le avisa a la otra
          empresa.
        </Paragraph>
        <Paragraph>
          Del lado receptor, las pestañas Procesados y Descartados guardan el historial. Cualquier
          documento descartado o procesado se puede regresar a pendiente si hay que revisarlo de
          nuevo.
        </Paragraph>
      </section>

      <section id="protecciones">
        <Title level={3}>7. Protecciones que trabajan solas</Title>
        <Alert
          type="success"
          showIcon
          message={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>Nunca se registra dos veces lo mismo. Si se pulsa <Boton>Recibir</Boton> dos veces, o dos personas lo reciben al mismo tiempo, se crea un solo documento.</li>
              <li>El comprobante no se duplica. Si esa factura del proveedor (mismo RNC, mismo NCF) ya se había registrado a mano, el sistema no crea otra compra: avisa y la vincula con la existente. Esta misma protección cubre ahora todas las compras del sistema, no solo las que entran por Xlink, así que el 606 no sale con comprobantes repetidos.</li>
              <li>Cada empresa ve solo lo suyo. Una tercera empresa no puede ver, recibir, descartar ni abrir el PDF de documentos que no le pertenecen.</li>
              <li>Solo pasan documentos fiscales válidos. No viaja ninguna factura que DGII no haya aceptado.</li>
            </ul>
          }
        />
      </section>

      <section id="limitaciones">
        <Title level={3}>8. Qué no hace todavía</Title>
        <Alert
          type="warning"
          showIcon
          message={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li><Text strong>Notas de débito:</Text> no se pueden enviar, porque HiCloud aún no tiene nota de débito del lado de proveedores.</li>
              <li><Text strong>Solicitudes de compra y cotizaciones a proveedores</Text> (el flujo de RFQ): no viajan por Xlink.</li>
              <li><Text strong>Facturas sobre órdenes recibidas parcialmente:</Text> se registran como compra nueva.</li>
              <li><Text strong>No sustituye al e-CF.</Text> La factura electrónica sigue siendo lo que vale ante DGII; Xlink es lo que le entrega esa misma factura a la otra empresa, dentro de su sistema y lista para usar.</li>
            </ul>
          }
        />
      </section>

      <section id="resumen">
        <Title level={3}>En una frase</Title>
        <Alert
          type="info"
          style={{ fontSize: 15, lineHeight: 1.7 }}
          message={
            <>
              La factura electrónica le informa a DGII que hubo una venta. HiCloud Xlink hace que esa
              venta aparezca registrada, como compra, en el sistema del cliente, con inventario,
              cuenta por pagar, asiento y 606 incluidos, y le avisa a quien la envió cuándo se
              registró.
            </>
          }
        />
      </section>
    </>
  );
}
