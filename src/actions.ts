import { db, type Exercise, type PlanDay, type PSet, type Session, type SetLog, type Wellness } from './db'
import { hoyISO, slugify } from './lib'

export async function sesionEnCurso(): Promise<Session | null> {
  const s = await db.sessions.where('estado').equals('en_curso').toArray()
  return s.sort((a, b) => b.inicio - a.inicio)[0] ?? null
}

export function promedioWellness(w: Wellness | null): number | null {
  if (!w) return null
  return Math.round(((w.sueno + w.dolor + w.cansancio + w.estres + w.energia) / 5) * 10) / 10
}

function borrador(session_id: number, exercise_id: number, bloque: number, orden: number, serie: number, p: PSet | null): SetLog {
  return {
    session_id, exercise_id, bloque, orden, serie, tipo: 'efectiva',
    reps: p?.reps ?? null, seg: p?.seg ?? null, peso_g: p?.peso_g ?? null,
    rir: p?.rir ?? null, rpe: p?.rpe ?? null, fallo: !!p?.fallo,
    hecha: false, ts: Date.now(), plan: p, confianza: 'alta', tec: p?.tec ?? null,
  }
}

/**
 * Crea la sesión. Con un día de plan, deja todas las series prescriptas como pendientes.
 * Con `fechaRetro` es una sesión de un día pasado que se carga después: sin reloj en vivo.
 */
export async function iniciarSesion(dia: PlanDay | null, wellness: Wellness | null, fechaRetro?: string): Promise<number> {
  const existente = await sesionEnCurso()
  if (existente) return existente.id!
  return db.transaction('rw', db.sessions, db.setLogs, async () => {
    const sid = await db.sessions.add({
      fecha: fechaRetro ?? hoyISO(), inicio: fechaRetro ? new Date(`${fechaRetro}T12:00:00`).getTime() : Date.now(), fin: null, estado: 'en_curso',
      plan_id: dia?.plan_id ?? null, plan_day_id: dia?.id ?? null, nombre: dia?.nombre ?? 'Sesión libre',
      wellness, wellness_prom: promedioWellness(wellness), srpe: null, notas: null, origen: 'app', dur_min: null,
      ...(fechaRetro ? { retro: true } : {}),
    })
    if (dia) {
      const filas: SetLog[] = []
      for (const b of dia.bloques) {
        b.ejercicios.forEach((e, i) => e.series.forEach((p, j) => filas.push(borrador(sid, e.exercise_id, b.orden, i + 1, j + 1, p))))
      }
      if (filas.length) await db.setLogs.bulkAdd(filas)
    }
    return sid
  })
}

/** Agrega un ejercicio fuera de plan, prellenado con la última vez que se hizo. `hecha`: al editar una sesión ya guardada. */
export async function agregarEjercicio(sesion: Session, ex: Exercise, bloque: number, hecha = false): Promise<void> {
  const todos = await db.setLogs.where('session_id').equals(sesion.id!).toArray()
  const delBloque = todos.filter((s) => s.bloque === bloque)
  const orden = delBloque.length ? Math.max(...delBloque.map((s) => s.orden)) + 1 : 1
  const previos = (await db.setLogs.where('exercise_id').equals(ex.id!).toArray())
    .filter((s) => s.hecha && s.session_id !== sesion.id).sort((a, b) => b.ts - a.ts)
  const ult = previos[0]
  const base: PSet | null = ult
    ? { reps: ult.reps, seg: ult.seg, peso_g: ult.peso_g, rir: ult.rir, rpe: ult.rpe }
    : ex.mide === 'seg' ? { seg: 30 } : null
  await db.setLogs.add({ ...borrador(sesion.id!, ex.id!, bloque, orden, 1, base), plan: null, hecha })
}

export async function agregarSerie(sets: SetLog[], hecha = false): Promise<void> {
  const ult = sets[sets.length - 1]
  await db.setLogs.add({ ...ult, id: undefined, serie: ult.serie + 1, hecha, fallo: false, ts: Date.now(), plan: null, tec: null, tramos: undefined })
}

