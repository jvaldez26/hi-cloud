/**
 * Ningún <button> dentro de un <Form> sin type="button".
 *
 * El bug: en la cotización, los botones de c/ITBIS ÷ s/ITBIS eran <button> sin
 * `type`. El default de HTML es "submit", y viven dentro del <Form> de antd —que
 * renderiza un <form> real— así que cambiar de modo ENVIABA el formulario: la
 * cotización se guardaba a medio editar y la pantalla se cerraba.
 *
 * Es de la peor especie: no falla al escribirlo, no avisa, y cuando ocurre
 * parece que el usuario hizo algo mal. Y vuelve cada vez que alguien mete un
 * <button> estilizado en un formulario, que es lo normal cuando antd <Button> no
 * da el aspecto que se busca.
 *
 * Lo natural sería la regla eslint react/button-has-type, pero el frontend no
 * tiene configuración de eslint. Esto cubre el caso concreto que duele.
 *
 * `npm run verificar:botones`
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = 'src';

const listar = (dir, acc = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) listar(ruta, acc);
    else if (e.name.endsWith('.tsx')) acc.push(ruta);
  }
  return acc;
};

const culpables = [];

for (const ruta of listar(RAIZ)) {
  const lineas = readFileSync(ruta, 'utf8').split('\n');
  let dentroDeForm = 0;

  lineas.forEach((linea, i) => {
    // Se cuenta la apertura ANTES de mirar el botón y el cierre después, para
    // que un <button> en la misma línea que <Form> cuente como dentro.
    if (/<Form[\s>]|<Form$/.test(linea)) dentroDeForm++;

    if (dentroDeForm > 0 && /<button[\s>]/.test(linea) && !/type=/.test(linea)) {
      // El type puede venir en la línea siguiente cuando el JSX va partido.
      const siguientes = lineas.slice(i, i + 6).join(' ');
      if (!/type=\s*["'{]/.test(siguientes)) {
        culpables.push(`${ruta}:${i + 1} → ${linea.trim().slice(0, 90)}`);
      }
    }

    if (/<\/Form>/.test(linea) && dentroDeForm > 0) dentroDeForm--;
  });
}

console.log('\n<button> dentro de <Form> sin type="button"\n');
if (culpables.length === 0) {
  console.log('  ✓ ninguno');
  console.log('\n1/1 correctas');
} else {
  culpables.forEach(c => console.log(`  ✗ ${c}`));
  console.error(
    `\n${culpables.length} boton(es) enviarian el formulario al pulsarlos.` +
    `\nAnade type="button" — el default de HTML es "submit".`,
  );
  process.exit(1);
}
