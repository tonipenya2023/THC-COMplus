# Traspaso: Habilidades y Estadisticas

## Objetivo

HECHO COMPROBADO: completar el mismo circuito que ya se usa en perfil/logros para estas secciones:

- `https://www.thehunter.com/#profile/nefastix13/skills`
- `https://www.thehunter.com/#profile/nefastix13/skills/weapons`
- `https://www.thehunter.com/#profile/nefastix13/statistics`
- `https://www.thehunter.com/#profile/nefastix13/statistics/history`
- `https://www.thehunter.com/#profile/nefastix13/statistics/best`

HECHO COMPROBADO: el circuito requerido es:

1. Interceptar URL/seccion oficial.
2. Localizar solo el bloque interno de datos de esa seccion.
3. Capturar los datos antes de ocultar el bloque.
4. Crear tablas SQL.
5. Enviar payload a la API.
6. Insertar en SQL desde la API.
7. Sustituir solo ese bloque interno por un iframe Grafana.

## Alcance Autorizado

HECHO COMPROBADO: las tablas de habilidades deben llamarse `ui.perfil_habil_*`.

HECHO COMPROBADO: las tablas de estadisticas deben llamarse `ui.perfil_estadis_*`.

HECHO COMPROBADO: no hay que tocar los paneles Grafana hasta que el usuario entregue sus URLs.

NO COMPROBADO: las URLs finales de Grafana para habilidades y estadisticas no estan entregadas.

## Estado Actual En UI

HECHO COMPROBADO: `src/content.js` ya contiene deteccion parcial de estas secciones:

- `PROFILE_SKILL_SECTIONS = new Set(['species', 'weapons'])`
- `PROFILE_STATISTICS_SECTIONS = new Set(['lifetime', 'history', 'best'])`

HECHO COMPROBADO: `src/content.js` tiene mapas Grafana vacios:

- `GRAFANA_PROFILE_SKILLS_DASHBOARD_URLS = {}`
- `GRAFANA_PROFILE_STATISTICS_DASHBOARD_URLS = {}`

HECHO COMPROBADO: `src/content.js` ya llama a `mountProfileGenericRows(...)` para `skills` y `statistics`.

HECHO COMPROBADO: esa implementacion generica no esta cerrada ni probada funcionalmente.

NO COMPROBADO: no esta comprobado que el selector `findProfileGenericRowsContainer(kind)` localice el bloque interno correcto en la web oficial.

## Trabajo Pendiente En UI

HECHO COMPROBADO: hay que revisar y cerrar estos puntos en `src/content.js`:

- URL `#profile/<usuario>/skills` debe mapear a seccion `species`.
- URL `#profile/<usuario>/skills/weapons` debe mapear a seccion `weapons`.
- URL `#profile/<usuario>/statistics` debe mapear a seccion `lifetime`.
- URL `#profile/<usuario>/statistics/history` debe mapear a seccion `history`.
- URL `#profile/<usuario>/statistics/best` debe mapear a seccion `best`.

HECHO COMPROBADO: el orden correcto al montar es capturar primero y ocultar despues.

HECHO COMPROBADO: para no repetir el fallo de logros, el selector debe apuntar al bloque interno de datos, no al contenedor general del perfil ni a las pestanas.

NO COMPROBADO: si `readProfileGenericRows(...)` sirve para todas las estructuras reales. Debe validarse viendo el DOM real de cada URL.

## Trabajo Pendiente En API

NO COMPROBADO: no esta comprobado el estado actual exacto de la API en este traspaso.

HECHO COMPROBADO: el endpoint usado por UI actualmente es `http://127.0.0.1:8080/api/profile-vision-gral`.

HECHO COMPROBADO: si se reutiliza ese endpoint, la API debe distinguir payloads por `kind`:

- `kind = "skills"`
- `kind = "statistics"`

HECHO COMPROBADO: si se crean endpoints nuevos, hay que cambiar tambien `src/content.js`.

NO COMPROBADO: no esta decidido si conviene endpoint unico o endpoints separados.

## Tablas SQL A Crear

HECHO COMPROBADO: nombres minimos esperados por convencion solicitada:

- `ui.perfil_habil_species`
- `ui.perfil_habil_weapons`
- `ui.perfil_estadis_lifetime`
- `ui.perfil_estadis_history`
- `ui.perfil_estadis_best`

NO COMPROBADO: si alguna URL necesita mas de una tabla. Debe decidirse solo al ver la estructura real de datos.

HECHO COMPROBADO: si una URL requiere mas de una tabla, hay que documentarlo al usuario al final.

## Pruebas Necesarias Para Cerrar

HECHO COMPROBADO: lectura de codigo o `node --check` no cierran la tarea.

HECHO COMPROBADO: para cerrar cada URL hace falta prueba funcional:

- abrir la URL oficial;
- confirmar que desaparece solo el bloque interno original;
- confirmar que aparece el iframe Grafana cuando exista URL;
- confirmar que la API recibe payload;
- confirmar que SQL contiene filas en la tabla correspondiente.

NO COMPROBADO: hasta hacer esas pruebas, el estado correcto de cada URL debe marcarse como no comprobado.

## Advertencia Importante

HECHO COMPROBADO: el usuario no quiere que se sustituyan cabeceras, perfil completo, navegacion ni laterales.

HECHO COMPROBADO: solo debe sustituirse el bloque interno de datos de la seccion oficial.

HECHO COMPROBADO: no se deben inventar paneles Grafana ni URLs Grafana.

HECHO COMPROBADO: no se deben ampliar cambios fuera de habilidades y estadisticas salvo que sea imprescindible y se indique.
