# GymBro

La app se llama **GymBro** (antes "Gym Log"). Por compatibilidad con datos ya guardados, siguen con el nombre
viejo y **no se cambian**: la base `gym-log-v2`, el formato de copia `gym-log-backup/v2` y la clave `gl-aspecto`.

App de entrenamiento personal del dueño: planes por día, registro de series, wellness, otras actividades,
calendario y progreso. PWA en React que guarda todo en el dispositivo (IndexedDB). Sin backend ni cuentas.
La usa él en Android; a lo sumo la comparte con alguien más. No es un producto para vender.

Estado y pendientes: `PROJECT_STATUS.md`. Por qué cada cosa es como es: `docs/DECISIONES.md`.

## Comandos

```bash
npm install
npm run dev          # desarrollo en http://localhost:5173
npm run build        # typecheck + compila a dist/
npm run typecheck
npm run seed         # regenera src/seed.json, src/seed-historial.json y data/*.json (solo en la PC del dueño)
npm run test:e2e     # requiere dist/ y: pip install playwright && playwright install chromium
```

Antes de dar algo por terminado: `npm run build && npm run test:e2e`. Las 103 verificaciones tienen que pasar
y no puede haber errores de consola. Si cambiás un flujo, actualizá `tests/e2e.py` en el mismo cambio.

## Cómo trabajar con el dueño

- Español rioplatense, directo y conciso. Toda la interfaz está en español (voseo: "elegí", "tocá").
- No es programador de oficio: explicar decisiones por su efecto, no por su mecánica.
- **Ante una duda sobre qué pide, preguntar antes de construir.** Lo dijo explícitamente: prefiere una
  pregunta a rehacer todo. Lo que es criterio técnico, decidirlo y avisar.
- Separar lo verificado de lo inferido y decir qué no se probó.
- Ser crítico con lo que se agrega: si algo no aporta, no hacerlo y decir por qué.

## Mapa del código

```
src/
  db.ts        Esquema Dexie, tipos, ajustes, carga inicial (seed), copia de seguridad
  seed.json    Generado (catálogo + plan). NO editar a mano: sale de tools/seed/gen.py
  seed-historial.json  Generado. Historial personal, opcional y fuera del repo (ver abajo)
  lib.ts       Formato de series y fechas, búsqueda, categorías, consultas de historial, guardarArchivo
  actions.ts   Ciclo de vida de la sesión, operaciones sobre planes, alta de ejercicios
  plan.ts      Formato plan-gym/v1: leer, validar, mapear ejercicios, guardar, exportar
  ui.tsx       Navegación (NavCtx), diálogos, Sheet, Stepper, Chips, Catalogo, Picker, HistorialLista, MediaView
  App.tsx      Pila de pantallas, pestañas, tema, botón atrás, restauración de scroll
  screens/
    Today.tsx      Hoy + preguntas de wellness
    Session.tsx    Sesión en curso + cierre
    Calendar.tsx   Calendario, formulario de actividad, detalle de sesión
    Plans.tsx      Lista de planes, detalle, editor de día, importador
    Exercises.tsx  Catálogo, ficha, formulario (incluye video/imagen)
    Progress.tsx   Progreso + GraficoPesos
    More.tsx       Ajustes
tools/seed/    Generador de datos iniciales (Python) y catálogo base
tools/imagenes/  gen.py baja y arma las imágenes incluidas de ejercicios (requiere Pillow y conexión)
tools/nombres/  gen.py arma privado/nombres-ejercicios.xlsx (propuesta de nombres claros y alias; requiere openpyxl)
tools/logo/    gen.py dibuja el ícono (public/icon-*.png); requiere Pillow
tests/         e2e.py (Playwright, Python) y fixtures
data/          Catálogo y plan actual en JSON legible (generados)
docs/          Decisiones, formato de plan, deploy, fuentes, histórico
```

## Modelo de datos (IndexedDB vía Dexie, base `gym-log-v2`)

| Tabla | Qué guarda |
|---|---|
| `exercises` | Catálogo. `vol:false` = movilidad/activación. `lastre` = el peso es el agregado. `alias[]` para reconocer nombres al importar |
| `plans` | Plan. `activo` (uno solo) y `cursor` (índice del próximo día de la rotación) |
| `planDays` | Día de un plan. `bloques[]` anidados: bloque → ejercicios → series prescriptas (`PSet`) |
| `sessions` | Sesión de gym. `estado`, `wellness` (5 ítems 1-5), `srpe`, `origen: app \| importado` |
| `setLogs` | Una fila por serie de una sesión. `hecha`, `plan` (copia de lo prescripto), `confianza` |
| `activities` | Otras actividades físicas (pádel, correr…) |
| `media` | Video o imagen por ejercicio (Blob). No entra en la copia de seguridad |
| `meta` | `settings`, `seeded` |

