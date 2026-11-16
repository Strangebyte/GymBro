import Dexie, { type Table } from 'dexie'
import seed from './seed.json'

// Plan e historial personales: archivos opcionales que no están en el repositorio. Si faltan, la app arranca sin planes ni sesiones.
const planSemilla = Object.values(import.meta.glob('./seed-plan.json', { eager: true, import: 'default' }))[0] as SeedPlan | undefined
const historial = Object.values(import.meta.glob('./seed-historial.json', { eager: true, import: 'default' }))[0] as SeedHist[] | undefined

export const BACKUP_FORMAT = 'gym-log-backup/v2'

export type Mide = 'reps' | 'seg' | 'ambos'

export interface Exercise {
  id?: number
  slug: string
  nombre: string
  legible: string | null
  grupo: string
  sec: { grupo: string; factor: number }[]
  equipo: string
  patron: string
  unilateral: boolean
  lastre: boolean
  mide: Mide
  vol: boolean
  inc: number | null
  archivo: boolean
  notas: string | null
  alias: string[]
  custom: boolean
  descanso_s: number | null
  /** El usuario lo modificó desde la app: las revisiones del catálogo ya no le pisan el nombre ni los demás datos. */
  editado?: boolean
  /** Enlace externo a un video o página del ejercicio. */
  url?: string | null
}

/** Video o imagen de un ejercicio, guardado en el dispositivo. No entra en la copia de seguridad. */
export interface Media {
  exercise_id: number
  tipo: 'imagen' | 'video'
  blob: Blob
  nombre: string
  size: number
}

/** Serie prescripta. Pesos siempre en gramos enteros. RIR y RPE son excluyentes. */
export interface PSet {
  reps?: number | null
  seg?: number | null
  peso_g?: number | null
  rir?: number | null
  rpe?: number | null
  fallo?: boolean
}
export interface PExercise { exercise_id: number; notas: string | null; series: PSet[] }
export interface PBlock { orden: number; ejercicios: PExercise[] }

export interface Plan {
  id?: number
  nombre: string
  objetivo: string | null
  activo: boolean
  cursor: number
  creado: number
}
export interface PlanDay {
  id?: number
  plan_id: number
  orden: number
  nombre: string
  bloques: PBlock[]
}

export interface Wellness { sueno: number; dolor: number; cansancio: number; estres: number; energia: number }

export interface Session {
  id?: number
  fecha: string
  inicio: number
  fin: number | null
  estado: 'en_curso' | 'completada'
  plan_id: number | null
  plan_day_id: number | null
  nombre: string
  wellness: Wellness | null
  wellness_prom: number | null
  srpe: number | null
  notas: string | null
  origen: 'app' | 'importado'
  dur_min: number | null
  /** Sesión de un día pasado cargada después desde el calendario: sin reloj en vivo. */
  retro?: boolean
}

export interface SetLog {
  id?: number
  session_id: number
  exercise_id: number
  bloque: number
  orden: number
  serie: number
  tipo: 'efectiva' | 'calentamiento'
  reps: number | null
  seg: number | null
  peso_g: number | null
  rir: number | null
  rpe: number | null
  fallo: boolean
  hecha: boolean
  ts: number
  plan: PSet | null
  confianza: 'alta' | 'media'
}

export interface Activity {
  id?: number
  fecha: string
  tipo: string
  dur_min: number | null
  esfuerzo: number | null
  notas: string | null
}

export interface Meta { key: string; value: unknown }

export interface Settings {
  tema: 'claro' | 'oscuro'
  /** Color principal de la app. Cada paleta tiene su versión clara y oscura (styles.css). */
  paleta: 'verde' | 'azul' | 'violeta'
  objetivo_semanal: number
  descanso_s: number
  vibrar: boolean
  /** Sonido al terminar el descanso. */
  sonido: boolean
  tipos_actividad: string[]
  /** Dónde va el tilde de "hecho" durante la sesión. */
  tilde: 'bloque' | 'ejercicio'
  /** Ejercicios elegidos para seguir en Progreso. Sin definir: los más frecuentes. */
  seguimiento?: number[]
  /** Momento de la última copia de seguridad y hasta qué sesión (id) llegó. */
  ultima_copia?: number
  copia_hasta?: number
}
export const SETTINGS_DEFAULT: Settings = {
  tema: 'claro',
  paleta: 'verde',
  objetivo_semanal: 4,
  descanso_s: 120,
  vibrar: true,
  sonido: true,
  tilde: 'bloque',
  tipos_actividad: ['Correr', 'Pádel', 'Fútbol', 'Squash', 'Tenis', 'Bici', 'Natación', 'Caminata', 'Senderismo', 'Yoga'],
}

