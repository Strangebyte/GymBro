import { db, GRUPO_NUEVO, kgToG, type Exercise, type PSet } from './db'
import { agruparPorCategoria, etiqueta, GRUPOS, norm, setValido } from './lib'
import { crearEjercicio } from './actions'

export const PLAN_FORMAT = 'plan-gym/v1'

export interface ImpEj { original: string; clave: string; notas: string | null; series: PSet[] }
export interface ImpDia { nombre: string; bloques: { orden: number; ejercicios: ImpEj[] }[] }
export interface ImpPlan {
  nombre: string
  objetivo: string | null
  dias: ImpDia[]
  /** clave normalizada -> id del ejercicio del catálogo, o null si no se reconoce */
  resueltos: Map<string, number | null>
  /** `grupo`: músculo principal que trae el archivo para un ejercicio nuevo, si lo trae y es válido. */
  desconocidos: { clave: string; original: string; sugerencia: Exercise | null; grupo: string | null }[]
  errores: string[]
}

export type Resolucion =
  | { tipo: 'crear'; nombre: string; grupo: string }
  | { tipo: 'vincular'; id: number }

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
  return Number.isFinite(n) ? n : null
}

function leerSerie(o: Record<string, unknown>): PSet {
  const s: PSet = {}
  const reps = num(o.reps ?? o.repeticiones)
  const seg = num(o.seg ?? o.segundos ?? o.tiempo_s ?? o.tiempo ?? o.duracion_s)
  const peso = num(o.peso_kg ?? o.peso ?? o.lastre_kg)
  const rir = num(o.rir)
  const rpe = num(o.rpe ?? o.intensidad)
  if (reps != null) s.reps = reps
  if (seg != null) s.seg = seg
  if (peso != null && peso !== 0) s.peso_g = kgToG(peso)
  if (rir != null) s.rir = rir
  if (rpe != null) s.rpe = rpe
  if (o.al_fallo === true || o.fallo === true) s.fallo = true
  return s
}

/** Músculo principal que trae el archivo para un ejercicio nuevo: acepta la clave, el nombre visible o una clave vieja. */
function grupoDe(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = norm(v)
  for (const g of GRUPOS) if (t === norm(g) || t === norm(etiqueta(g))) return g
  const clave = t.replace(/ /g, '_')
  return GRUPO_NUEVO[clave] ?? ({ hombro: 'hombros', gluteos: 'gluteo', gemelo: 'gemelos', isquios: 'isquiotibiales', abductores: 'aductores_abductores', aductores: 'aductores_abductores', dorsales: 'espalda', lumbar: 'lumbares', abdominales: 'core', antebrazo: 'antebrazos' } as Record<string, string>)[clave] ?? null
}

/** Coeficiente de Dice sobre bigramas: tolera plurales, acentos y errores de tipeo. */
function similitud(a: string, b: string): number {
  const bg = (t: string) => { const x = t.replace(/ /g, ''); const m = new Map<string, number>(); for (let i = 0; i < x.length - 1; i++) { const k = x.slice(i, i + 2); m.set(k, (m.get(k) ?? 0) + 1) } return m }
  const A = bg(a), B = bg(b)
  let inter = 0, na = 0, nb = 0
  for (const [k, v] of A) { na += v; inter += Math.min(v, B.get(k) ?? 0) }
  for (const v of B.values()) nb += v
  return na + nb ? (2 * inter) / (na + nb) : 0
}

