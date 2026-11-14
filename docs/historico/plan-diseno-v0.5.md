> **Documento histórico (10-11-2026).** Es el plan de diseño previo a construir la app. Varias decisiones cambiaron después: ver `docs/DECISIONES.md` y `CLAUDE.md`, que son los vigentes.

# App de entrenamiento — Plan de diseño v0.5

**Fecha:** 2026-11-10
**Estado:** plan para aprobar. Nada implementado todavía.

## Decisiones cerradas

| Tema | Decisión |
|---|---|
| Plataforma | PWA instalable (React + IndexedDB), Android |
| Datos | Locales en el dispositivo + backup a Google Drive |
| Alcance v1 | Log + constructor de rutinas + importación + progresión y analítica |
| Fuente de planes | **Mixto**: planes del coach + planes propios/generados por Claude |
| Calendario | **Rotación bajo demanda**, sin fechas prefijadas (ver 5) |
| Histórico previo | **Importar todo** lo extraído de sep–nov 2026, con flag de confianza |
| Prescripción | Intensidad (1–10) **o** RIR, **mutuamente excluyentes** por ejercicio |
| Escala ↻ | **RIR** (reps en reserva): más alto = más lejos del fallo |
| Wellness | **Diario**, 5 ítems (Hooper) |
| Gimnasios | Uno, con inventario de discos configurable en ajustes |
| Hosting | GitHub existente; el deploy se arma en la fase 1 |

---

## 1. Puntos resueltos y pendientes de datos

### 1.1 Escala ↻ — RESUELTO: es RIR

**↻ = reps en reserva.** Más alto = más lejos del fallo. Lo dijiste vos, y revisando el chat de extracción se entiende de dónde venía mi confusión: **el conflicto que planteé estaba mal fundado y el error es mío.**

Qué pasó. Las primeras sesiones se extrajeron **antes** de descubrir que ↻ e ▤ eran dos campos distintos. En esa pasada todo lo que estuviera entre paréntesis se etiquetó como "RPE" sin distinguir. Las dos observaciones sobre las que armé el conflicto vienen de ahí:

- `Empuje de cadera - BR 4r RPE 8|8|8` — en la tabla corregida posterior ese 8 aparece en la columna de **intensidad**, no de RIR. Era intensidad mal etiquetada.
- `Remo NEUTRO - MQ 12r|12r|100r` con `6|8|10` y mi conclusión "100r con RPE 10 = serie al fallo" — **esa interpretación era una inferencia mía de la pasada pre-corrección, no un dato que vos confirmaras.**

O sea: no había dos lecturas incompatibles de los datos. Había una lectura mía construida sobre un etiquetado que después se corrigió, y yo la seguí tratando como evidencia.

**Resolución:**
- `rir` entra directo en `e1RM = peso × (1 + 0,0333 × (reps + RIR))`, sin inversión.
- La fila `Remo NEUTRO 12r|12r|100r @ 6|8|10` queda marcada como **dato sospechoso** en el import: con semántica RIR no cierra (reps saltando a 100 mientras el RIR sube). Es una fila, entra en el bucket `confianza: media` y no alimenta progresión.
- El flag `al_fallo` sigue en el modelo, pero se registra explícitamente, no se infiere de un `100r`.

Se mantiene la decisión de **registrar siempre el RIR real alcanzado**, incluso en ejercicios prescriptos por intensidad: sin eso no hay e1RM en los principales pesados (Empuje de cadera a 150 kg está prescripto por intensidad). *Confianza: alta.*

### 1.2 El histórico "completo" no es tan completo

Pediste importar todo, y es la decisión correcta, pero el alcance real de lo extraído es desigual y conviene saberlo antes:

| Nivel de detalle | Cobertura |
|---|---|
| Estructura de sesión (bloques, ejercicios, series×reps) | **30 sesiones** (sep–nov), 96 ejercicios únicos — confianza alta |
| Peso por serie | Parcial, y **confianza media**: texto chico y de bajo contraste en la extracción visual |
| RIR/intensidad por serie | **3 sesiones de 9** del mesociclo B (06-11, 09-11, 04-11) |

O sea: tenés 30 sesiones de estructura, pero solo 3 con el detalle por serie que alimenta la analítica de progresión. **Importar los 30 te da adherencia, frecuencia y volumen en series; no te da progresión de carga confiable.**

