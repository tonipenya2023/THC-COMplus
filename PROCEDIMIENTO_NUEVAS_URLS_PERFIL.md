# Procedimiento para anadir nuevas URLs de perfil

## Alcance

HECHO COMPROBADO: este documento describe el circuito usado entre:

- UI: `C:\_MisProyectos\THC-UICOMP+`
- API: `C:\_MisProyectos\THC-API`
- Endpoint actual: `http://127.0.0.1:8080/api/profile-vision-gral`

NO COMPROBADO: las URLs Grafana futuras hasta que el usuario las entregue.

## Regla principal

HECHO COMPROBADO: una nueva URL debe seguir siempre este orden:

1. Interceptar hash oficial.
2. Esperar al bloque oficial real.
3. Capturar datos antes de insertar loader o iframe.
4. Enviar payload a THC-API.
5. Sustituir solo el bloque interno correcto.
6. Renderizar iframe con el layout comun.
7. Probar en navegador, API y SQL.

HECHO COMPROBADO: no se debe sustituir el perfil completo, cabecera, menu, tabs, laterales ni `#profile-ribbon`.

## UI: puntos a tocar

HECHO COMPROBADO: el enrutado principal esta en `src/content.js`:

- `PROFILE_HASH_PATTERN`
- constantes de secciones permitidas
- `handleUrlChange()`
- funcion `mountProfile...`
- funcion `findProfile...Container()`
- funcion `buildProfile...Payload()`
- funcion de guardado `saveProfile...`
- funcion `renderProfile...DashboardFrame()`
- funcion `buildProfile...DashboardUrl()`

HECHO COMPROBADO: si no hay URL Grafana todavia, el mapa Grafana debe quedar vacio y el render debe mostrar el mismo estado comun `Dashboard pendiente de configurar.`

## Iframe y zona visual

HECHO COMPROBADO: las zonas iframe deben usar el patron comun:

- `showProfileDashboardLoading(host, loaderHtml, 'vision-general')`
- `renderProfileDashboardLayout(...)`
- clase `thc-profile-dashboard-inline`
- atributo `data-thc-profile-dashboard="vision-general"`

HECHO COMPROBADO: el host debe ser el bloque interno oficial de datos:

- rangos: `.ranks-content`
- logros: `.achievements-content`
- habilidades: `.skills-content`
- estadisticas: `.statistics-content`

HECHO COMPROBADO: `findProfileDashboardHost()` debe reconocer el contenedor oficial de la seccion.

HECHO COMPROBADO: queda prohibido ocultar `#profile-ribbon`.

HECHO COMPROBADO: queda prohibido recrear la imagen del rango del cazador dentro del iframe si ya existe en la pagina oficial.

HECHO COMPROBADO: no debe usarse margen negativo ni ancho ampliado que invada la columna del rango del cazador.

## Captura de datos

HECHO COMPROBADO: el payload debe construirse antes de llamar a `showProfileDashboardLoading(...)`, porque esa funcion reemplaza el DOM del bloque.

Ejemplo correcto:

```js
const payload = buildProfileXPayload(username, section, target);
showProfileDashboardLoading(host, loaderHtml, 'vision-general');
saveProfileX(payload).finally(() => {
  host.innerHTML = renderProfileXDashboardFrame(username, section);
});
```

HECHO COMPROBADO: si se construye el payload despues del loader, se pierden datos.

## Interceptacion intermitente

HECHO COMPROBADO: la SPA oficial puede pintar el DOM despues del cambio de hash.

HECHO COMPROBADO: si el bloque no aparece dentro de los intentos, debe permitirse reintento posterior; no bloquear permanentemente por `lastHash`.

HECHO COMPROBADO: el observer de logros debe evitar duplicados solo cuando ya existe `.thc-profile-dashboard-inline[data-thc-profile-dashboard="vision-general"]`.

## Parsers

HECHO COMPROBADO: no todos los logros tienen la misma estructura.

HECHO COMPROBADO: logros con niveles usan:

- `.achievement-info`
- `.achievement-info-holder td`
- `row_type: 'achievement_level'`
- `level_order`
- `level_value`
- `group_title`
- `completed`
- `in_progress`
- `progress_value`
- `progress_target`
- `progress_pct`

HECHO COMPROBADO: `logros/resumen` requiere parser especifico:

- `row_type: 'category_progress'`
- `row_type: 'latest'`
- `row_type: 'statistic'`

HECHO COMPROBADO: `logros/desafios` puede requerir parser especifico si el DOM no usa estructura de niveles.

NO COMPROBADO: que una URL nueva comparta parser con otra hasta ver su DOM real.

## API

HECHO COMPROBADO: THC-API ya enruta en `source/thc_api.py` por el contenido del payload.

HECHO COMPROBADO: para payloads genericos se usa:

- `kind = "skills"`
- `kind = "statistics"`
- `section`
- `rows`

HECHO COMPROBADO: el guardado generico esta en `save_profile_generic_rows(...)`.

HECHO COMPROBADO: el guardado de logros esta en `save_profile_logros(...)`.

HECHO COMPROBADO: antes de modificar API hay que comprobar si ya existe mapa de tablas y ruta de guardado.

## SQL

HECHO COMPROBADO: si una URL necesita mas de una tabla, el usuario autorizo crear mas de una tabla.

HECHO COMPROBADO: tablas de habilidades:

- `ui.perfil_habil_species`
- `ui.perfil_habil_weapons`

HECHO COMPROBADO: tablas de estadisticas:

- `ui.perfil_estadis_lifetime`
- `ui.perfil_estadis_history`
- `ui.perfil_estadis_best`

HECHO COMPROBADO: el SQL versionable creado para estas tablas esta en THC-API.

HECHO COMPROBADO: las tablas deben coincidir con las columnas que inserta la API. Si se anaden campos al payload, se deben anadir tambien a:

- `CREATE TABLE`
- `INSERT INTO`
- `ON CONFLICT DO UPDATE`
- SQL versionable

## Pruebas obligatorias

HECHO COMPROBADO: `node --check src/content.js` solo prueba sintaxis.

HECHO COMPROBADO: `ast.parse` o `py_compile` solo prueban sintaxis Python.

HECHO COMPROBADO: para cerrar una URL hace falta prueba funcional:

1. Abrir URL oficial.
2. Confirmar que el addon intercepta.
3. Confirmar que solo se sustituye el bloque interno correcto.
4. Confirmar que `#profile-ribbon` sigue visible.
5. Confirmar que aparece iframe o estado comun si falta URL Grafana.
6. Confirmar POST recibido por THC-API.
7. Confirmar filas en tabla SQL esperada.
8. Confirmar que Grafana lee datos cuando exista panel.

NO COMPROBADO: una URL nueva sin estas pruebas.

## Prohibiciones

HECHO COMPROBADO: no modificar scripts SQL no relacionados.

HECHO COMPROBADO: no reformatear SQL existente.

HECHO COMPROBADO: no inventar URLs Grafana.

HECHO COMPROBADO: no tocar paneles Grafana hasta que el usuario entregue URLs.

HECHO COMPROBADO: no cambiar el layout comun de iframe sin comprobar que no rompe las URLs ya funcionando.
