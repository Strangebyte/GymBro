# Estado del proyecto

**Última actualización:** 16-11-2026 · **Versión:** 1.0.0

## Dónde está

- La app está completa y funcionando en las pruebas automáticas (122 de 122, sin errores de consola).
- **Publicada en GitHub Pages:** https://<usuario>.github.io/GymBro/ (repositorio público
  `<usuario>/GymBro`). Cada push a `main` la vuelve a publicar sola. Verificado el 14-11-2026 en
  Chromium: abre sin errores, registra el service worker. Desde el 16-11-2026 arranca solo con el catálogo: sin planes ni sesiones.
- **El historial personal no está en el repositorio.** Se carga en el teléfono restaurando
  `privado/gym-log-historial.json` (Ajustes → Restaurar desde una copia). Ver `docs/DEPLOY.md`.
- **Instalada en el Android del dueño (14-11-2026).** Probado ahí: vibración y sonido al terminar el descanso.
  La pantalla se apaga durante la sesión (el bloqueo de pantalla encendida no funciona); al dueño no le molesta.
  Con el teléfono en silencio no vibra: lo bloquea Android.

## Próximo paso

Probar en el teléfono lo último que se agregó y solo se verificó en el simulador: botón atrás con hojas y
diálogos abiertos, editar una sesión, cargar una sesión pasada y el recordatorio de copia. Sigue sin probar:
video y scroll táctil con una hoja abierta.

## Pendiente (anotado el 14-11-2026, al cortar la sesión de trabajo)

- **Probar en el teléfono** lo último publicado, que solo se verificó en el simulador: Progreso con reps
  (a igual peso muestra "+N reps"; ejercicios sin peso siguen reps o tiempo), series por grupo muscular siempre
  visible, que ya no se recargue al deslizar hacia abajo, adjuntar foto o video desde la ficha, acentos en categorías y etiquetas, las tres paletas de color (Ajustes → Color), y "Copiar pedido para Claude" en Importar plan con un Claude real.
- **Probar en iPhone** que ya no se agrande la pantalla al tocar "Pegar el plan" ni otros campos. El arreglo no se
  pudo verificar acá: solo aplica en iOS.
- **Antebrazos** quedó como grupo sin ejercicios de fábrica; sumar alguno si el dueño lo pide.
- **Plan Mesociclo B en teléfonos que ya tenían la app:** las instalaciones nuevas ya no lo traen, pero a quien la
  instaló antes le sigue apareciendo hasta que lo borre a mano (Planes → Borrar plan). No se borra solo porque no
  hay forma de distinguir el teléfono del dueño del de los demás.
- **Nombres a confirmar:** "Plancha sube y baja con disco" (era "Plancha CONSTRUYO"; el dueño dejó el nombre a criterio).
  Los ejercicios con DUDA que no corrigió quedaron con el nombre sugerido.
- **Imágenes de ejercicios:** 86 de 156 tienen imagen incluida. Quedan 12 candidatos dudosos anotados en
  `tools/imagenes/gen.py` y unos 55 sin equivalente en el banco (movilidad, core, pliometría y variantes del
  entrenador): para esos haría falta que el dueño cargue su propia foto o video. Los ejercicios nuevos no tienen
  músculos secundarios cargados, así que en "Series por grupo muscular" solo suman a su grupo principal.
- **Probar en iPhone** (otra persona): instalación desde Safari, sonido de descanso, copia de seguridad.
  No vibra en iPhone: es una limitación de iOS.
- **Datos personales (16-11-2026):** se quitaron de los archivos y de todo el historial de git: apodo, usuario,
  ciudades, otras personas y otros proyectos. Los commits se firman como "GymBro". Queda a cargo del dueño cambiar
  el nombre de usuario de GitHub, que es lo único que sigue visible (en la dirección del repositorio y de la app).
- **Herramientas de desarrollo con avisos de seguridad:** `npm audit` marca 7 en dependencias de compilación (Vite y
  el generador del service worker). No van dentro de la app publicada; arreglarlos exige subir Vite de versión mayor.
- **Restaurar una copia no valida el contenido fila por fila:** un archivo armado a mano con datos incompletos puede
  dejar la app sin abrir. No es un riesgo con copias hechas por la propia app.
- **Pantalla encendida durante la sesión:** no funciona en el teléfono del dueño; dijo que no le molesta. Sin investigar.

## Hecho