export async function terminarSesion(
  sesion: Session, srpe: number | null, notas: string | null, actualizarPlan: boolean, durMin: number | null = null,
): Promise<void> {
  await db.transaction('rw', db.sessions, db.setLogs, db.plans, db.planDays, async () => {
    const todos = await db.setLogs.where('session_id').equals(sesion.id!).toArray()
    const pendientes = todos.filter((s) => !s.hecha)
    if (pendientes.length) await db.setLogs.bulkDelete(pendientes.map((s) => s.id!))
    const hechas = todos.filter((s) => s.hecha)
    if (!hechas.length) { await db.sessions.delete(sesion.id!); return }
    const fin = sesion.retro ? (durMin ? sesion.inicio + durMin * 60000 : null) : Date.now()
    await db.sessions.update(sesion.id!, { estado: 'completada', fin, srpe, notas, dur_min: durMin })
    // Una sesión cargada después no es "lo último que hiciste": sus series llevan la hora de aquel día.
    if (sesion.retro) {
      const orden = [...hechas].sort((a, b) => a.bloque - b.bloque || a.orden - b.orden || a.serie - b.serie)
      await db.setLogs.bulkUpdate(orden.map((s, i) => ({ key: s.id!, changes: { ts: sesion.inicio + i } })))
    }

    if (sesion.plan_day_id != null) {
      const dia = await db.planDays.get(sesion.plan_day_id)
      if (dia) {
        if (actualizarPlan) {
          const bloques = dia.bloques.map((b) => ({
            ...b,
            ejercicios: b.ejercicios.map((e, i) => ({
              ...e,
              series: e.series.map((p, j) => {
                const l = hechas.find((s) => s.exercise_id === e.exercise_id && s.bloque === b.orden && s.orden === i + 1 && s.serie === j + 1)
                if (!l) return p
                const n: PSet = { ...p }
                if (l.peso_g != null) n.peso_g = l.peso_g
                if (l.reps != null && !p.fallo) n.reps = l.reps
                if (l.seg != null) n.seg = l.seg
                return n
              }),
            })),
          }))
          await db.planDays.update(dia.id!, { bloques })
        }
        // La rotación avanza salvo que sea una sesión vieja cargada después de otras más nuevas.
        const hayPosteriores = sesion.retro
          && (await db.sessions.where('fecha').above(sesion.fecha).filter((s) => s.estado === 'completada').count()) > 0
        if (!hayPosteriores) {
          const dias = (await db.planDays.where('plan_id').equals(dia.plan_id).toArray()).sort((a, b) => a.orden - b.orden)
          const idx = dias.findIndex((d) => d.id === dia.id)
          await db.plans.update(dia.plan_id, { cursor: (idx + 1) % Math.max(1, dias.length) })
        }
      }
    }
  })
}

export async function descartarSesion(id: number): Promise<void> {
  await db.transaction('rw', db.sessions, db.setLogs, async () => {
    await db.setLogs.where('session_id').equals(id).delete()
    await db.sessions.delete(id)
  })
}

// ------------------------------------------------------------------ planes
export async function activarPlan(id: number): Promise<void> {
  await db.transaction('rw', db.plans, async () => {
    for (const p of await db.plans.toArray()) await db.plans.update(p.id!, { activo: p.id === id })
  })
}

export async function borrarPlan(id: number): Promise<void> {
  await db.transaction('rw', db.plans, db.planDays, async () => {
    await db.planDays.where('plan_id').equals(id).delete()
    await db.plans.delete(id)
  })
}

export async function duplicarDia(dia: PlanDay): Promise<number> {
  const n = await db.planDays.where('plan_id').equals(dia.plan_id).count()
  return db.planDays.add({ plan_id: dia.plan_id, orden: n, nombre: `${dia.nombre} (copia)`, bloques: JSON.parse(JSON.stringify(dia.bloques)) })
}

export async function reordenarDias(ids: number[]): Promise<void> {
  await db.transaction('rw', db.planDays, async () => {
    for (let i = 0; i < ids.length; i++) await db.planDays.update(ids[i], { orden: i })
  })
}

// ------------------------------------------------------------------ ejercicios
export async function crearEjercicio(datos: Partial<Exercise> & { nombre: string }): Promise<number> {
  let slug = slugify(datos.nombre) || `ejercicio-${Date.now()}`
  let i = 2
  while (await db.exercises.where('slug').equals(slug).first()) slug = `${slugify(datos.nombre)}-${i++}`
  return db.exercises.add({
    slug, nombre: datos.nombre.trim(), legible: datos.legible ?? null, grupo: datos.grupo ?? 'full_body',
    sec: datos.sec ?? [], equipo: datos.equipo ?? 'otro', patron: datos.patron ?? 'aislamiento',
    unilateral: datos.unilateral ?? false, lastre: datos.lastre ?? false, mide: datos.mide ?? 'reps',
    vol: datos.vol ?? true, inc: datos.inc ?? 2.5, archivo: false, notas: datos.notas ?? null,
    alias: datos.alias ?? [], custom: true, descanso_s: datos.descanso_s ?? null,
  })
}
