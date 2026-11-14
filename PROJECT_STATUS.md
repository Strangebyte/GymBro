# Estado del proyecto

**Última actualización:** 14-11-2026 · **Versión:** 1.0.0

## Dónde está

- La app está completa y funcionando en las pruebas automáticas (74 de 74, sin errores de consola).
- **Publicada en GitHub Pages:** https://<usuario>.github.io/GymBro/ (repositorio público
  `<usuario>/GymBro`). Cada push a `main` la vuelve a publicar sola. Verificado el 14-11-2026 en
  Chromium: abre sin errores, registra el service worker y arranca con catálogo y plan, sin sesiones.
- **El historial personal no está en el repositorio.** Se carga en el teléfono restaurando
  `privado/gym-log-historial.json` (Ajustes → Restaurar desde una copia). Ver `docs/DEPLOY.md`.
- **Todavía no se probó en un Android real.** Todo lo verificado es en Chromium simulando un móvil.

## Próximo paso

Instalarla en el Android desde Chrome, restaurar el historial y probar ahí lo que el simulador no cubre:
video, vibración, pantalla encendida durante la sesión, scroll táctil con una hoja abierta, botón atrás.

## Hecho

- Catálogo de 100 ejercicios precargados; alta, edición, archivado; video o imagen y enlace por ejercicio
- Planes: crear, editar por día/bloque/serie, duplicar y reordenar días, importar y exportar (`plan-gym/v1`)
- Importador con validación y pantalla de mapeo (crear con nombre editable o vincular a existente)
- Elegir qué entrenar: día sugerido por la rotación, otro día, o sesión libre
- Wellness: 5 preguntas con 5 respuestas antes de cada sesión (se pueden saltear)
- Sesión: bloques colapsables, tilde por bloque o por ejercicio, carga a mano, historial por ejercicio,
  cambiar/quitar/agregar ejercicios sin tocar el plan, ejercicios adicionales, cierre con esfuerzo y notas
- Otras actividades: tipos precargados y propios, duración, esfuerzo, notas
- Calendario mensual con colores para gym y otras actividades; detalle al tocar un día
- Progreso: constancia semanal, peso máximo por ejercicio (interactivo), wellness semanal, series por grupo
- Ajustes: tema claro/oscuro, objetivo semanal, descanso, tilde, tipos de actividad, copia de seguridad
- Datos iniciales: plan actual (Mesociclo B, 6 días) e historial de 29 sesiones (02-09 al 11-11-2026)

## Limitaciones conocidas

| Limitación | Detalle |
|---|---|
| Videos e imágenes fuera de la copia | La copia es JSON; los Blobs de `media` no se exportan |
| Reproducción de video sin probar | Se probó con imagen; el video usa el mismo mecanismo |
| Exportar dentro de Claude sin probar | Usa la capacidad `downloads` del artifact; fuera de Claude sí está probado |
| Pesos del historial importado | Confianza media: leídos de capturas de pantalla |
| Día 6 del plan | Los bloques 1 y 2 están completados por inferencia (la fuente decía "+2" y "+1" sin nombres) |
| Sesión del 13-11-2026 | No está: figuraba pendiente y solo con el bloque 1 |
| Factores de músculos secundarios | Estimados a mano; "Series por grupo muscular" es una aproximación |
| Scroll con hoja abierta | Verificado con rueda de mouse, no con gesto táctil real |

## Ideas en espera (no pedidas todavía)

- Backup automático (Drive u otro) una vez que tenga hosting propio
- Inventario de discos y calculadora de carga por lado
- Peso corporal y medidas
- Incluir video/imagen en la copia de seguridad (zip)
- Skill de Claude para generar planes en `plan-gym/v1` (el dueño dijo que más adelante)

## Historial de sesiones de trabajo

| Fecha | Qué se hizo |
|---|---|
| 10-11-2026 | Diseño (`docs/historico/`), catálogo de 96 ejercicios, primera versión solo de registro |
| 14-11-2026 | Sonido al terminar el descanso (probado en el simulador; falta oírlo en el teléfono) |
| 14-11-2026 | Revisión general; git; historial separado del repositorio; primer deploy en GitHub Pages |
| 14-11-2026 | App completa rehecha; video/imagen; ronda de comentarios del dueño sobre la sesión, el historial y el selector; Progreso rehecho; proyecto pasado a esta carpeta |