/** Lee y valida un archivo de plan. No escribe nada. */
export function leerPlan(texto: string, catalogo: Exercise[]): ImpPlan {
  const out: ImpPlan = { nombre: 'Plan importado', objetivo: null, dias: [], resueltos: new Map(), desconocidos: [], errores: [] }
  let data: Record<string, unknown>
  // Si viene pegado desde un chat puede traer texto alrededor: se toma lo que está entre la primera y la última llave.
  const desde = texto.indexOf('{'), hasta = texto.lastIndexOf('}')
  if (desde >= 0 && hasta > desde) texto = texto.slice(desde, hasta + 1)
  try { data = JSON.parse(texto) } catch {
    out.errores.push('El contenido no es un JSON válido. Si lo copiaste de un chat, copiá el bloque de código completo.')
    return out
  }
  if (data.formato !== PLAN_FORMAT) out.errores.push(`Formato no reconocido: "${String(data.formato ?? '')}". Se esperaba "${PLAN_FORMAT}".`)
  const cab = (data.plan ?? data.programa ?? {}) as Record<string, unknown>
  if (typeof cab.nombre === 'string' && cab.nombre.trim()) out.nombre = cab.nombre.trim()
  if (typeof cab.objetivo === 'string' && cab.objetivo.trim()) out.objetivo = cab.objetivo.trim()

  const indice = new Map<string, number>()
  for (const e of catalogo) {
    for (const n of [e.nombre, e.slug, e.legible ?? '', ...(e.alias ?? [])]) if (n) indice.set(norm(n), e.id!)
  }

  const dias = Array.isArray(data.dias) ? (data.dias as Record<string, unknown>[]) : []
  if (!dias.length) out.errores.push('El archivo no tiene ningún día ("dias").')
  dias.forEach((d, di) => {
    const nombreDia = typeof d.nombre === 'string' && d.nombre.trim() ? d.nombre.trim()
      : typeof d.etiqueta === 'string' && d.etiqueta.trim() ? d.etiqueta.trim() : `Día ${di + 1}`
    const dia: ImpDia = { nombre: nombreDia, bloques: [] }
    const bloques = Array.isArray(d.bloques) ? (d.bloques as Record<string, unknown>[]) : []
    if (!bloques.length) out.errores.push(`${nombreDia}: no tiene bloques.`)
    bloques.forEach((b, bi) => {
      const orden = num(b.orden) ?? bi + 1
      const ejercicios = Array.isArray(b.ejercicios) ? (b.ejercicios as Record<string, unknown>[]) : []
      const bloque = { orden, ejercicios: [] as ImpEj[] }
      ejercicios.forEach((e, ei) => {
        const donde = `${nombreDia}, bloque ${orden}, ejercicio ${ei + 1}`
        const original = String(e.ejercicio ?? e.nombre ?? e.slug ?? '').trim()
        if (!original) { out.errores.push(`${donde}: falta el nombre ("ejercicio").`); return }
        let series: PSet[] = []
        if (Array.isArray(e.series)) series = (e.series as Record<string, unknown>[]).map(leerSerie)
        else if (num(e.series) != null) series = Array.from({ length: num(e.series)! }, () => leerSerie(e))
        if (!series.length) out.errores.push(`${donde} (${original}): no tiene series.`)
        series.forEach((s, si) => {
          if (!setValido(s)) out.errores.push(`${donde} (${original}), serie ${si + 1}: necesita al menos reps, peso, RIR, RPE o tiempo.`)
          if (s.rir != null && s.rpe != null) out.errores.push(`${donde} (${original}), serie ${si + 1}: tiene RIR y RPE a la vez; va uno solo.`)
        })
        const clave = norm(original)
        if (!out.resueltos.has(clave)) {
          const id = indice.get(clave) ?? null
          out.resueltos.set(clave, id)
          if (id == null) {
            let mejor: Exercise | null = null, punt = 0
            for (const c of catalogo) { const p = similitud(clave, norm(c.nombre)); if (p > punt) { punt = p; mejor = c } }
            out.desconocidos.push({ clave, original, sugerencia: punt >= 0.62 ? mejor : null, grupo: grupoDe(e.grupo) })
          }
        }
        bloque.ejercicios.push({ original, clave, notas: typeof e.notas === 'string' && e.notas.trim() ? e.notas.trim() : null, series })
      })
      dia.bloques.push(bloque)
    })
    out.dias.push(dia)
  })
  return out
}

