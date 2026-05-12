const axios = require('axios');

const API = 'http://localhost:3000/api/v1';

const CUENTAS = [
  { email: 'admin@hicloud.com',        password: 'HiVGBNxRbFCdg767' },
  { email: 'admin@hicloudrd.com',      password: 'HiVGBNxRbFCdg767' },
  { email: 'valdezsamuel03@gmail.com', password: 'HiVGBNxRbFCdg767' },
];

async function main() {
  console.log('\n=== TEST DE LOGIN — HiCloud ERP ===\n');

  for (const cuenta of CUENTAS) {
    try {
      const res = await axios.post(API + '/auth/login', cuenta, { timeout: 8000 });
      const d   = res.data && res.data.data ? res.data.data : res.data;

      console.log('✅ ' + cuenta.email);
      console.log('   role:          ' + (d.user && d.user.role));
      console.log('   empresaActual: ' + (d.empresaActual !== undefined ? d.empresaActual : 'ninguna'));
      console.log('   empresas:      ' + (d.empresas ? d.empresas.length : 0));
      console.log('   token:         ' + (d.accessToken ? d.accessToken.slice(0, 40) + '...' : 'NO TOKEN'));

      if (d.accessToken) {
        const empresaId = d.empresaActual || (d.empresas && d.empresas[0] && d.empresas[0].empresaId);

        if (empresaId) {
          try {
            const users = await axios.get(API + '/users', {
              headers: {
                Authorization:  'Bearer ' + d.accessToken,
                'X-Empresa-ID': String(empresaId),
              },
              timeout: 8000,
            });
            const ud    = users.data && users.data.data ? users.data.data : users.data;
            const lista = Array.isArray(ud) ? ud : (ud && ud.data ? ud.data : []);
            console.log('   usuarios en empresa #' + empresaId + ': ' + lista.length);
            lista.forEach(function(u) {
              console.log('     → [' + u.role + '] ' + u.nombre + ' <' + u.email + '> activo=' + u.isActive);
            });
          } catch (ue) {
            console.log('   /users → ' + (ue.response ? ue.response.status + ' ' + JSON.stringify(ue.response.data) : ue.message));
          }
        } else {
          console.log('   sin empresa asignada — omitiendo /users');
        }
      }
    } catch (e) {
      const msg = e.response && e.response.data
        ? (e.response.data.message || JSON.stringify(e.response.data))
        : e.message;
      console.log('❌ ' + cuenta.email + ' → ' + msg);
    }
    console.log('');
  }
}

main();