Tres caminos:

1. **Importar los 30 como están**, con flag `confianza: media` en los pesos. La analítica de progresión arranca pobre pero la de volumen y adherencia funciona ya.
2. **Completar las 6 sesiones faltantes del mesociclo B** antes de importar (~70 llamadas de extracción visual, según estimó el chat anterior). Te deja el mesociclo actual completo.
3. **Importar los 30 y no volver atrás**: de acá en adelante el detalle lo registra la app, y en 4 semanas ya tenés datos propios de calidad alta.

**Mi recomendación: 1 + 3.** El esfuerzo de la opción 2 compra 6 sesiones de datos de confianza media, cuando en un mes vas a tener 12 sesiones de confianza alta registradas por la app. No vale el tiempo. *Confianza: alta.*

---

## 2. Qué hace la app del entrenador hoy (verificado)

Mapeado sobre 30 sesiones reales en el chat *"Extracción de planes de gimnasio"*. Es la línea de base a igualar.

### 2.1 Estructura
- Sesión = **5 a 7 bloques**, 1 a 4 ejercicios cada uno. La numeración puede saltear (1, 2, 4, 5, 6).
- Función por bloque, consistente: B1 movilidad/activación · B2 core y anti-movimiento · B3 potencia/pliometría · B4–B5 fuerza principal · B6–B7 accesorios.
- **Mesociclos** de ~6 semanas con cambio de énfasis.
- **4 a 6 plantillas de día que rotan** dentro del mesociclo.
- Etiqueta de equipamiento por sesión, duración (34–57 min), adherencia, video por ejercicio.

### 2.2 Campos por ejercicio — una línea por serie
```
reps        8r  | 8r  | 8r        (o segundos: 60" | 60")
↻           (7) | (7) | (7)       RIR o RPE — ver 1.1
▤ intensidad(8) | (8) | (8)       1-10, requerida para el ejercicio
▲ peso      70K | 70K | 70K       (s/p = sin peso)
```

Tres consecuencias de diseño:

**a) ↻ e ▤ son mutuamente excluyentes.** Confirmado por vos: nunca van juntas en el mismo ejercicio. En el modelo esto **no** son dos columnas nullable sino un objetivo con discriminador (`objetivo_tipo` + `objetivo_valor`), de modo que el esquema mismo impide filas sin sentido.

**b) La prescripción es por serie, no "3×8".** Press en landmine del 09-11: `10→8→6` reps con `15→20→22,5` kg e intensidad `8→9→10`. Un modelo con `series` + `reps_min/max` **no puede representar eso**. Hay que modelar serie por serie.

**c) Reps o tiempo.** Isométricos y trabajo de carrera van en segundos.

### 2.3 Convenciones del coach
- Siglas resueltas: BR=barra, KB=kettlebell, MC=mancuernas, MQ=máquina, PL=polea, CJ=cajón, RD=rodillo, RA=resistencia acomodada (banda), FB=fitball, LM=landmine, MB/BD=banda, OH=overhead, CCM=con contramovimiento, DC=disco, DT=dorsotorácica, 1P/1m=unilateral.
- Sin resolver **por decisión tomada**: I/V, BA, CD, PDB, RR, CC. Los ejercicios ya se renombraron a nombres intuitivos. No es un pendiente.
- `100r` = workaround de la app del entrenador para "al fallo". En tu app va un flag `al_fallo` explícito, y deja de contaminar el tonelaje.
- **Peso corporal + lastre:** dominadas a `20 | 20 | —` son con 20 kg de lastre. La carga efectiva necesita tu peso corporal.

### 2.4 Qué le falta (= tu valor agregado)

| Falta | Por qué importa |
|---|---|
| Distinción calentamiento / serie efectiva | Sin esto el volumen está inflado y la analítica miente |
| e1RM por ejercicio en el tiempo | El mejor indicador único de progreso |
| Series efectivas por grupo muscular por semana | Driver principal de hipertrofia |
| Doble progresión explícita | Es lo que mirás para decidir si subir carga |
| Carga de sesión / monotonía / strain | Cuantificación de carga y riesgo de sobrecarga |
| Descanso real entre series | Sale gratis del timer |
| Registro de dolor por zona | Señal temprana de lesión |
| Wellness **diario** | la app del entrenador lo hace semanal |
| Peso corporal con media móvil 7d | El dato diario solo es ruido |
| Config de máquina (asiento, pin) | Trivial y de lo más útil en la práctica |
| Calculadora de discos configurable | Los discos de un gimnasio y de otro no son los mismos |
| Export de tus datos | Hoy tu histórico está secuestrado en la app de un tercero |

