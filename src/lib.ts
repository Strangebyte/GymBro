import { db, exportarTodo, marcarCopia, type Exercise, type PSet, type SetLog, type Session, type Activity } from './db'

export { kgToG } from './db'

export function numES(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',')
}
// ------------------------------------------------------------------ unidad de peso
// Los pesos se guardan siempre en gramos enteros; la unidad solo cambia cómo se muestran y cómo se escriben.
// App.tsx la fija en cada render, antes de dibujar las pantallas, así que todas leen la misma.
const G_POR_LB = 453.59237
let unidad: 'kg' | 'lb' = 'kg'
export function fijarUnidad(u: 'kg' | 'lb'): void { unidad = u }
/** "kg" o "lb". */
export const unidadPeso = (): 'kg' | 'lb' => unidad
/** Gramos a la unidad elegida. */
export const enUnidad = (g: number): number => (unidad === 'lb' ? g / G_POR_LB : g / 1000)
/** Peso para mostrar en un campo: "82,5" (o "181,88" en libras). Vacío si no hay. */
export const pesoTxt = (g: number | null | undefined): string => (g ? numES(enUnidad(g)) : '')
/**
 * Lo que se escribió en un campo de peso, en gramos. Si el texto es el mismo que ya se mostraba, devuelve el
 * peso guardado tal cual: así pasar por un campo sin tocarlo no cambia nada por redondeos (en libras, sobre todo).
 */
export function pesoDesdeTexto(v: string, actual: number | null | undefined): number | null {
  const t = v.trim()
  if (t === pesoTxt(actual)) return actual || null
  const n = Number(t.replace(',', '.'))
  if (t === '' || !Number.isFinite(n) || n === 0) return null
  return Math.round(unidad === 'lb' ? n * G_POR_LB : n * 1000)
}
/** Rótulo del peso de un ejercicio: "kg", "lb", y "kg c/u" si se hace con dos pesas (se anota el peso de una). */
export const rotuloPeso = (cu = false): string => `${unidad}${cu ? ' c/u' : ''}`
export function fmtPeso(g: number | null | undefined, lastre = false, cu = false): string {
  if (g == null || g === 0) return ''
  return `${lastre ? '+' : ''}${numES(enUnidad(g))} ${rotuloPeso(cu)}`
}

/** Resumen corto de una serie: "8r · 80 kg · RPE 8". */
export function fmtSet(s: PSet | SetLog, lastre = false, cu = false): string {
  const p: string[] = []
  if (s.fallo && s.reps == null) p.push('al fallo')
  else if (s.reps != null) p.push(`${s.reps}r${s.fallo ? ' (fallo)' : ''}`)
  if (s.seg != null) p.push(`${s.seg}"`)
  if (s.peso_g) p.push(fmtPeso(s.peso_g, lastre, cu))
  if (s.rir != null) p.push(`RIR ${s.rir}`)
  if (s.rpe != null) p.push(`RPE ${s.rpe}`)
  return p.join(' · ') || 'sin datos'
}

/** Una serie es válida si tiene al menos una variable cargada. */
export function setValido(s: PSet | SetLog): boolean {
  return s.reps != null || s.seg != null || !!s.peso_g || s.rir != null || s.rpe != null || !!s.fallo
}

export function resumenSets(sets: (PSet | SetLog)[], lastre = false, cu = false): string {
  if (!sets.length) return '—'
  const txt = sets.map((s) => fmtSet(s, lastre, cu))
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
/** dd/mm, para lugares con poco espacio. */
export const fmtFechaCorta = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
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

// ------------------------------------------------------------------ progreso
export type Medida = 'kg' | 'reps' | 'seg'
/** Mejor marca de una sesión. `reps` solo acompaña al peso: las reps hechas con esa carga. */
export interface Punto { fecha: string; valor: number; reps: number | null }

/**
 * Mejor serie de cada sesión de un ejercicio. Con peso: la carga más alta y, a igual carga, la de más reps.
 * Sin peso: las reps más altas. Sin reps: el tiempo más largo. No es una fuerza estimada: son marcas reales.
 */
export function progresoDe(filas: { fecha: string; set: SetLog }[]): { medida: Medida; puntos: Punto[] } {
  const medida: Medida = filas.some((f) => f.set.peso_g) ? 'kg' : filas.some((f) => f.set.reps != null) ? 'reps' : filas.some((f) => f.set.seg != null) ? 'seg' : 'kg'
  const m = new Map<string, Punto>()
  for (const { fecha, set } of filas) {
    const valor = medida === 'kg' ? (set.peso_g ? enUnidad(set.peso_g) : null) : medida === 'reps' ? set.reps : set.seg
    if (valor == null) continue
    const reps = medida === 'kg' ? set.reps : null
    const prev = m.get(fecha)
    if (!prev || valor > prev.valor || (valor === prev.valor && (reps ?? 0) > (prev.reps ?? 0))) m.set(fecha, { fecha, valor, reps })
  }
  return { medida, puntos: [...m.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)) }
}
/** Rótulo de una medida de progreso. `kg` es "peso": se muestra en la unidad elegida. */
export const unidadDe = (m: Medida, lastre = false, cu = false): string => (m === 'kg' ? (lastre ? `${unidad} de lastre` : rotuloPeso(cu)) : m === 'reps' ? 'reps' : 'segundos')