/** Guarda el plan leído. Crea o vincula los ejercicios desconocidos según lo resuelto por el usuario. */
export async function guardarPlan(imp: ImpPlan, resoluciones: Map<string, Resolucion>, activar: boolean): Promise<number> {
  const ids = new Map<string, number>()
  for (const [clave, id] of imp.resueltos) if (id != null) ids.set(clave, id)
  for (const d of imp.desconocidos) {
    const r = resoluciones.get(d.clave)
    if (!r) throw new Error(`Falta resolver el ejercicio "${d.original}".`)
    if (r.tipo === 'crear') {
      const nombre = r.nombre.trim() || d.original
      // Si ya hay uno con ese nombre (del catálogo o recién creado en esta misma importación), se usa ese: no duplicar.
      const igual = (await db.exercises.toArray()).find((x) => norm(x.nombre) === norm(nombre))
      if (igual) {
        if (norm(igual.nombre) !== d.clave && !(igual.alias ?? []).some((a) => norm(a) === d.clave)) await db.exercises.update(igual.id!, { alias: [...(igual.alias ?? []), d.original] })
        ids.set(d.clave, igual.id!)
      } else {
        ids.set(d.clave, await crearEjercicio({ nombre, grupo: r.grupo, alias: norm(nombre) !== d.clave ? [d.original] : [] }))
      }
    } else {
      const ex = await db.exercises.get(r.id)
      if (!ex) throw new Error(`El ejercicio vinculado a "${d.original}" ya no existe.`)
      if (!(ex.alias ?? []).some((a) => norm(a) === d.clave)) await db.exercises.update(r.id, { alias: [...(ex.alias ?? []), d.original] })
      ids.set(d.clave, r.id)
    }
  }
  return db.transaction('rw', db.plans, db.planDays, async () => {
    if (activar) for (const p of await db.plans.toArray()) await db.plans.update(p.id!, { activo: false })
    const planId = await db.plans.add({ nombre: imp.nombre, objetivo: imp.objetivo, activo: activar, cursor: 0, creado: Date.now() })
    await db.planDays.bulkAdd(imp.dias.map((d, i) => ({
      plan_id: planId, orden: i, nombre: d.nombre,
      bloques: d.bloques.map((b) => ({
        orden: b.orden,
        ejercicios: b.ejercicios.map((e) => ({ exercise_id: ids.get(e.clave)!, notas: e.notas, series: e.series })),
      })),
    })))
    return planId
  })
}

/** Exporta un plan en el mismo formato que acepta el importador. */
export async function exportarPlan(planId: number): Promise<string> {
  const plan = await db.plans.get(planId)
  if (!plan) throw new Error('Plan inexistente')
  const dias = (await db.planDays.where('plan_id').equals(planId).toArray()).sort((a, b) => a.orden - b.orden)
  const nombres = new Map((await db.exercises.toArray()).map((e) => [e.id!, e.nombre]))
  const serie = (s: PSet) => {
    const o: Record<string, unknown> = {}
    if (s.reps != null) o.reps = s.reps
    if (s.seg != null) o.seg = s.seg
    if (s.peso_g) o.peso_kg = s.peso_g / 1000
    if (s.rir != null) o.rir = s.rir
    if (s.rpe != null) o.rpe = s.rpe
    if (s.fallo) o.al_fallo = true
    return o
  }
  return JSON.stringify({
    formato: PLAN_FORMAT,
    plan: { nombre: plan.nombre, objetivo: plan.objetivo ?? undefined },
    dias: dias.map((d) => ({
      nombre: d.nombre,
      bloques: d.bloques.map((b) => ({
        orden: b.orden,
        ejercicios: b.ejercicios.map((e) => ({
          ejercicio: nombres.get(e.exercise_id) ?? `id ${e.exercise_id}`,
          ...(e.notas ? { notas: e.notas } : {}),
          series: e.series.map(serie),
        })),
      })),
    })),
  }, null, 1)
}