---

## 3. Modelo de datos

### 3.1 Principio rector: plantilla ≠ instancia

```
Programa (mesociclo)
└── Plantilla de día  ──agendada en fechas──>  Sesión ejecutada
    └── Bloque                                 └── Serie registrada
        └── Ejercicio
            └── Serie prescripta
```

Lo prescripto y lo ejecutado van en tablas distintas. Si editás una rutina y eso toca el histórico, perdés la comparación plan vs real. Mismo criterio que presupuesto vs real.

La plantilla de día es la unidad reutilizable; el calendario es una capa aparte que apunta a plantillas. Eso es lo que permite "repetime este día durante 6 semanas" sin duplicar datos.

### 3.2 Entidades

**`exercise`** — catálogo canónico
```
id, slug, nombre_coach ("Sentadilla AL CAJÓN RA - BR"),
nombre_legible ("Sentadilla a una pierna al cajón con barra"),
alias[], grupo_primario, grupos_secundarios[{grupo, factor}],
equipamiento, patron_movimiento, unilateral, admite_lastre,
mide_en (reps|segundos|ambos), incremento_minimo_g,
notas_tecnica, config_maquina, link_video
```
Los tres nombres buscables: mantenés la nomenclatura del coach (la que ves en el gimnasio) sin perder legibilidad. `grupos_secundarios` con factor (press banca → pecho 1.0, tríceps 0.5, hombro ant. 0.3) es lo que hace creíble el conteo de volumen.

**`program`** — `id, nombre, objetivo, fecha_inicio, semanas, notas, activo, origen (coach|propio|importado)`

**`day_template`** — `id, program_id, codigo ("D1"), etiqueta, duracion_estimada_min, equipamiento[]`

**`block`** — `id, day_template_id, orden (admite saltos), tipo, estructura, descanso_entre_vueltas_s, vueltas, notas`
- `tipo`: `movilidad | activacion | core | potencia | principal | accesorio | cardio | finisher`
- `estructura`: `series_rectas | superserie | triserie | circuito | emom | amrap | dropset | rest_pause | cluster | ascendente | piramidal`

**`block_exercise`** — `id, block_id, exercise_id, orden, descanso_s, notas, sustituible_por[]`

**`planned_set`** — prescripción, **una fila por serie**
```
id, block_exercise_id, serie_nro,
medida_tipo (reps|duracion), medida_valor,
peso_g | pct_1rm | peso_texto ("el del último día"), lastre_g,
objetivo_tipo (intensidad|rir|ninguno), objetivo_valor (1-10),
tempo, al_fallo, lado (ambos|alterno|izq|der),
tipo_serie (calentamiento|efectiva|backoff|dropset)
```
El par `objetivo_tipo`/`objetivo_valor` implementa la exclusión mutua a nivel de esquema.

**`program_cursor`** — puntero de rotación. Reemplaza al calendario por fechas (ver 5).
```
program_id, secuencia[] (["D1","D2","D3","D4"]), indice_actual
```

**`schedule`** — calendario **opcional**, solo si alguna vez querés planificar fechas por adelantado
```
id, program_id, fecha, day_template_id,
estado (pendiente|completada|salteada|movida), notas
```
No es la columna vertebral del sistema. Existe para el caso de querer agendar una semana puntual; la operación normal usa `program_cursor`.

**`gym_setup`** — ajustes de equipamiento
```
id, nombre, discos_disponibles[{peso_g, cantidad}], barras[{nombre, peso_g}], activo
```

**`session`** — ejecutado
```
id, schedule_id (nullable), day_template_id (nullable), fecha,
hora_inicio, hora_fin, estado, srpe (0-10),
energia_pre, energia_post, peso_corporal_g, notas
```
Los nullable permiten entrenar sin plan. Vas a improvisar alguna vez y la app no se tiene que trabar.

