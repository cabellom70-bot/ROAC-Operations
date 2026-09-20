# Pruebas locales

Desde la raiz del proyecto:

```powershell
npm run lint
npm run build
node tests/atomic-client.test.mjs
npm ci --prefix tests/database --ignore-scripts
node tests/database/maintenance.test.mjs
node tests/database/fault-operations.test.mjs
```

Las pruebas usan datos ficticios locales en PGlite, sin credenciales ni acceso a produccion. Comprueban reversiones, permisos, estados incompatibles y solicitudes duplicadas. No sustituyen pruebas de varias conexiones PostgreSQL simultaneas ni de notificaciones en telefonos reales.
