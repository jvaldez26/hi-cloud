<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Base de pruebas local (`hicloud_test`)

**No corras `npm run migration:run` desde cero contra un Postgres vacío —
va a fallar.** El sistema de migraciones tiene un `Baseline` (ver
`docs/deuda-tecnica-migraciones.md`) que asume que el esquema de antes de
julio 2026 ya existe; no lo crea. Para tener una base de pruebas local que
sí funcione:

1. **Instalá Postgres localmente** (versión 18, para matchear producción —
   `winget install PostgreSQL.PostgreSQL.18` en Windows). Anotá el usuario y
   contraseña que le pongas; no reutilices ninguna de producción.

2. **Extraé el esquema (sin datos) de producción, en solo lectura:**
   ```bash
   PGPASSWORD="<DB_PASSWORD de producción>" pg_dump \
     -h <DB_HOST de producción> -p <DB_PORT> -U <DB_USERNAME> -d <DB_NAME> \
     --schema-only --no-owner --no-privileges --no-comments \
     -f prod-schema-only.sql
   ```
   Esto es una lectura de metadatos (`information_schema`/catálogos), no
   toca datos ni escribe nada en producción. **Nunca commitees este
   archivo** — bórralo cuando termines.

3. **Creá `hicloud_test` y restaurá el dump:**
   ```bash
   psql -h 127.0.0.1 -p <puerto local> -U postgres -c "CREATE DATABASE hicloud_test;"
   psql -h 127.0.0.1 -p <puerto local> -U postgres -d hicloud_test \
     -v ON_ERROR_STOP=1 -f prod-schema-only.sql
   ```

4. **Marcá todas las migraciones existentes como ya aplicadas** (el dump ya
   refleja su efecto acumulado — si TypeORM intentara re-ejecutarlas,
   muchas fallarían por columnas/tablas duplicadas):
   ```bash
   npm run build   # necesario: dist/data-source.js debe existir
   node -e "
     const fs = require('fs');
     const rows = fs.readdirSync('src/migrations')
       .filter(f => f.endsWith('.ts'))
       .map(f => {
         const ts = f.match(/^(\d+)-/)[1];
         const name = fs.readFileSync('src/migrations/'+f,'utf8').match(/name = '([^']+)'/)[1];
         return { ts, name };
       })
       .sort((a,b) => a.ts - b.ts);
     console.log(rows.map(r => \`(\${r.ts}, '\${r.name}')\`).join(',\n'));
   "
   # Pegá el resultado en un INSERT INTO typeorm_migrations (timestamp, name) VALUES ...
   # contra hicloud_test (la tabla la crea sola el primer intento de runMigrations).
   ```

5. **Guardá esas credenciales en `.env.test.local`** (ya está en
   `.gitignore` — nunca se commitea) y usalo para apuntar el backend a
   `hicloud_test` SIN tocar el `.env` real:
   ```bash
   cp .env .env.prod.bak        # respaldo del .env real
   cp .env.test.local .env      # swap a hicloud_test
   npm run start:dev            # (o npx jest / npx playwright test, etc.)
   # ... al terminar, SIEMPRE restaurar: ...
   cp .env.prod.bak .env
   ```
   `data-source.ts`/`main.ts` cargan siempre `.env` a secas (no hay
   `NODE_ENV` switching de archivo), por eso el swap es literal y no una
   variable de entorno de sesión. Verificá dos veces con
   `SELECT current_database()` antes de correr nada destructivo — es fácil
   confundirse de sesión y terminar contra producción.

6. A partir de aquí, `npm run migration:run` (o `AppDataSource.runMigrations()`)
   contra `hicloud_test` solo corre migraciones *nuevas* que agregues — el
   historial existente ya quedó marcado en el paso 4.

Por qué este rodeo y no simplemente "correr las 179 migraciones desde
cero": ver `docs/deuda-tecnica-migraciones.md`.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