class GymDB extends Dexie {
  exercises!: Table<Exercise, number>
  plans!: Table<Plan, number>
  planDays!: Table<PlanDay, number>
  sessions!: Table<Session, number>
  setLogs!: Table<SetLog, number>
  activities!: Table<Activity, number>
  meta!: Table<Meta, string>
  media!: Table<Media, number>
  constructor() {
    super('gym-log-v2')
    // Migraciones futuras: this.version(2).stores({...}).upgrade(tx => ...)
    this.version(1).stores({
      exercises: '++id, &slug',
      plans: '++id',
      planDays: '++id, plan_id',
      sessions: '++id, fecha, estado',
      setLogs: '++id, session_id, exercise_id',
      activities: '++id, fecha',
      meta: 'key',
    })
    this.version(2).stores({ media: 'exercise_id' })
  }
}
export const db = new GymDB()

export async function getSettings(): Promise<Settings> {
  const row = await db.meta.get('settings')
  return { ...SETTINGS_DEFAULT, ...((row?.value as Partial<Settings>) ?? {}) }
}
export async function setSettings(s: Partial<Settings>): Promise<void> {
  const cur = await getSettings()
  await db.meta.put({ key: 'settings', value: { ...cur, ...s } })
}

/** Anota que los datos actuales ya están en un archivo de copia. */
export async function marcarCopia(): Promise<void> {
  const ult = await db.sessions.orderBy(':id').last()
  await setSettings({ ultima_copia: Date.now(), copia_hasta: ult?.id ?? 0 })
}

export const kgToG = (kg: number): number => Math.round(kg * 1000)

// ------------------------------------------------------------------ semilla
type SeedSet = { reps?: number; seg?: number; peso_kg?: number; rir?: number; rpe?: number; fallo?: boolean }
type SeedEx = {
  slug: string; nombre: string; legible: string | null; grupo: string
  sec: { grupo: string; factor: number }[]; equipo: string; patron: string
  unilateral: boolean; lastre: boolean; mide: string; vol: boolean; inc: number | null
  archivo: boolean; notas: string | null; alias?: string[]
}
type SeedData = {
  exercises: SeedEx[]
  /** Revisión del catálogo: qué ejercicios se fusionaron o se borraron respecto de la anterior. */
  catalogo?: { rev: number; fusiones: Record<string, string>; borrar: string[]; eliminar?: string[] }
}
type SeedPlan = { nombre: string; objetivo: string; dias: { nombre: string; bloques: { orden: number; ejercicios: { slug: string; notas: string | null; series: SeedSet[] }[] }[] }[] }
type SeedHist = { fecha: string; nombre: string; dur: number | null; wellness: number | null; notas: string | null; sets: (string | number | null)[][] }

function descansoDefault(e: SeedEx): number {
  if (!e.vol) return 30
  if (e.patron === 'aislamiento') return 75
  if (e.patron === 'pliometria' || e.patron.startsWith('core') || e.patron === 'acarreo' || e.patron === 'locomocion') return 60
  return 150
}

export function pset(s: SeedSet): PSet {
  const o: PSet = {}
  if (s.reps != null) o.reps = s.reps
  if (s.seg != null) o.seg = s.seg
  if (s.peso_kg != null) o.peso_g = kgToG(s.peso_kg)
  if (s.rir != null) o.rir = s.rir
  if (s.rpe != null) o.rpe = s.rpe
  if (s.fallo) o.fallo = true
  return o
}

