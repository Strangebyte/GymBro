# Decisiones

Registro de qué se decidió y por qué. Lo más nuevo, arriba.

## 15-11-2026 — Paletas de color

| Decisión | Razón |
|---|---|
| Tres paletas: verde (la original), azul y violeta, cada una con claro y oscuro | Pedido del dueño: la de ahora más dos. Se evitó naranja y rojo como color principal porque ya significan "otras actividades" y "error" |
| El tema y la paleta se recuerdan también fuera de la base | Para pintar con los colores elegidos desde el primer instante al abrir, sin destello verde |

## 14-11-2026 — Primera prueba en el teléfono y pendientes de la revisión

| Decisión | Razón |
|---|---|
| Repositorio público en GitHub Pages, sin el historial personal | Pages gratis exige repo público. El dueño no quiso su historial ni su mail a la vista; el historial se carga restaurando una copia |
| Al terminar el descanso suena además de vibrar; sin notificaciones | Pedido del dueño. Con el teléfono en silencio Android bloquea la vibración; el sonido usa el volumen de multimedia. Rechazó la notificación para el segundo plano |
| La pantalla se apaga durante la sesión y queda así | El bloqueo de pantalla encendida no funcionó en su teléfono; dijo que no le molesta |
| El botón atrás cierra primero hojas y diálogos | Con una hoja abierta, atrás sacaba de la sesión. También quedaban pasos "muertos" después de guardar |
| Editar una sesión guardada reusa la tarjeta de la sesión | Un peso mal tipeado arruinaba el gráfico y solo se podía borrar la sesión entera. Reusar la tarjeta evita una segunda interfaz |
| Las sesiones de días pasados se cargan desde el calendario con la pantalla de sesión normal | Mismo flujo que ya conoce; solo cambia que no hay reloj y la duración se carga a mano |
| Una sesión pasada avanza la rotación solo si es la más nueva | Cargar una sesión vieja no debe mover el "te toca" |
| Si una sesión queda abierta más de 4 horas, al cerrar se pide la duración | Una sesión olvidada quedaba con 20 horas |
| Progreso mira también las reps: a igual peso compara las reps; sin peso sigue reps o tiempo | Con solo el peso máximo, pasar de 80×6 a 80×8 figuraba "igual" y los ejercicios sin carga no tenían seguimiento. Son marcas reales, no fuerza estimada |
| "Series por grupo muscular" siempre visible en Progreso | Pedido del dueño: no quiere tocar para desplegarla (reemplaza la decisión anterior de dejarla colapsada) |
| Etiquetas con acento (bíceps, glúteo, máquina…) solo al mostrar | Las claves guardadas siguen sin acento; los nombres de ejercicios del entrenador no se tocan |
| Sin botón de descanso manual | El dueño lo descartó |
| Recordatorio de copia cada 4 sesiones propias, con "Más tarde" | Todo vive en un solo dispositivo y nada avisaba. Cuatro es más o menos una semana de entrenamiento |
| La copia se sigue descargando al teléfono; sin botón de compartir ni subida automática a Drive | El dueño lo descartó. Lo automático exigiría cuenta de Google y registrar la app |
| Importar plan: botón que copia el pedido para Claude, con el catálogo de quien usa la app | El dueño compartió la app con otras personas que no tienen los archivos del proyecto para pedirle un plan a Claude |

## 14-11-2026 — Ronda de comentarios del dueño sobre la app completa