**`set_log`** — el corazón
```
id, session_id, exercise_id, planned_set_id (nullable),
bloque_orden, ejercicio_orden, serie_nro,
tipo_serie, peso_g, lastre_g,
medida_tipo, medida_valor, lado,
rir_real, intensidad_real, al_fallo, fallo_tipo (tecnico|muscular),
tempo_real, descanso_real_s, calidad_ejecucion (1-3),
completada, timestamp, notas,
confianza (alta|media)   -- para los datos importados del histórico viejo
```
Nota sobre `rir_real` + `intensidad_real`: en la **prescripción** son excluyentes; en el **registro** la app pide siempre el RIR real (ver 1.1), y la intensidad real solo si fue el objetivo. No es inconsistencia: prescribir y medir son operaciones distintas.

**`wellness`** (diario) — `fecha, horas_sueno, calidad_sueno, fatiga, dolor_muscular, estres, animo, peso_g, notas`. Cinco ítems en escala 1–5, modelo Hooper.

**`body_metric`** — `fecha, tipo, valor, unidad`
**`pain_log`** — `fecha, session_id, zona, intensidad (0-10), momento, notas`

### 3.3 Convenciones técnicas
- **Pesos como entero en gramos** (`22,5 kg → 22500`). Mismo criterio que el dinero en otro proyecto; elimina errores de punto flotante al sumar tonelaje sobre miles de series. *Confianza: alta.*
- **Fechas ISO 8601** para días, epoch ms para timestamps.
- **`exercise_id` denormalizado en `set_log`**: permite sustituir ejercicio sin romper nada.
- **Soft delete** en todo.
- **`schema_version` + migraciones versionadas desde el día uno.** Vas a cambiar el esquema y no querés perder el histórico.

---

## 4. Importación de planes

Con la decisión "mixto", el importador deja de ser una comodidad y pasa a ser infraestructura: es la vía por la que entran tanto los planes del coach como los generados por Claude.

### 4.1 Formato: JSON

El plan es un árbol de cuatro niveles con prescripción por serie. En CSV se aplana mal y se vuelve frágil; en JSON se representa natural, se valida con esquema y Claude lo genera sin ambigüedad. *Confianza: alta.*

### 4.2 `plan-gym/v1`

```json
{
  "formato": "plan-gym/v1",
  "programa": {
    "id": "meso-c-2026-11",
    "nombre": "Mesociclo C",
    "objetivo": "Fuerza en bisagra + volumen de tracción",
    "fecha_inicio": "2026-11-17",
    "semanas": 6,
    "origen": "coach"
  },
  "ejercicios": [
    {
      "slug": "empuje-cadera-br",
      "nombre_coach": "Empuje de cadera - BR",
      "nombre_legible": "Empuje de cadera con barra",
      "grupo_primario": "gluteo",
      "grupos_secundarios": [{"grupo": "isquios", "factor": 0.5}],
      "equipamiento": "barra",
      "patron": "bisagra",
      "unilateral": false,
      "mide_en": "reps",
      "incremento_minimo_kg": 2.5
    }
  ],
  "dias": [
    {
      "codigo": "D1",
      "etiqueta": "Día 1 — Cadera + Tracción",
      "duracion_estimada_min": 50,
      "equipamiento": ["barra", "kettlebell"],
      "bloques": [
        {
          "orden": 1,
          "tipo": "movilidad",
          "estructura": "series_rectas",
          "ejercicios": [
            {"slug": "isquiotibiales-rd", "orden": 1,
             "series": [{"duracion_s": 60}, {"duracion_s": 60}]}
          ]
        },
        {
          "orden": 4,
          "tipo": "principal",
          "estructura": "ascendente",
          "ejercicios": [
            {
              "slug": "empuje-cadera-br", "orden": 1, "descanso_s": 180,
              "series": [
                {"reps": 6, "peso_kg": 130, "objetivo": {"tipo": "intensidad", "valor": 8}},
                {"reps": 5, "peso_kg": 140, "objetivo": {"tipo": "intensidad", "valor": 9}},
                {"reps": 4, "peso_kg": 150, "objetivo": {"tipo": "intensidad", "valor": 10}}
              ]
            }
          ]
        },
        {
          "orden": 6,
          "tipo": "accesorio",
          "ejercicios": [
            {
              "slug": "dominadas-prona", "orden": 1,
              "series": [
                {"reps": 7, "lastre_kg": 20, "objetivo": {"tipo": "rir", "valor": 2}},
                {"reps": 6, "lastre_kg": 20, "objetivo": {"tipo": "rir", "valor": 2}},
                {"reps": null, "al_fallo": true, "objetivo": {"tipo": "rir", "valor": 0}}
              ]
            }
          ]
        }
      ]
    }
  ],
  "rotacion": {
    "secuencia": ["D1", "D2", "D3", "D4"],
    "frecuencia_objetivo_semanal": 4
  }
}
```