// Revisión 3 del catálogo: grupos y patrones unificados. Clave vieja -> clave nueva. Tiene que coincidir con
// GRUPOS y PATRONES de tools/nombres/aplicar.py. Sirve también para leer planes o copias con las claves viejas.
export const GRUPO_NUEVO: Record<string, string> = {
  dorsal: 'espalda', trapecio: 'espalda',
  hombro_anterior: 'hombros', hombro_lateral: 'hombros', hombro_posterior: 'hombros',
  isquios: 'isquiotibiales', aductores: 'aductores_abductores', gemelo: 'gemelos', full_body: 'cuerpo_completo',
  movilidad_cadera: 'movilidad', movilidad_dorsal: 'movilidad', movilidad_isquios: 'movilidad',
  movilidad_posterior: 'movilidad', movilidad_aductores: 'movilidad',
}
export const PATRON_NUEVO: Record<string, string> = {
  core_antiextension: 'core', core_antiflexion_lateral: 'core', core_antirotacion: 'core', core_rotacion: 'core',
  locomocion: 'acarreo',
}
/** Pasa grupo, secundarios y patrón de un ejercicio a las claves nuevas. Devuelve null si no hay nada que cambiar. */
function clavesNuevas(e: Exercise): Pick<Exercise, 'grupo' | 'sec' | 'patron'> | null {
  const grupo = GRUPO_NUEVO[e.grupo] ?? e.grupo
  const patron = PATRON_NUEVO[e.patron] ?? e.patron
  const junta = new Map<string, number>()
  for (const x of e.sec ?? []) {
    const k = GRUPO_NUEVO[x.grupo] ?? x.grupo
    if (k !== grupo) junta.set(k, Math.max(junta.get(k) ?? 0, x.factor))   // dos secundarios que ahora son el mismo: queda el mayor
  }
  const sec = [...junta].map(([g, factor]) => ({ grupo: g, factor }))
  const igual = grupo === e.grupo && patron === e.patron && JSON.stringify(sec) === JSON.stringify(e.sec ?? [])
  return igual ? null : { grupo, sec, patron }
}

function deSemilla(e: SeedEx): Exercise {
  return {
    slug: e.slug, nombre: e.nombre, legible: e.legible, grupo: e.grupo, sec: e.sec, equipo: e.equipo,
    patron: e.patron, unilateral: e.unilateral, lastre: e.lastre, mide: e.mide as Mide, vol: e.vol,
    inc: e.inc, archivo: e.archivo, notas: e.notas, alias: e.alias ?? [], custom: false, descanso_s: descansoDefault(e),
  }
}

/**
 * Pone al día el catálogo de una app ya instalada cuando sale una revisión nueva (nombres, otros nombres,
 * ejercicios fusionados, borrados o agregados). Corre una vez por revisión y también al restaurar una copia vieja.
 * Los ejercicios se reconocen por `slug`, que nunca cambia; el historial y los planes apuntan al id, así que no se pierden.
 */
