import { db, type Exercise, type PSet, type SetLog, type Session, type Activity } from './db'

export const gToKg = (g: number): number => g / 1000
export { kgToG } from './db'

export function numES(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',')
}
export function fmtKg(g: number | null | undefined, lastre = false): string {
  if (g == null || g === 0) return ''
  return `${lastre ? '+' : ''}${numES(gToKg(g))} kg`
}

/** Resumen corto de una serie: "8r · 80 kg · RPE 8". */
export function fmtSet(s: PSet | SetLog, lastre = false): string {
  const p: string[] = []
  if (s.fallo && s.reps == null) p.push('al fallo')
  else if (s.reps != null) p.push(`${s.reps}r${s.fallo ? ' (fallo)' : ''}`)
  if (s.seg != null) p.push(`${s.seg}"`)
  if (s.peso_g) p.push(fmtKg(s.peso_g, lastre))
  if (s.rir != null) p.push(`RIR ${s.rir}`)
  if (s.rpe != null) p.push(`RPE ${s.rpe}`)
  return p.join(' · ') || 'sin datos'
}

/** Una serie es válida si tiene al menos una variable cargada. */
export function setValido(s: PSet | SetLog): boolean {
  return s.reps != null || s.seg != null || !!s.peso_g || s.rir != null || s.rpe != null || !!s.fallo
}

export function resumenSets(sets: (PSet | SetLog)[], lastre = false): string {
  if (!sets.length) return '—'
  const txt = sets.map((s) => fmtSet(s, lastre))
  if (txt.every((t) => t === txt[0])) return `${sets.length} × ${txt[0]}`
  return txt.join('  |  ')
}

export const norm = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
export const slugify = (s: string): string => norm(s).replace(/ /g, '-')

export function buscar(lista: Exercise[], q: string): Exercise[] {
  const t = norm(q)
  const orden = (a: Exercise, b: Exercise) => a.nombre.localeCompare(b.nombre, 'es')
  if (!t) return [...lista].sort(orden)
  const terminos = t.split(' ')
  return lista
    .map((e) => {
      const campo = norm([e.nombre, e.legible ?? '', ...(e.alias ?? []), e.grupo, e.equipo].join(' '))
      if (!terminos.every((x) => campo.includes(x))) return null
      return { e, r: norm(e.nombre).startsWith(t) ? 0 : 1 }
    })
    .filter((x): x is { e: Exercise; r: number } => x !== null)
    .sort((a, b) => a.r - b.r || orden(a.e, b.e))
    .map((x) => x.e)
}

// ------------------------------------------------------------------ fechas
const p2 = (n: number) => String(n).padStart(2, '0')
export const isoDe = (d: Date): string => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
export const hoyISO = (): string => isoDe(new Date())
export const fechaDe = (iso: string): Date => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d) }
export const sumarDias = (iso: string, n: number): string => { const d = fechaDe(iso); d.setDate(d.getDate() + n); return isoDe(d) }
/** Lunes de la semana de la fecha dada. */
export function lunesDe(iso: string): string {
  const d = fechaDe(iso)
  return sumarDias(iso, -((d.getDay() + 6) % 7))
}
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export function fmtFecha(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
export function fmtFechaLarga(iso: string): string {
  const d = fechaDe(iso)
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`
}
export function fmtDur(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000))
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`
}
export function mmss(seg: number): string {
  const s = Math.max(0, Math.floor(seg))
  return `${Math.floor(s / 60)}:${p2(s % 60)}`
}
export function duracionSesion(s: Session): number | null {
  if (s.dur_min != null) return s.dur_min
  if (s.fin) return Math.round((s.fin - s.inicio) / 60000)
  return null
}

// ------------------------------------------------------------------ consultas
export interface SesionDeEjercicio { session_id: number; fecha: string; sets: SetLog[] }

export async function historicoEjercicio(exercise_id: number, limite = 30): Promise<SesionDeEjercicio[]> {
  const sets = (await db.setLogs.where('exercise_id').equals(exercise_id).toArray()).filter((s) => s.hecha)
  const por = new Map<number, SetLog[]>()
  for (const s of sets) por.set(s.session_id, [...(por.get(s.session_id) ?? []), s])
  const sesiones = await db.sessions.bulkGet([...por.keys()])
  const out: SesionDeEjercicio[] = []
  for (const ses of sesiones) {
    if (!ses) continue
    out.push({ session_id: ses.id!, fecha: ses.fecha, sets: por.get(ses.id!)!.sort((a, b) => a.serie - b.serie) })
  }
  return out.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.session_id - a.session_id).slice(0, limite)
}

export async function ultimaVez(exercise_id: number, excluir?: number): Promise<SesionDeEjercicio | null> {
  const h = await historicoEjercicio(exercise_id, 5)
  return h.find((x) => x.session_id !== excluir) ?? null
}