export const EJEMPLO_PLAN = `{
 "formato": "plan-gym/v1",
 "plan": { "nombre": "Mi plan", "objetivo": "Fuerza" },
 "dias": [
  { "nombre": "Día 1",
    "bloques": [
     { "orden": 1, "ejercicios": [
        { "ejercicio": "Psoas DINÁMICO", "series": [ {"reps": 10}, {"reps": 10} ] } ] },
     { "orden": 2, "ejercicios": [
        { "ejercicio": "Press plano", "notas": "Subir si sale fácil",
          "series": [ {"reps": 8, "peso_kg": 80, "rpe": 8},
                      {"reps": 6, "peso_kg": 82.5, "rpe": 9} ] },
        { "ejercicio": "Dominadas PRONA", "series": 3, "reps": 7, "peso_kg": 20, "rir": 2 },
        { "ejercicio": "Hollow", "series": [ {"seg": 45}, {"seg": 45} ] } ] }
    ] }
 ]
}`

/**
 * Texto listo para pegar en una IA (Claude u otra) y que devuelva un plan importable.
 * `crear`: la IA arma un plan nuevo. `convertir`: la IA pasa al formato un plan que la persona ya tiene.
 * Los dos llevan el formato, las reglas y los ejercicios del catálogo de esta persona.
 */