export async function actualizarCatalogo(): Promise<void> {
  const data = seed as unknown as SeedData
  const rev = data.catalogo?.rev ?? 1
  const actual = ((await db.meta.get('catalogo'))?.value as number | undefined) ?? 1
  if (actual >= rev || !data.catalogo) return
  const { fusiones, borrar, eliminar = [] } = data.catalogo
  await db.transaction('rw', [db.exercises, db.planDays, db.setLogs, db.media, db.meta], async () => {
    // 0. Grupos y patrones a las claves nuevas, en todos los ejercicios (también los que creó el usuario).
    for (const e of await db.exercises.toArray()) {
      const c = clavesNuevas(e)
      if (c) await db.exercises.update(e.id!, c)
    }
    const porSlug = new Map((await db.exercises.toArray()).map((e) => [e.slug, e]))
    const dias = await db.planDays.toArray()
    const enPlanes = (id: number) => dias.some((d) => d.bloques.some((b) => b.ejercicios.some((x) => x.exercise_id === id)))

    // 1. Ejercicios que eran el mismo: el historial y los planes del que desaparece pasan al que queda.
    for (const [de, a] of Object.entries(fusiones)) {
      const viejo = porSlug.get(de), destino = porSlug.get(a)
      if (!viejo) continue
      if (!destino) { await db.exercises.update(viejo.id!, { slug: a }); porSlug.set(a, { ...viejo, slug: a }); porSlug.delete(de); continue }
      await db.setLogs.where('exercise_id').equals(viejo.id!).modify({ exercise_id: destino.id! })
      for (const d of dias) {
        if (!d.bloques.some((b) => b.ejercicios.some((x) => x.exercise_id === viejo.id))) continue
        d.bloques = d.bloques.map((b) => ({ ...b, ejercicios: b.ejercicios.map((x) => (x.exercise_id === viejo.id ? { ...x, exercise_id: destino.id! } : x)) }))
        await db.planDays.update(d.id!, { bloques: d.bloques })
      }
      const ajustes = (await db.meta.get('settings'))?.value as Partial<Settings> | undefined
      if (ajustes?.seguimiento?.includes(viejo.id!)) {
        await db.meta.put({ key: 'settings', value: { ...ajustes, seguimiento: [...new Set(ajustes.seguimiento.map((x) => (x === viejo.id ? destino.id! : x)))] } })
      }
      await db.media.delete(viejo.id!)
      await db.exercises.delete(viejo.id!)
      porSlug.delete(de)
    }
    // 2. Ejercicios retirados: se borran solo si nunca se usaron; si no, quedan archivados.
    for (const s of borrar) {
      const e = porSlug.get(s)
      if (!e) continue
      if ((await db.setLogs.where('exercise_id').equals(e.id!).count()) > 0 || enPlanes(e.id!)) await db.exercises.update(e.id!, { archivo: true })
      else { await db.media.delete(e.id!); await db.exercises.delete(e.id!) }
      porSlug.delete(s)
    }
    // 2b. Ejercicios borrados del todo (lo pidió el dueño): se van con sus series registradas y salen de los planes.
    for (const s of eliminar) {
      const e = porSlug.get(s)
      if (!e) continue
      await db.setLogs.where('exercise_id').equals(e.id!).delete()
      for (const d of dias) {
        if (!enPlanes(e.id!) || !d.bloques.some((b) => b.ejercicios.some((x) => x.exercise_id === e.id))) continue
        d.bloques = d.bloques.map((b) => ({ ...b, ejercicios: b.ejercicios.filter((x) => x.exercise_id !== e.id) }))
        await db.planDays.update(d.id!, { bloques: d.bloques })
      }
      const ajustes = (await db.meta.get('settings'))?.value as Partial<Settings> | undefined
      if (ajustes?.seguimiento?.includes(e.id!)) await db.meta.put({ key: 'settings', value: { ...ajustes, seguimiento: ajustes.seguimiento.filter((x) => x !== e.id) } })
      await db.media.delete(e.id!)
      await db.exercises.delete(e.id!)
      porSlug.delete(s)
    }
    // 3. Nombres, otros nombres y equipamiento de los que quedan; alta de los que faltan.
    for (const s of data.exercises) {
      const e = porSlug.get(s.slug)
      if (!e) { await db.exercises.add(deSemilla(s)); continue }
      const alias = [...(e.alias ?? [])]
      for (const a of s.alias ?? []) if (!alias.includes(a)) alias.push(a)
      if (e.custom || e.editado) await db.exercises.update(e.id!, { alias })   // creado o modificado por el usuario: no se pisa
      else await db.exercises.update(e.id!, {
        nombre: s.nombre, legible: s.legible, grupo: s.grupo, sec: s.sec, equipo: s.equipo, patron: s.patron, alias,
        // Lo archivado solo se tocó en la revisión 2 (se sacaron los archivados de fábrica); después es decisión del usuario.
        ...(actual < 2 ? { archivo: s.archivo } : {}),
      })
    }
    await db.meta.put({ key: 'catalogo', value: rev })
  })
}

let seeding: Promise<void> | null = null
/** Carga inicial: catálogo, plan actual e historial importado (si está el archivo). Corre una sola vez. */
export function ensureSeed(conHistorial = true): Promise<void> {
  if (!seeding) seeding = doSeed(conHistorial).then(actualizarCatalogo).finally(() => { seeding = null })
  return seeding
}