export interface DiaResumen { gym: Session[]; act: Activity[] }
export function agruparPorDia(sesiones: Session[], actividades: Activity[]): Map<string, DiaResumen> {
  const m = new Map<string, DiaResumen>()
  const get = (f: string) => { let r = m.get(f); if (!r) { r = { gym: [], act: [] }; m.set(f, r) } return r }
  for (const s of sesiones) if (s.estado === 'completada') get(s.fecha).gym.push(s)
  for (const a of actividades) get(a.fecha).act.push(a)
  return m
}

// ------------------------------------------------------------------ dispositivo
export function vibrar(patron: number | number[]): void {
  try { navigator.vibrate?.(patron) } catch { /* no soportado */ }
}

type Sentinel = { release: () => Promise<void> }
let wl: Sentinel | null = null
export async function mantenerPantalla(on: boolean): Promise<void> {
  try {
    const api = (navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<Sentinel> } }).wakeLock
    if (on) { if (api && !wl) wl = await api.request('screen') }
    else { await wl?.release(); wl = null }
  } catch { wl = null }
}

type ClaudeHost = { use: (n: string) => Promise<unknown> }
type Downloads = { save: (r: { filename: string; data: string }) => Promise<{ status: string }> }

/** Guarda un archivo. Dentro de Claude usa la capacidad de descargas; en un hosting propio, una descarga normal. */
export async function guardarArchivo(nombre: string, contenido: string): Promise<'ok' | 'cancelado' | 'error'> {
  const host = (window as unknown as { claude?: ClaudeHost }).claude
  if (host?.use) {
    try {
      const d = (await host.use('downloads')) as Downloads | null
      if (d) { await d.save({ filename: nombre, data: contenido }); return 'ok' }
    } catch (e) {
      return (e as { code?: string })?.code === 'declined' ? 'cancelado' : 'error'
    }
  }
  try {
    const url = URL.createObjectURL(new Blob([contenido], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url; a.download = nombre
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 3000)
    return 'ok'
  } catch { return 'error' }
}

export const GRUPOS = ['pecho', 'dorsal', 'trapecio', 'hombro_anterior', 'hombro_lateral', 'hombro_posterior', 'biceps', 'triceps',
  'core', 'gluteo', 'cuadriceps', 'isquios', 'aductores', 'gemelo', 'full_body',
  'movilidad_cadera', 'movilidad_dorsal', 'movilidad_isquios', 'movilidad_posterior', 'movilidad_aductores']
export const EQUIPOS = ['barra', 'mancuernas', 'kettlebell', 'maquina', 'polea', 'peso_corporal', 'banda', 'disco', 'landmine', 'fitball', 'cajon', 'slider', 'rodillo', 'otro']
export const PATRONES = ['empuje_horizontal', 'empuje_vertical', 'traccion_horizontal', 'traccion_vertical', 'sentadilla', 'bisagra', 'zancada',
  'aislamiento', 'pliometria', 'locomocion', 'core_antiextension', 'core_antiflexion_lateral', 'core_antirotacion', 'core_rotacion', 'movilidad']
/** Categoría para agrupar el catálogo: fuerza por músculo; movilidad, core y potencia aparte. */
export function categoria(e: Exercise): string {
  if (!e.vol || e.patron === 'movilidad') return 'Movilidad'
  if (e.patron === 'pliometria') return 'Potencia y pliometría'
  if (e.grupo === 'core' || e.patron.startsWith('core')) return 'Core'
  if (e.grupo === 'full_body') return 'Cuerpo completo'
  const t = e.grupo.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}
const ORDEN_CAT = ['Pecho', 'Dorsal', 'Trapecio', 'Hombro anterior', 'Hombro lateral', 'Hombro posterior', 'Biceps', 'Triceps',
  'Gluteo', 'Cuadriceps', 'Isquios', 'Aductores', 'Gemelo', 'Cuerpo completo', 'Core', 'Potencia y pliometría', 'Movilidad']
export function agruparPorCategoria(lista: Exercise[]): { cat: string; items: Exercise[] }[] {
  const m = new Map<string, Exercise[]>()
  for (const e of lista) { const c = categoria(e); m.set(c, [...(m.get(c) ?? []), e]) }
  const pos = (c: string) => { const i = ORDEN_CAT.indexOf(c); return i < 0 ? 99 : i }
  return [...m.entries()].sort((a, b) => pos(a[0]) - pos(b[0]) || a[0].localeCompare(b[0], 'es')).map(([cat, items]) => ({ cat, items }))
}
export const etiqueta = (s: string): string => s.replace(/_/g, ' ')
export const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`
