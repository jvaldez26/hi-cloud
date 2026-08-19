#!/usr/bin/env node
/**
 * validate-entity-types.js
 *
 * Detecta columnas TypeORM con tipo unión (T | null / T | undefined) sin
 * type: explícito en el decorador @Column.
 *
 * PROBLEMA:
 *   TypeORM 0.3.x usa reflect-metadata para inferir el tipo de una columna.
 *   Para propiedades con union types ("string | null", "Date | null", etc.),
 *   TypeScript emite design:type = Object (no String/Date/Number).
 *   TypeORM no puede mapear "Object" a un tipo PostgreSQL → lanza
 *   DataTypeNotSupportedError en AppDataSource.initialize() al arrancar.
 *
 * SOLUCIÓN:
 *   Siempre agregar type: explícito al @Column cuando el tipo incluye
 *   | null o | undefined:
 *     @Column({ type: 'varchar',     nullable: true })   // string | null
 *     @Column({ type: 'int',         nullable: true })   // number | null
 *     @Column({ type: 'timestamptz', nullable: true })   // Date   | null
 *     @Column({ type: 'boolean',     nullable: true })   // boolean| null
 *
 * CASOS QUE CAPTURA:
 *   prop: string | null      ← CON o SIN ! o ?
 *   prop!: number | null
 *   prop?: Date | null
 *   prop: boolean | undefined
 *   prop: SomeType | null    ← cualquier tipo, no solo los primitivos
 *
 * CASOS QUE IGNORA (correctamente):
 *   @Column({ type: 'integer', nullable: true }) embarqueId: number | null;
 *   @Column({ type: 'timestamptz', nullable: true }) aplicadoAt: Date | null;
 *   // → tienen type: explícito → OK
 *
 * Uso:
 *   node scripts/validate-entity-types.js
 *
 * Exit code:
 *   0 — todas las entidades OK
 *   1 — hay columnas problemáticas
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Recolectar archivos .entity.ts ────────────────────────────────────────────

function walk(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      results.push(...walk(full));
    } else if (entry.endsWith('.entity.ts')) {
      results.push(full);
    }
  }
  return results;
}

// ── Patrones ──────────────────────────────────────────────────────────────────

// Detecta "| null" o "| undefined" en la línea — el tipo de unión problemático.
const UNION_NULL = /\|\s*(null|undefined)\b/;

// Detecta que la línea parece una declaración de propiedad (no un comentario,
// no una línea de type alias, no una firma de método).
// Captura: ident[?!]: type, con acceso opcional (public/private/protected/readonly).
const PROP_DECL = /^\s*(?:(?:public|private|protected|readonly|abstract)\s+)*[a-zA-Z_$][\w$]*\s*[?!]?\s*:/;

// ── Escaneo ───────────────────────────────────────────────────────────────────

const bad = [];

for (const file of walk(path.join(__dirname, '..', 'src'))) {
  const raw   = fs.readFileSync(file, 'utf8');
  const lines = raw.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 1. ¿La línea tiene "| null" o "| undefined"?
    if (!UNION_NULL.test(line)) continue;

    // 2. ¿La línea parece una declaración de propiedad?
    if (!PROP_DECL.test(line)) continue;

    // 3. Ignorar líneas de comentario.
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

    // 4. Escanear hacia atrás para recolectar TODO el stack de decoradores de
    //    esta propiedad (máx 25 líneas). Parar cuando topamos con otra propiedad.
    let columnIdx    = -1;
    let stackStart   = i; // primer índice del stack completo (para revisar FK)
    for (let j = i - 1; j >= Math.max(0, i - 25); j--) {
      const prev = lines[j];

      if (prev.includes('@Column(')) {
        columnIdx  = j;
        stackStart = j;    // seguir hacia arriba para buscar @ManyToOne
        // Continuar buscando por si hay decoradores FK encima del @Column
        for (let k = j - 1; k >= Math.max(0, j - 8); k--) {
          const above = lines[k].trim();
          if (above.startsWith('@')) {
            stackStart = k;
          } else if (above !== '' && !above.startsWith('//') && !above.startsWith('*')) {
            break;  // llegamos a código no-decorador
          }
        }
        break;
      }

      // Si topamos con otra declaración de propiedad (no un decorador),
      // significa que nos pasamos — parar.
      const pt = prev.trim();
      if (
        pt !== '' &&
        !pt.startsWith('@') &&
        !pt.startsWith('//') &&
        !pt.startsWith('*') &&
        !pt.startsWith('/') &&
        PROP_DECL.test(pt) &&
        !pt.includes('=>')      // evitar confundir arrow functions
      ) {
        break;
      }
    }

    // Sin @Column asociado → no es un problema de TypeORM
    if (columnIdx === -1) continue;

    // 5. Recolectar todo el texto del bloque @Column (desde su inicio hasta la
    //    línea anterior a la propiedad) y verificar si tiene type: explícito.
    const decoratorBlock = lines.slice(columnIdx, i).join('\n');
    if (decoratorBlock.includes('type:')) continue;  // tiene type: → OK

    // 6. Verificar si este es un FK column.
    //
    //    Patrón A — decoradores FK en el mismo stack (propiedad con @ManyToOne/@JoinColumn):
    const fullStack = lines.slice(stackStart, i).join('\n');
    if (
      fullStack.includes('@ManyToOne(') ||
      fullStack.includes('@OneToOne(')  ||
      fullStack.includes('@JoinColumn(')
    ) {
      continue;  // FK column — TypeORM infiere el tipo desde la relación
    }

    //    Patrón B — "mirror FK column" (e.g. `cerradoPorId!: number | null`).
    //    Ocurre cuando la relación va en una propiedad separada y el FK ID
    //    se expone como un @Column scalar. TypeORM resuelve el tipo entero
    //    del FK desde el @JoinColumn({ name: 'cerradoPorId' }) de la otra propiedad.
    //    Detectar: el archivo tiene @JoinColumn con el nombre de esta propiedad.
    const propName = trimmed.match(/^[a-zA-Z_$][\w$]*/)?.[0] ?? '';
    if (
      propName &&
      (raw.includes(`name: '${propName}'`) || raw.includes(`name: "${propName}"`))
    ) {
      continue;  // mirror FK column — TypeORM infiere el tipo desde la relación
    }

    bad.push(`${file}:${i + 1}:\n     ${trimmed}`);
  }
}

// ── Resultado ─────────────────────────────────────────────────────────────────

if (bad.length > 0) {
  console.error('');
  console.error('❌ @Column con tipo unión (T | null / T | undefined) sin type: explícito:');
  console.error('');
  bad.forEach(b => console.error(`  ✗ ${b}`));
  console.error('');
  console.error('CAUSA: TypeORM 0.3.x + reflect-metadata emite Object (no el tipo concreto)');
  console.error('para propiedades con tipos unión. Resultado: DataTypeNotSupportedError al');
  console.error('inicializar AppDataSource — el servidor no arranca.');
  console.error('');
  console.error('SOLUCIÓN — agregar type: explícito en el @Column:');
  console.error('  string | null   →  @Column({ type: \'varchar\',     nullable: true })');
  console.error('  number | null   →  @Column({ type: \'int\',         nullable: true })');
  console.error('  Date   | null   →  @Column({ type: \'timestamptz\', nullable: true })');
  console.error('  boolean| null   →  @Column({ type: \'boolean\',     nullable: true })');
  console.error('  text   | null   →  @Column({ type: \'text\',        nullable: true })');
  console.error('');
  process.exit(1);
}

console.log('✅ Entidades OK — ningún @Column con tipo unión sin type: explícito');
process.exit(0);