## Reglas del dominio — no romper

- **Pesos en gramos enteros** (`peso_g`). Convertir solo al mostrar (`kgToG`, `numES`).
- **El plan y el registro son tablas separadas.** Nada de lo que pasa en una sesión modifica el plan, con una
  sola excepción explícita: la casilla "Actualizar el plan con los pesos y reps de hoy" al cerrar (desmarcada
  por defecto), que solo toca peso/reps/segundos de series que coinciden por ejercicio, bloque, orden y serie.
- **Prescripción serie por serie.** No colapsar a "3×8": las series ascendentes son normales.
- **RIR y RPE son excluyentes** en una misma serie. RIR 0 = fallo; RPE 10 = fallo. El RPE es lo que la app del entrenador
  mostraba como "nivel de intensidad".
- **Toda serie tiene al menos una variable**: reps, tiempo, peso, RIR o RPE (`setValido`).
- **Solo se guardan las series tildadas.** Al cerrar, las no tildadas se descartan.
- **Rotación sin fechas.** La app sugiere `plan.cursor`; el usuario puede elegir otro día. El cursor avanza al
  guardar una sesión. No hay calendario de sesiones futuras.
- **Sesiones cargadas después** (`retro: true`, desde el calendario): usan la misma pantalla de sesión, sin reloj;
  la duración se carga a mano al cerrar. La rotación solo avanza si no hay sesiones completadas con fecha posterior.
- **Editar una sesión guardada** (detalle → Editar) cambia fecha, duración, esfuerzo, notas y series. Nunca toca
  el plan ni la rotación. Al salir se descartan las series sin datos.
- **Datos importados** (`origen: 'importado'`, `confianza: 'media'`): pesos leídos de capturas. Avisarlo donde
  se muestren.
- **Al entrenar solo se ven nombres del catálogo.** El importador obliga a crear o vincular lo desconocido.
  Crear con un nombre que ya existe usa ese ejercicio en vez de duplicarlo. El selector de "Vincular" no da de
  alta ejercicios. El archivo puede traer `grupo` (opcional) para los ejercicios que no están en el catálogo.

## Reglas de interfaz acordadas con el dueño

- Sesión: bloques colapsados al entrar; abrir uno cierra el anterior. El bloque abierto y el scroll se
  conservan al ir y volver de otra pantalla.
- Tilde de "hecho" por bloque (por defecto) o por ejercicio (ajuste `tilde`). Solo en modo por ejercicio
  arranca el cronómetro de descanso. Al terminar vibra y suena (ajustes `vibrar` y `sonido`). El dueño no quiere
  notificaciones para el descanso. El encabezado del bloque no lleva contador de series (lo pidió sacar).
- En la sesión, reps y peso se escriben a mano en una tabla compacta. RIR, RPE, fallo y calentamiento
  **no** se editan ahí: se configuran en el plan y se ven como "objetivo".
- Las etiquetas de grupo y equipo van en el encabezado del bloque, no en cada ejercicio.
- Historial de un ejercicio: lista informativa, sin enlaces.
- Catálogo agrupado por categoría (`categoria()` en lib.ts), con filtro detrás de un ícono junto al buscador.
- Imágenes incluidas: `src/ejercicios-img/<slug>.webp` (las arma `tools/imagenes/gen.py` desde Free Exercise DB,
  dominio público). Se muestran si el usuario no cargó una propia; la propia siempre tiene prioridad. Hay 28
  de 100; los candidatos dudosos están anotados en ese mismo archivo, sin incluir. No bajar imágenes de otras fuentes sin revisar la licencia.
- Estilo de formas redondas (pedido por el dueño): botones, chips y controles tipo píldora; tarjetas con
  `--radius: 22px`. Mantenerlo en lo nuevo.
- Video/imagen: se cargan desde la ficha del ejercicio (tocando el recuadro vacío) o al crear o editarlo. En la
  sesión solo se ven (botón ▶).
- Recordatorio de copia en Hoy cuando hay 4 o más sesiones propias posteriores a la última copia
  (`settings.copia_hasta`). "Más tarde" lo oculta hasta volver a abrir la app.