async function doSeed(conHistorial: boolean): Promise<void> {
  if (await db.meta.get('seeded')) return
  const data = seed as unknown as SeedData
  await db.transaction('rw', [db.exercises, db.plans, db.planDays, db.sessions, db.setLogs, db.meta], async () => {
    const existentes = new Set((await db.exercises.toArray()).map((e) => e.slug))
    const nuevos: Exercise[] = data.exercises.filter((e) => !existentes.has(e.slug)).map(deSemilla)
    if (nuevos.length) await db.exercises.bulkAdd(nuevos)
    const idDe = new Map((await db.exercises.toArray()).map((e) => [e.slug, e.id!]))

    if (conHistorial && planSemilla) {
      const planId = await db.plans.add({ nombre: planSemilla.nombre, objetivo: planSemilla.objetivo, activo: true, cursor: 0, creado: Date.now() })
      await db.planDays.bulkAdd(planSemilla.dias.map((d, i) => ({
        plan_id: planId, orden: i, nombre: d.nombre,
        bloques: d.bloques.map((b) => ({
          orden: b.orden,
          ejercicios: b.ejercicios.map((x) => ({ exercise_id: idDe.get(x.slug)!, notas: x.notas, series: x.series.map(pset) })),
        })),
      })))
    }
    if (conHistorial) {
      for (const h of historial ?? []) {
        const inicio = new Date(`${h.fecha}T18:00:00`).getTime()
        const sid = await db.sessions.add({
          fecha: h.fecha, inicio, fin: h.dur ? inicio + h.dur * 60000 : null, estado: 'completada',
          plan_id: null, plan_day_id: null, nombre: h.nombre, wellness: null, wellness_prom: h.wellness,
          srpe: null, notas: h.notas, origen: 'importado', dur_min: h.dur,
        })
        await db.setLogs.bulkAdd(h.sets.map((s, i) => ({
          session_id: sid, exercise_id: idDe.get(s[0] as string)!, bloque: s[1] as number, orden: s[2] as number,
          serie: s[3] as number, tipo: 'efectiva' as const, reps: s[4] as number | null, seg: s[5] as number | null,
          peso_g: s[6] == null ? null : kgToG(s[6] as number), rir: s[7] as number | null, rpe: s[8] as number | null,
          fallo: s[9] === 1, hecha: true, ts: inicio + i * 1000, plan: null, confianza: 'media' as const,
        })))
      }
    }
    await db.meta.put({ key: 'seeded', value: Date.now() })
    if (!(await db.meta.get('catalogo'))) await db.meta.put({ key: 'catalogo', value: data.catalogo?.rev ?? 1 })
  })
}

// ------------------------------------------------------------------ persistencia
export async function pedirPersistencia(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch { return false }
}
export async function estadoPersistencia(): Promise<{ persistido: boolean; usoMB: number | null }> {
  try {
    const persistido = (await navigator.storage?.persisted?.()) ?? false
    const est = await navigator.storage?.estimate?.()
    return { persistido, usoMB: est?.usage ? est.usage / 1048576 : null }
  } catch { return { persistido: false, usoMB: null } }
}

// ------------------------------------------------------------------ backup
const TABLAS = ['exercises', 'plans', 'planDays', 'sessions', 'setLogs', 'activities', 'meta'] as const

export async function exportarTodo(): Promise<string> {
  const out: Record<string, unknown> = { formato: BACKUP_FORMAT, exportado: new Date().toISOString() }
  for (const t of TABLAS) out[t] = await db.table(t).toArray()
  return JSON.stringify(out)
}

export async function importarTodo(texto: string): Promise<{ sesiones: number; series: number }> {
  let data: Record<string, unknown>
  try { data = JSON.parse(texto) } catch { throw new Error('El archivo no es un JSON válido.') }
  if (data.formato !== BACKUP_FORMAT) throw new Error(`Este archivo no es una copia de GymBro (formato: ${String(data.formato ?? 'ninguno')}).`)
  for (const t of TABLAS) if (!Array.isArray(data[t])) throw new Error(`Backup incompleto: falta la tabla ${t}.`)
  await db.transaction('rw', TABLAS.map((t) => db.table(t)), async () => {
    for (const t of TABLAS) {
      await db.table(t).clear()
      const filas = data[t] as unknown[]
      if (filas.length) await db.table(t).bulkAdd(filas)
    }
  })
  await actualizarCatalogo()   // una copia vieja trae el catálogo anterior
  await marcarCopia()
  return { sesiones: (data.sessions as unknown[]).length, series: (data.setLogs as unknown[]).length }
}

export async function borrarTodo(conservarCatalogo: boolean): Promise<void> {
  await db.transaction('rw', TABLAS.map((t) => db.table(t)), async () => {
    for (const t of TABLAS) {
      if (t === 'exercises' && conservarCatalogo) continue
      if (t === 'meta') continue
      await db.table(t).clear()
    }
    await db.meta.put({ key: 'seeded', value: Date.now() })
  })
}