export function pedidoParaIA(catalogo: Exercise[], modo: 'crear' | 'convertir' = 'crear'): string {
  const lista = agruparPorCategoria(catalogo.filter((e) => !e.archivo))
    .map((g) => `${g.cat}:\n${g.items.map((e) => `- "${e.nombre}"${e.legible ? ` (${e.legible})` : ''}`).join('\n')}`)
    .join('\n\n')
  const intro = modo === 'crear'
    ? `Necesito que me armes un plan de entrenamiento para importar en mi app de gimnasio (GymBro).

Antes de armar el plan necesitás conocerme. Reglas para preguntar:
- Preguntá en tandas de 4 a 6 preguntas, no todas de golpe.
- No armes el plan sin respuesta a las preguntas 2, 3 y 4.
- Si aparece una señal de alarma (dolor de pecho, mareos o desmayos, dolor nocturno, hormigueo o pérdida de fuerza que se irradia, lesión aguda sin diagnóstico, cirugía sin alta, presión alta no controlada, embarazo o posparto sin autorización médica): no armes el plan y decime que consulte a un médico.
- Si ya te di un dato, no lo vuelvas a preguntar. Si una respuesta sobre días, tiempo o equipamiento es vaga, repreguntá.
- Si te digo que lo armes con lo que hay, hacelo, pero aclarando qué supusiste.

Salud
1. Edad, sexo, altura y peso.
2. ¿Algún médico te dijo que no entrenes o que lo hagas solo con supervisión? ¿Tomás medicación que afecte la presión, el pulso o la energía?
3. ¿Tenés dolor ahora, o una lesión o cirugía que siga dando síntomas? ¿Cuál y qué movimiento lo despierta?
4. ¿Hay movimientos que no podés hacer o que evitás por molestia?

Objetivo
5. ¿Qué querés lograr, en tus palabras?
6. Si tuvieras que elegir uno solo: fuerza, masa muscular, perder grasa, salud y energía, o rendir en un deporte (¿cuál?).
7. ¿Hay una fecha o un evento? ¿Cuántas semanas pensás seguir este plan?

Nivel
8. ¿Cuánto tiempo entrenaste con continuidad y cuándo fue la última vez?
9. ¿Qué cargas movés hoy en sentadilla, peso muerto, press de banca y press militar? ¿Cuántas dominadas y flexiones hacés? Si no sabés, decímelo y dejo los pesos sin cargar.
10. ¿Dominás la técnica de esos ejercicios básicos o preferís arrancar con variantes más simples?
11. ¿Sabés qué son el RIR y el RPE? Si no, armo el plan solo con series y repeticiones.

Tiempo
12. ¿Cuántos días por semana podés entrenar de forma realista? En una semana mala, ¿cuántos garantizás?
13. ¿Cuánto tiempo tenés por sesión?

Equipamiento
14. ¿Dónde entrenás: gimnasio, casa o las dos?
15. ¿Qué tenés disponible? Rack, barra y discos, mancuernas (hasta cuántos kg), poleas, máquinas, barra de dominadas, bandas, kettlebells.

Recuperación
16. ¿Cuántas horas dormís y cómo venís de estrés?
17. ¿Hacés otro deporte o actividad física en paralelo? ¿Cuál, cuántas veces por semana y qué tan intenso?

Preferencias
18. ¿Qué ejercicios o tipo de entrenamiento disfrutás y cuáles no querés ver?
19. ¿Preferís repetir la misma rutina y progresar en los números, o necesitás variedad?
20. ¿Querés que cada sesión incluya entrada en calor, movilidad y core, o solo el trabajo principal?
21. ¿Qué te hizo abandonar planes anteriores? (tiempo, aburrimiento, dolor, falta de resultados)
22. ¿Algo más que deba saber? (viajes, restricciones de espacio o de ruido)

Cómo funciona la app, para que el plan encaje: los días rotan en orden y sin fechas (si salteo un día, el siguiente me espera), cada día se divide en bloques de ejercicios que se hacen juntos, y la app registra sola pesos, repeticiones y progreso. Si el plan lleva una progresión entre semanas, explicala en "objetivo" o en las "notas" de cada ejercicio.

Cuando tengas todo, respondé`
    : `Ya tengo un plan de entrenamiento y necesito pasarlo al formato de mi app de gimnasio (GymBro), sin cambiarlo. Te lo paso junto con este mensaje (como texto, foto o archivo). Si no lo ves, pedímelo antes de seguir.

Pasalo tal cual está: los mismos días, en el mismo orden, con los mismos ejercicios, series, repeticiones y pesos. No agregues, quites ni "mejores" nada. Si algo no se lee o no queda claro, preguntame en vez de inventarlo. Si mi plan no agrupa los ejercicios, poné cada uno en su propio bloque; los que se hacen juntos (superserie, circuito) van en el mismo bloque.

Respondé`
  const ejercicios = modo === 'crear'
    ? `Ejercicios: siempre que puedas usá estos, que son los que ya tiene mi app. En "ejercicio" va solo el texto que está entre comillas, tal cual; lo que sigue entre paréntesis es una aclaración para vos. Si necesitás uno que no está en la lista, ponele un nombre claro en español: la app me va a preguntar si lo creo.`
    : `Ejercicios: estos son los que ya tiene mi app. Si un ejercicio de mi plan es el mismo que uno de esta lista, aunque esté escrito distinto o en otro idioma, usá el nombre de la lista: en "ejercicio" va solo el texto que está entre comillas, tal cual; lo que sigue entre paréntesis es una aclaración para vos. Si no está en la lista, dejá el nombre como figura en mi plan: la app me va a preguntar si lo creo.`
  return `${intro} con UN SOLO bloque de código JSON, completo, con exactamente este formato ("${PLAN_FORMAT}"):

${EJEMPLO_PLAN}

Reglas del formato:
- Jerarquía: plan → dias → bloques → ejercicios → series. Un bloque agrupa los ejercicios que se hacen juntos (por ejemplo: movilidad, fuerza principal, accesorios).
- Cada serie lleva al menos uno de: "reps", "seg" (tiempo en segundos), "peso_kg", "rir", "rpe" o "al_fallo": true.
- "rir" y "rpe" nunca van juntos en la misma serie. RIR son las repeticiones en reserva (0 = al fallo). RPE es el esfuerzo de 1 a 10 (10 = al fallo).
- Si todas las series de un ejercicio son iguales se puede abreviar con "series": 3 y los valores al lado. Si cambian (series ascendentes, por ejemplo), escribilas una por una.
- En ejercicios con lastre (dominadas, fondos), "peso_kg" es el peso agregado.
- "peso_kg" es opcional: si no sabés qué carga uso, no lo pongas. No inventes pesos.
- Si usás un ejercicio que no está en mi lista, agregale "grupo" con su músculo principal, uno de: ${GRUPOS.map(etiqueta).join(', ')}.
- "notas" es opcional, para una indicación corta por ejercicio.
- Los días rotan en el orden del archivo: no llevan fechas ni días de la semana.
- Tiene que ser JSON válido: sin comentarios y sin comas finales.

${ejercicios}

${lista}
`
}
