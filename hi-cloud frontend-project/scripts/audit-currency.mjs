/**
 * audit-currency.mjs
 * Verifica que el módulo super-admin no mezcle monedas (USD vs DOP).
 * Correr: node scripts/audit-currency.mjs
 * CI: agregar al pipeline como paso después del build.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', 'src');
const SUPER_ADMIN_DIR = join(ROOT, 'pages', 'super-admin');

// ── Pantallas donde DOP es CORRECTO (lista blanca explícita) ─────────────────
// Si una pantalla muestra límites de ingresos del cliente o ingresos del tenant → DOP ✅
const DOP_WHITELIST_PATTERNS = [
  // Subtítulo de KPI de facturas del mes (ingresos del cliente, no del SaaS)
  /montoFacturasMes/,
  // Configuración regional del sistema
  /Moneda local/,
  /Peso Dominicano/,
  // Límite de ingresos del plan (lo que la empresa factura a SUS clientes)
  /limiteIngresos/,
  /ingresosMes.*Dop/i,
  /ingresosMesActualDop/i,
];

// ── Reglas ────────────────────────────────────────────────────────────────────
const RULES = [
  {
    id:  'no-rd-in-subscription-context',
    desc: 'RD$ en contexto de suscripción/precio de plan (debe ser US$)',
    // Detecta RD$ que aparezca junto a palabras de suscripción
    pattern: /RD\$[^'"`\n]*(?:mes|plan|suscri|precio|mrr|arr|descuento)/i,
    whitelist: DOP_WHITELIST_PATTERNS,
    severity: 'error',
  },
  {
    id:  'no-bare-dollar-sign',
    desc: 'Símbolo $ aislado en UI (ambiguo — usar US$ o RD$ explícito)',
    // Detecta `$X` en template literals de display, no variables/regex/JS
    pattern: /`\$[\d,]+/,
    // Permitir: regex de validación RNC/cédula, variables JS, template vars ${}
    whitelist: [/pattern.*\$/, /regex/, /\/\^.*\$/, /tickFormatter/, /addonBefore/],
    severity: 'warning',
  },
  {
    id:  'no-fmt-money-legacy',
    desc: 'Uso de fmtMoney (función legacy eliminada) — usar fmtUsd o fmtDop',
    pattern: /\bfmtMoney\s*\(/,
    whitelist: [],
    severity: 'error',
  },
  {
    id:  'no-hardcoded-exchange-rate',
    desc: 'Conversión hardcoded DOP→USD (ej: / 58.5) — usar mrrUsd del backend',
    pattern: /ingresosRD\s*\/\s*[\d.]+/,
    whitelist: [],
    severity: 'error',
  },
  {
    id:  'fmtusd-missing-prefix',
    desc: 'fmtUsd definida sin prefijo "US$" — la función debe retornar "US$ X.XX"',
    // Si hay una definición de fmtUsd que no incluye "US$" en el return
    pattern: /function fmtUsd[\s\S]{0,200}return `(?!US\$)/,
    whitelist: [],
    severity: 'error',
  },
];

// ── Utilidades ────────────────────────────────────────────────────────────────
function walkDir(dir) {
  const entries = [];
  try {
    for (const f of readdirSync(dir)) {
      const full = join(dir, f);
      const stat = statSync(full);
      if (stat.isDirectory()) entries.push(...walkDir(full));
      else if (f.endsWith('.tsx') || f.endsWith('.ts')) entries.push(full);
    }
  } catch { /* dir puede no existir */ }
  return entries;
}

function checkFile(filePath, rules) {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const findings = [];

  for (const rule of rules) {
    lines.forEach((line, idx) => {
      if (!rule.pattern.test(line)) return;
      // Verificar lista blanca
      if (rule.whitelist.some(w => w.test(line))) return;
      findings.push({
        rule: rule.id,
        severity: rule.severity,
        desc: rule.desc,
        file: relative(join(__dirname, '..'), filePath),
        line: idx + 1,
        text: line.trim().slice(0, 120),
      });
    });
  }

  return findings;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const files = walkDir(SUPER_ADMIN_DIR);
let errors = 0;
let warnings = 0;
const allFindings = [];

for (const file of files) {
  allFindings.push(...checkFile(file, RULES));
}

if (allFindings.length === 0) {
  console.log('\n✅  Auditoría de monedas PASÓ — sin problemas en super-admin.\n');
  process.exit(0);
}

for (const f of allFindings) {
  const icon = f.severity === 'error' ? '❌' : '⚠️ ';
  console.log(`${icon} [${f.rule}] ${f.file}:${f.line}`);
  console.log(`   ${f.desc}`);
  console.log(`   → ${f.text}`);
  console.log();
  if (f.severity === 'error') errors++;
  else warnings++;
}

console.log(`Resultado: ${errors} errores, ${warnings} advertencias en ${files.length} archivos.\n`);

// Solo falla CI en errores (no warnings)
if (errors > 0) {
  console.log('💡 Reglas de oro: suscripción/plan/MRR/ARR = USD (US$). Ingresos cliente/límite plan = DOP (RD$).\n');
  process.exit(1);
}
process.exit(0);