- Catálogo de 156 ejercicios precargados (los del entrenador con nombres claros y 61 clásicos), 86 con imagen; alta, edición, archivado; video o imagen y enlace por ejercicio
- Planes: crear, editar por día/bloque/serie, duplicar y reordenar días, importar y exportar (`plan-gym/v1`)
- Importador con validación y pantalla de mapeo (crear con nombre editable o vincular a existente)
- Elegir qué entrenar: día sugerido por la rotación, otro día, o sesión libre
- Wellness: 5 preguntas con 5 respuestas antes de cada sesión (se pueden saltear)
- Botón atrás de Android: cierra hojas y diálogos antes que la pantalla; sin pasos muertos después de guardar
- Editar una sesión guardada (fecha, duración, esfuerzo, notas, series) y cargar sesiones de días pasados
- Recordatorio de copia de seguridad cada 4 sesiones; fecha de la última copia en Ajustes
- Sesión: bloques colapsables, tilde por bloque o por ejercicio, carga a mano, historial por ejercicio,
  cambiar/quitar/agregar ejercicios sin tocar el plan, ejercicios adicionales, cierre con esfuerzo y notas
- Otras actividades: tipos precargados y propios, duración, esfuerzo, notas
- Calendario mensual con colores para gym y otras actividades; detalle al tocar un día
- Progreso: constancia semanal, peso máximo por ejercicio (interactivo), wellness semanal, series por grupo
- Ajustes: tema claro/oscuro, objetivo semanal, descanso, tilde, tipos de actividad, copia de seguridad
- Datos iniciales públicos: solo el catálogo. El plan Mesociclo B y el historial de 29 sesiones son del dueño y quedan fuera del repositorio

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

- Backup automático (Drive u otro): el dueño lo descartó por ahora; exigiría cuenta de Google
- Inventario de discos y calculadora de carga por lado
- Peso corporal y medidas
- Incluir video/imagen en la copia de seguridad (zip)
- Skill de Claude para generar planes en `plan-gym/v1` (el dueño dijo que más adelante)

## Historial de sesiones de trabajo

| Fecha | Qué se hizo |
|---|---|
| 10-11-2026 | Diseño (`docs/historico/`), catálogo de 96 ejercicios, primera versión solo de registro |
| 16-11-2026 | Datos personales fuera de los archivos y del historial de git; campo de otros nombres más grande |
| 16-11-2026 | Auditoría de la app y de datos personales en el repositorio; arreglos menores; el bloque cerrado del editor muestra grupos y equipamiento |
| 16-11-2026 | Editor de días con botón Guardar y aviso al salir con cambios; "Rebote y frenado" borrado del todo; la versión pública ya no trae el plan Mesociclo B |
| 16-11-2026 | Grupos, patrones y equipamiento unificados (con conversión de los datos guardados); editor de días compacto con bloques que se abren y cierran; cuestionario nuevo en el pedido para la IA; arreglo del zoom en iPhone (sin verificar) |
| 15-11-2026 | Catálogo revisado con el Excel del dueño: nombres claros, alias, 4 fusiones, 61 clásicos nuevos con foto, sin archivados de fábrica; actualización automática en apps ya instaladas; se quitó "salto mínimo de carga" |
| 15-11-2026 | Importar plan en dos caminos (ya tengo un plan / que una IA lo arme), con un pedido distinto para cada uno; etiquetas con mayúscula inicial |
| 15-11-2026 | Importador: arreglos en "Crear nuevo" / "Vincular"; Excel con propuesta de nombres y alias |
| 15-11-2026 | Imágenes incluidas para 28 ejercicios (solo coincidencias seguras, revisadas una por una) |
| 15-11-2026 | Formas más redondas en toda la app; imágenes incluidas para 5 ejercicios, de prueba |
| 15-11-2026 | La app pasa a llamarse GymBro, con ícono nuevo (mancuerna en degradé); chevrones más chicos |
| 15-11-2026 | Chevrón a la izquierda en todo lo desplegable; color neutro para la barra inferior de Android (sin confirmar en el teléfono) |
| 15-11-2026 | Flecha en las filas de Progreso, sin recarga al deslizar, adjuntar desde la ficha, bloque sin contador de series, "Últ. vez" corta y completa |
| 15-11-2026 | Paletas de color: verde, azul y violeta, cada una en claro y oscuro (probado solo en el simulador) |
| 14-11-2026 | Progreso con reps, series por grupo siempre visible, acentos en etiquetas (probado solo en el simulador) |
| 14-11-2026 | Importar plan: botón que copia el pedido para Claude y pegado tolerante (probado solo en el simulador) |
| 14-11-2026 | Botón atrás, edición de sesiones, sesiones pasadas y recordatorio de copia (probado solo en el simulador) |
| 14-11-2026 | Sonido al terminar el descanso (confirmado por el dueño en el teléfono) |
| 14-11-2026 | Revisión general; git; historial separado del repositorio; primer deploy en GitHub Pages |
| 14-11-2026 | App completa rehecha; video/imagen; ronda de comentarios del dueño sobre la sesión, el historial y el selector; Progreso rehecho; proyecto pasado a esta carpeta |