| Decisión | Razón |
|---|---|
| Bloques colapsados; abrir uno cierra el anterior | Pedido del dueño: menos scroll, foco en un bloque |
| Tilde por bloque, con ajuste para pasarlo a por ejercicio | Pidió por bloque; al notar que eso dejaba sin disparador al cronómetro de descanso, pidió que fuera configurable |
| Cronómetro de descanso solo en modo por ejercicio | Por bloque no hay un momento que lo dispare |
| Reps y peso se escriben a mano, en tabla compacta | Pedido: igual que el editor de planes; los botones +/− ocupaban demasiado |
| RIR, RPE, fallo y calentamiento no se editan en la sesión | Pedido: son parte de la configuración del plan |
| Etiquetas de grupo/equipo en el encabezado del bloque | Pedido: repetidas en cada ejercicio eran ruido |
| Historial por ejercicio en una hoja, sin enlaces | Pedido: es informativo; navegar hacía perder el lugar en la sesión |
| El plan no cambia por lo hecho en la sesión; "actualizar el plan" queda como casilla opcional, desmarcada | El dueño eligió "los del plan, con opción de actualizar" |
| Solo se guardan las series tildadas | Consecuencia del tilde por bloque: lo no tildado se considera no hecho |
| Catálogo agrupado por categoría; filtro detrás de un ícono | Pedido |
| Video/imagen por ejercicio, cargados solo desde Ejercicios | Pedido. Se guardan como Blob local; no entran en la copia de seguridad (JSON) |
| Se quitó la fuerza estimada (e1RM) de toda la app | Necesita RIR o RPE en cada serie y la mayoría no lo tiene: mostraba "+0,0" casi siempre, y con lastre daba números sin sentido. Se reemplazó por el peso máximo real por sesión |
| Progreso: wellness por semana en vez de promedio de 30 días | Un promedio mensual esconde la tendencia, que es lo accionable |
| "Series por grupo muscular" queda colapsada y en enteros | Es una aproximación (factores estimados); se conserva por si sirve al armar planes propios |
| No se agregó carga de entrenamiento (esfuerzo × minutos) | Solo tendría datos de sesiones nuevas y no cambia ninguna decisión hoy |

## 14-11-2026 — Construcción de la app completa

| Decisión | Razón |
|---|---|
| RPE = lo que la app del entrenador llama "nivel de intensidad" (1-10); un solo campo | Confirmado por el dueño y por la vista "See Summary" de la app del entrenador |
| RIR y RPE excluyentes por serie | Así los usa el entrenador: RIR en peso corporal/lastre, RPE en el resto |
| Rotación a demanda, sin fechas | El dueño entrena 4 veces por semana pero los días varían mucho; un calendario fijo quedaba siempre desfasado |
| Wellness antes de cada sesión, 5 preguntas | Pedido; replica lo que ya respondía en la app del entrenador |
| Import por archivo JSON `plan-gym/v1` | El plan es un árbol de 4 niveles; en CSV se aplana mal. Claude lo genera sin ambigüedad |
| El importador nunca crea ejercicios en silencio | Evita que el catálogo se fragmente en variantes del mismo ejercicio |
| Al vincular, el nombre del archivo se guarda como alias | La próxima importación lo reconoce sola |
| Historial previo importado y marcado `importado` / confianza media | Da calendario y progreso desde el día uno, sin esconder que los pesos se leyeron de capturas |
| Tema claro por defecto, con oscuro | Elegido por el dueño |
| CSS a mano, sin Tailwind; sin librería de gráficos | Pocas pantallas con controles propios; menos dependencias, menos fallas |
| Dexie en vez de SQLite WASM | ~10-20 mil filas por año: sobra con IndexedDB y pesa mucho menos |
| Diálogos y descargas propios | La app también corre como artifact de Claude, que bloquea `confirm()` y las descargas directas |

## 10-11-2026 — Diseño inicial

| Decisión | Razón |
|---|---|
| PWA en vez de app nativa | Uso personal, se comparte con un enlace, sin Play Store |
| Datos locales, sin backend | Un usuario; cero infraestructura y cero costo |
| Pesos como entero en gramos | Evita errores de punto flotante (mismo criterio que el dinero en otro proyecto) |
| Plan y registro separados | Permite comparar lo prescripto con lo hecho sin que editar un plan altere el historial |
| Movilidad y activación no suman volumen (`vol: false`) | Si no, el bloque 1 infla las series de cadera e isquios |
| Siglas del entrenador conservadas en los nombres | Son las que el dueño ve en el gimnasio; las seis sin descifrar (I/V, BA, CD, PDB, RR, CC) quedaron así por decisión suya |

El documento de diseño original está en `docs/historico/plan-diseno-v0.5.md`. Lo que contradiga a este archivo o a
`CLAUDE.md` está superado.