### 4.3 Reglas del importador

1. **Dry-run obligatorio.** Preview antes de escribir: qué programa, cuántos días, cuántas sesiones agenda, qué ejercicios son nuevos, cuáles no reconoce.
2. **Resolución de ejercicios en tres pasos:** match exacto por `slug` → match por `alias[]` o nombre normalizado (sin acentos ni siglas) → si no hay match, ofrece *crear nuevo* o *mapear a existente*. **Nunca crea en silencio**: así se fragmenta el catálogo y se parten los gráficos de progresión.
3. **Validación con mensajes útiles**: `día D2, bloque 4, ejercicio 1: falta reps o duracion_s`, no un "JSON inválido" pelado.
4. **Idempotencia por `programa.id`.** Reimportar el mismo id ofrece reemplazar o versionar; no duplica.
5. **Import parcial:** solo `ejercicios` siembra catálogo; solo `calendario` reagenda.
6. **Nunca toca `set_log`.** El histórico ejecutado es inmutable por esta vía (el import del histórico viejo usa un formato y un canal distintos).
7. **Todos los campos opcionales.** Un bloque de movilidad sin peso ni objetivo tiene que importar sin fricción.
8. **Rechaza `objetivo` con los dos tipos a la vez** (invariante del punto 2.2a).

### 4.4 El plan del coach: cómo entra en la práctica

El plan del coach vive en la app del entrenador, que no tiene API pública. El camino realista, y el que ya probaste de hecho en el chat de extracción: **capturas de pantalla del plan → Claude las convierte a `plan-gym/v1` → importás el JSON.** De 5 a 10 minutos por mesociclo nuevo, que cambia cada 4–6 semanas. Es tolerable.

Lo que **no** recomiendo es mantener los dos sistemas en paralelo durante la sesión. Registrar dos veces lo mismo es el patrón que mata estos proyectos. *Confianza: alta.*

### 4.5 Ida y vuelta
- **Export de plan** en el mismo formato: se lo pasás a Claude para que itere sobre tu plan actual en lugar de inventar uno de cero.
- **Export de histórico** (`log-gym/v1`): insumo del análisis de cierre de mesociclo, y tu backup real.

Que el formato sea simétrico es lo que hace que el ciclo *plan → ejecución → análisis → plan siguiente* funcione sin trabajo manual.

---

## 5. Rotación bajo demanda — cambio respecto de v0.2

Dijiste que tratás de ir lunes, martes, jueves y viernes, **pero que varía bastante y muchas veces terminás yendo el fin de semana**. Eso invalida el diseño anterior y hay que cambiarlo.

**Lo que había propuesto:** generar filas-fecha por adelantado (lun=D1, mar=D2, jue=D3, vie=D4, seis semanas hacia adelante).

**Por qué no sirve:** con asistencia variable, un calendario prefijado está permanentemente desfasado. Todos los días abrís la app y te muestra un día "pendiente" de una fecha que ya pasó, o nada porque hoy es sábado y el sábado no estaba en el plan. Terminás peleando con la app en lugar de usarla. *Confianza: alta — es el mismo problema que tienen las apps de hábitos con calendario rígido.*

**Lo que propongo ahora:** nada de fechas. El programa tiene una **secuencia** y un **puntero**.

- Abrís la app cualquier día, a cualquier hora: te ofrece **el siguiente día de la secuencia**. "Te toca D3 — Cadera + Tracción."
- Si querés otro, lo elegís de una lista y el puntero se ajusta.
- Al completar la sesión, el puntero avanza. Punto.
- Si no vas tres días, no hay nada vencido, nada rojo, nada que reprograme. La secuencia espera.
- Entrenás sábado y domingo seguidos: también funciona, hace D3 y D4.

**Lo que se pierde:** la noción de "sesión planificada para el 17 de noviembre", y con ella la métrica de adherencia contra un calendario.

