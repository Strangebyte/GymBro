# Estado del proyecto

**Última actualización:** 14-11-2026 · **Versión:** 1.0.0

## Dónde está

- La app está completa y funcionando en las pruebas automáticas (73 de 73, sin errores de consola).
- Está publicada como artifact privado de Claude ("Gym Log"), que sirve de vista previa. **No es su hogar
  definitivo**: ahí no es instalable, no funciona sin conexión y el almacenamiento no está garantizado.
- **Todavía no se probó en un Android real.** Todo lo verificado es en Chromium simulando un móvil.

## Próximo paso

**Publicarla en un hosting propio** para que sea instalable, funcione sin conexión y guarde los datos de
forma confiable. Instrucciones en `docs/DEPLOY.md`. Se eligió GitHub Pages. El flujo está en
`.github/workflows/deploy.yml` (sin probar hasta el primer push) y la carpeta ya es un repositorio git.
Falta: crear el repositorio en GitHub, subirlo y activar Pages (Settings → Pages → Source: GitHub Actions).

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
| 14-11-2026 | App completa rehecha; video/imagen; ronda de comentarios del dueño sobre la sesión, el historial y el selector; Progreso rehecho; proyecto pasado a esta carpeta |