- Importar plan: primero se elige "Ya tengo un plan" o "Quiero que una IA me arme un plan". En las dos se puede
  subir el archivo .json o copiar un pedido para la IA y pegar la respuesta; cambia el pedido (`pedidoParaIA` en
  plan.ts, modos `convertir` y `crear`: los dos llevan formato + reglas + catálogo de esa persona). Si cambia el
  formato, actualizar ese texto, `EJEMPLO_PLAN` y `docs/formato-plan-gym.md` juntos.
- Grupos, equipamiento y patrones se muestran con `etiqueta()` (lib.ts): con acento y mayúscula inicial.
- Apariencia: tema claro/oscuro y paleta (`verde`, `azul`, `violeta`). Una paleta nueva son dos bloques en
  styles.css (`[data-paleta]` claro y oscuro) y una opción en Ajustes; el naranja queda reservado para "otras
  actividades" y el rojo para errores.
- Progreso: "Series por grupo muscular" va siempre visible. El progreso por ejercicio usa `progresoDe` (lib.ts):
  peso más alto y sus reps; a igual peso compara reps; sin peso, reps o tiempo.
- Todo lo que se despliega lleva `<Chevron>` (ui.tsx) **a la izquierda**: bloques de la sesión, filas de Progreso,
  ayudas. No usar triángulos ▸ ▾.
- Fechas `dd/mm/yyyy`. Decimales con coma. Excepción pedida por el dueño: "Últ. vez (dd/mm)" en la tarjeta de la
  sesión, que además no se corta: ocupa las líneas que necesite.

## Trampas técnicas

- **Inputs de texto ligados a la base: no controlados.** Usar `defaultValue` + `onBlur` (con `key` para
  forzar el remonte). Un input controlado cuyo valor viene de `useLiveQuery` pierde caracteres al tipear,
  porque el valor vuelve asíncrono. Ver `PlanDayScreen` y `Tarjeta` en Session.
- **Sin `alert`, `confirm` ni `prompt`.** Usar `useDialogos()` (`confirmar`, `avisar`).
- **Descargas solo con `guardarArchivo()`** (lib.ts): dentro de Claude usa la capacidad `downloads`; fuera,
  una descarga normal.
- **La app también corre como artifact de Claude** (iframe aislado): ahí no hay service worker, ni historial
  del navegador, ni garantía de almacenamiento, y no se cargan recursos remotos. Por eso: nada de CDNs ni
  fuentes externas, y el historial (`pushState`) solo se usa fuera de un iframe (`CON_HISTORIAL` en ui.tsx).
- **Cambios de esquema:** agregar `this.version(N+1).stores(...)` en db.ts, con `.upgrade()` si hay que
  transformar datos. Nunca editar una versión ya publicada: el usuario tiene datos reales.
- **Hooks antes de cualquier `return`** condicional (las pantallas devuelven "Cargando…" temprano).
- **Hojas y diálogos** fijan el fondo (`useFondoFijo`) y se registran para el botón atrás (`useCapa`). Si se
  agrega otro overlay, usar los dos.
- **Botón atrás** (`atras` en ui.tsx): cada pantalla apilada y cada overlay abierto es una entrada del historial
  del navegador. Lo que la app cierra por su cuenta se descuenta con `atras.quitar()`, y ese `popstate` se
  ignora. No llamar a `history.back()` ni `pushState` directamente desde las pantallas.
- **El historial personal no está en el repositorio** (que es público): `src/seed-historial.json`,
  `tools/seed/gen.py`, `docs/fuentes/*.md` y `privado/` están en `.gitignore` y existen solo en la PC del dueño.
  `db.ts` carga el historial con `import.meta.glob`, así que compila con o sin el archivo. La versión publicada
  arranca sin sesiones; las del dueño se cargan restaurando `privado/gym-log-historial.json`. Las pruebas e2e
  necesitan el historial: solo pasan en esta PC. Nunca sacar esos archivos del `.gitignore`.
- `tests/e2e.py` fija la fecha en 14-11-2026 porque el historial sembrado es relativo a esa fecha.
- `tsconfig` tiene `noUnusedLocals` y `noUnusedParameters`: el build falla con imports sin usar.

## Qué no hacer

- No agregar backend, cuentas ni sincronización sin que el dueño lo pida.
- No sumar dependencias para algo que se resuelve en pocas líneas (hoy: react, react-dom, dexie,
  dexie-react-hooks; sin framework de CSS ni librería de gráficos).
- No reintroducir la "fuerza estimada" (e1RM): se sacó a propósito. Ver `docs/DECISIONES.md`.