**Lo que se gana en su lugar:** adherencia medida como **frecuencia real** — sesiones por semana contra una frecuencia objetivo (4), y días desde la última sesión. Para tu patrón de asistencia esa métrica dice más que un porcentaje contra fechas que nunca ibas a cumplir. Y además es honesta: mide lo que hacés, no lo que un calendario decía que ibas a hacer.

La tabla `schedule` queda en el esquema para el caso de querer agendar una semana puntual por adelantado, pero **no es la columna vertebral** y no se implementa en el v1.

---

## 6. Analítica

Ordenada por relación valor/esfuerzo.

**1. e1RM por ejercicio en el tiempo.** Epley ajustado: `e1RM = peso × (1 + 0,0333 × (reps + RIR))`. Requiere el RIR real, de ahí la decisión del punto 1.1. *Confianza: alta como tendencia; media en precisión absoluta — las fórmulas de 1RM se degradan por encima de ~10–12 reps totales.*

**2. Series efectivas por grupo muscular por semana.** Solo `tipo_serie = efectiva`, con factores de grupos secundarios. Driver principal de hipertrofia. Si lo comparás contra bandas MEV/MAV, tratalas como heurística: *confianza media-baja en los números específicos, son práctica acumulada más que evidencia dura.*

**3. Doble progresión.** Por ejercicio: peso a reps fijas, y reps a peso fijo.

**4. Carga de entrenamiento (Foster).** `carga = sRPE × minutos`. **Monotonía** = media de carga diaria semanal / su desvío estándar. **Strain** = carga semanal × monotonía. Monotonía alta con strain alto es el combo asociado a sobrecarga. Es análisis de varianza aplicado al entrenamiento. *Confianza: media-alta; metodología publicada y de uso extendido en deporte.*

**5. Adherencia y desvío.** Frecuencia real (sesiones por semana vs objetivo de 4) y días desde la última sesión; series completadas vs prescriptas; carga real vs prescripta por ejercicio. No hay adherencia contra calendario, por el punto 5.

**6. Detección de estancamiento.** Sin mejora de e1RM en N semanas (3–4 razonable).

**7. Balance de patrones.** Ratio empuje/tracción y bilateral/unilateral por semana.

**8. Readiness vs rendimiento.** Score de wellness contra e1RM relativo del día. Con 6 meses de datos puede decir algo real.

**9. Tonelaje.** Útil por ejercicio, ruidoso agregado.

**10. ACWR.** Fuera del v1: el modelo está metodológicamente cuestionado en la literatura reciente. *Confianza: baja.*

Toda la analítica tiene que **excluir o marcar los datos con `confianza: media`** (los importados del histórico viejo). Si no, los pesos dudosos de septiembre van a producir progresiones falsas.

---

## 7. UX y stack

### 7.1 Prioridades de UX, en orden

El riesgo real del proyecto no es técnico: es que registrar sea más lento que el papel.

1. **Prefill de la última sesión** — campos cargados y arriba "última vez: 150 kg × 4 @ int. 8". La feature de mayor impacto de todas.
2. **Sin teclado** — steppers +/− con incremento por ejercicio (2,5 kg barra, 2 kg mancuernas).
3. **Timer de descanso automático** al confirmar serie, con vibración, configurable por bloque.
4. **Captura de RIR en un tap** — fila de botones 0-4, no un campo de texto. Es la única forma de que el dato del punto 1.1 se registre de verdad.
5. **Calculadora de discos** con inventario configurable.
6. **Wake lock** — pantalla que no se apaga.
7. **Offline absoluto.**
8. **Histórico del ejercicio a un tap** desde la ejecución.
9. **Sustitución de ejercicio** que registra el desvío.
10. **UI de superseries y circuitos** que alterne A1/A2 sin perderte.
11. **Una mano, botones grandes, alto contraste.**

### 7.2 Stack

```
React 18 + TypeScript + Vite
Dexie.js (IndexedDB) · Zustand · Tailwind + shadcn/ui
Recharts · Zod (validación del JSON de import)
vite-plugin-pwa (Workbox)
Hosting: Cloudflare Pages / Vercel (free tier)
```

**Dexie y no SQLite WASM:** la tentación de reusar SQL de otro proyecto es razonable, pero SQLite WASM suma ~1 MB al bundle y complejidad de OPFS para un dataset que al año tendrá del orden de 10–20k filas en `set_log`. A esa escala la analítica se calcula en JS en milisegundos, y Dexie da índices, transacciones y migraciones con mucho menos fricción. *Confianza: alta.* Si en dos años querés SQL analítico, exportás a SQLite del lado del análisis, no de la app.