// ------------------------------------------------------------------ dispositivo
export function vibrar(patron: number | number[]): void {
  try { navigator.vibrate?.(patron) } catch { /* no soportado */ }
}

let audio: AudioContext | null = null
/** Habilita el audio. Hay que llamarlo desde un toque: el navegador no deja sonar nada que no venga de un gesto. */
export function prepararSonido(): void {
  try {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!C) return
    audio ??= new C()
    if (audio.state === 'suspended') void audio.resume()
  } catch { /* sin audio */ }
}
/** Tres tonos cortos, generados en el momento (sin archivos). Suena con el volumen de multimedia. */
export function sonar(): void {
  try {
    if (!audio) return
    const t0 = audio.currentTime + 0.02
    ;[880, 880, 1175].forEach((hz, i) => {
      const o = audio!.createOscillator(), g = audio!.createGain(), t = t0 + i * 0.24
      o.type = 'sine'; o.frequency.value = hz
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
      o.connect(g).connect(audio!.destination)
      o.start(t); o.stop(t + 0.2)
    })
  } catch { /* sin audio */ }
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

/** Exporta la copia de seguridad y, si salió bien, lo deja anotado para el recordatorio. */
export async function hacerCopia(): Promise<'ok' | 'cancelado' | 'error'> {
  const r = await guardarArchivo(`gymbro-${hoyISO()}.json`, await exportarTodo())
  if (r === 'ok') await marcarCopia()
  return r
}

export const GRUPOS = ['pecho', 'espalda', 'hombros', 'biceps', 'triceps', 'antebrazos', 'core', 'lumbares',
  'gluteo', 'cuadriceps', 'isquiotibiales', 'aductores_abductores', 'gemelos', 'cuerpo_completo', 'movilidad']
export const EQUIPOS = ['barra', 'mancuernas', 'kettlebell', 'maquina', 'polea', 'peso_corporal', 'banco', 'banda', 'disco', 'landmine',
  'fitball', 'trx', 'cajon', 'slider', 'rodillo', 'otro']
export const PATRONES = ['empuje_horizontal', 'empuje_vertical', 'traccion_horizontal', 'traccion_vertical', 'sentadilla', 'bisagra', 'zancada',
  'aislamiento', 'pliometria', 'acarreo', 'core', 'movilidad']
/** Categoría para agrupar el catálogo: fuerza por músculo; movilidad, core y potencia aparte. */
export function categoria(e: Exercise): string {
  if (!e.vol || e.patron === 'movilidad' || e.grupo === 'movilidad') return 'Movilidad'
  if (e.patron === 'pliometria') return 'Potencia y pliometría'
  if (e.grupo === 'core' || e.patron.startsWith('core')) return 'Core'
  return etiqueta(e.grupo)
}
const ORDEN_CAT = ['Pecho', 'Espalda', 'Hombros', 'Bíceps', 'Tríceps', 'Antebrazos', 'Glúteo', 'Cuádriceps', 'Isquiotibiales',
  'Aductores y abductores', 'Gemelos', 'Lumbares', 'Cuerpo completo', 'Core', 'Potencia y pliometría', 'Movilidad']
export function agruparPorCategoria(lista: Exercise[]): { cat: string; items: Exercise[] }[] {
  const m = new Map<string, Exercise[]>()
  for (const e of lista) { const c = categoria(e); m.set(c, [...(m.get(c) ?? []), e]) }
  const pos = (c: string) => { const i = ORDEN_CAT.indexOf(c); return i < 0 ? 99 : i }
  return [...m.entries()].sort((a, b) => pos(a[0]) - pos(b[0]) || a[0].localeCompare(b[0], 'es')).map(([cat, items]) => ({ cat, items }))
}
// Los grupos, equipos y patrones se guardan sin acentos (son claves); acá va cómo se muestran.
const CON_ACENTO: Record<string, string> = {
  biceps: 'bíceps', triceps: 'tríceps', gluteo: 'glúteo', cuadriceps: 'cuádriceps', aductores_abductores: 'aductores y abductores',
  maquina: 'máquina', cajon: 'cajón', disco: 'disco / lastre', slider: 'deslizadores', fitball: 'pelota (fitball)', trx: 'TRX / anillas',
  traccion_horizontal: 'tracción horizontal', traccion_vertical: 'tracción vertical', pliometria: 'pliometría',
  bisagra: 'bisagra de cadera (peso muerto)', acarreo: 'acarreos y desplazamientos',
}
/** Nombre para mostrar de un grupo, equipo o patrón: con acento y con mayúscula inicial. */
export function etiqueta(s: string): string { const t = CON_ACENTO[s] ?? s.replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1) }
export const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`