**Zod** no es decorativo: el importador es la superficie más frágil del sistema y necesita validación declarativa con errores legibles.

### 7.3 Dos cosas que rompen el proyecto si se pasan por alto

**`navigator.storage.persist()`.** Chrome en Android puede desalojar IndexedDB bajo presión de almacenamiento. Hay que pedirlo explícitamente al primer uso. Sin esto, un día el teléfono se queda sin espacio y perdés el histórico. *Confianza: alta en que el mecanismo existe y hay que invocarlo; media en la probabilidad real de desalojo.*

**Backup probado.** No des por bueno ningún backup que no hayas restaurado. Exportá, borrá los datos en un perfil de prueba, importá. Si no probaste la restauración, no tenés backup.

### 7.4 Backup a Drive
- **Fase 1 (v1, sin OAuth):** export completo a JSON, share sheet de Android → lo guardás en Drive. Import del mismo archivo. Cero infraestructura. Recordatorio semanal si no exportaste.
- **Fase 2:** OAuth2 con scope `drive.appdata` y subida automática. Requiere proyecto en Google Cloud, OAuth client con tu dominio autorizado, y mientras la app esté sin verificar tenés que agregarte como usuario de prueba (límite 100). *Confianza: media-alta — funciona hoy, pero es el componente más probable de romperse con el tiempo por cambios de política de Google.*

### 7.5 Compartirla
Mandás la URL, el otro la instala desde Chrome, sus datos viven en su navegador. Sin cuentas, sin backend, sin costo, sin que vos veas su información. Datos compartidos entre usuarios sería otro proyecto.

---

## 8. Orden de construcción

Cada fase tiene que ser usable sola.

**Fase 0 — Semilla de datos.** Convertir el inventario de 96 ejercicios a `plan-gym/v1` (slugs, grupos, patrones, equipamiento, `mide_en`). Sin esto, la fase 1 arranca con un catálogo vacío y cargás 96 ejercicios a mano.

**Fase 1 — Registrar.** Sesión libre, `set_log` con peso/reps-o-tiempo/RIR/intensidad, lastre, al-fallo, unilateral, timer, prefill, export/import JSON. **Criterio de salida: una semana entera en el gimnasio sin volver al papel.** No pasar a fase 2 antes de cumplirlo.

**Fase 2 — Planificar e importar.** Plantillas de día, bloques, `planned_set`, importador con dry-run y resolución de ejercicios, rotación con puntero, duplicación de día y semana.

**Fase 3 — Analizar.** e1RM, volumen por grupo, doble progresión, adherencia, estancamiento.

**Fase 4 — Contexto.** Wellness diario (5 ítems, confirmado), peso corporal con media móvil, perímetros, dolor, carga/monotonía/strain.

**Fase 5 — Pulido.** Discos, config de máquina, import del histórico sep–nov, backup automático a Drive.

---

## 9. Automatización y repetibilidad

- **SKILL.md + PROJECT_STATUS.md**, como en otro proyecto. Con el modelo de datos y las convenciones (gramos enteros, plantilla ≠ instancia, prescripción por serie, objetivo con discriminador, soft delete) escritos ahí, Claude Code no improvisa un esquema distinto en la sesión 10. Es lo que más va a ahorrar en este proyecto.
- **Skill "generar plan"** — el caso más claro. Tiene que contener tu catálogo con slugs, la estructura B1–B7 de tu coach, las convenciones de nomenclatura y el esquema `plan-gym/v1`. Con eso, "armame un mesociclo de 6 semanas con énfasis en bisagra" devuelve un JSON que importa sin tocar nada. **Sin esta Skill, cada plan generado va a traer nombres y estructura distintos y el importador va a pedir mapeo manual todo el tiempo.**
- **Skill "capturas del coach → JSON"** — formaliza lo que ya hiciste a mano en el chat de extracción. Dado que elegiste modo mixto, es el cuello de botella recurrente del sistema.
- **Skill "review de mesociclo"** — toma el export de histórico y devuelve volumen por grupo, progresión por ejercicio y estancamientos. Análisis recurrente de formato fijo.
