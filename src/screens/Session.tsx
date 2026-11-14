import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, kgToG, type Exercise, type Session, type SetLog, type Settings } from '../db'
import { Chips, HistorialLista, Ico, MediaView, Picker, Sheet, Stepper, TopBar, useDialogos, useNav, useTieneMedia } from '../ui'
import { etiqueta, fmtDur, fmtFecha, mmss, numES, plural, prepararSonido, resumenSets, setValido, sonar, ultimaVez, vibrar } from '../lib'
import { agregarEjercicio, agregarSerie, descartarSesion, sesionEnCurso, terminarSesion } from '../actions'

export type Item = { key: string; bloque: number; orden: number; ex: Exercise; sets: SetLog[] }

/** Agrupa las series de una sesión por ejercicio, en el orden en que se hacen. */
export function armarItems(sets: SetLog[], ejercicios: Exercise[]): Item[] {
  const mapa = new Map(ejercicios.map((e) => [e.id!, e]))
  const g = new Map<string, Item>()
  for (const s of sets) {
    const ex = mapa.get(s.exercise_id)
    if (!ex) continue
    const key = `${s.bloque}-${s.orden}`
    const it = g.get(key) ?? { key, bloque: s.bloque, orden: s.orden, ex, sets: [] }
    it.sets.push(s)
    g.set(key, it)
  }
  const arr = [...g.values()]
  arr.forEach((i) => i.sets.sort((a, b) => a.serie - b.serie))
  return arr.sort((a, b) => a.bloque - b.bloque || a.orden - b.orden)
}

// El bloque abierto sobrevive a ir y volver de otra pantalla durante la misma sesión.
const memoria: { sesion: number | null; abierto: number | null } = { sesion: null, abierto: null }

export function SessionScreen({ settings }: { settings: Settings }) {
  const nav = useNav()
  const { avisar } = useDialogos()
  const sesion = useLiveQuery(() => sesionEnCurso(), [])
  const sets = useLiveQuery(async () => (sesion?.id ? db.setLogs.where('session_id').equals(sesion.id).toArray() : []), [sesion?.id])
  const ejercicios = useLiveQuery(() => db.exercises.toArray(), [])
  const [abierto, setAbiertoLocal] = useState<number | null>(memoria.abierto)
  const [picker, setPicker] = useState<number | null>(null)
  const [finEn, setFinEn] = useState<number | null>(null)
  const [ahora, setAhora] = useState(Date.now())
  const [vibrado, setVibrado] = useState(false)
  const porEjercicio = settings.tilde === 'ejercicio'

  const setAbierto = (b: number | null) => { memoria.abierto = b; setAbiertoLocal(b) }
  useEffect(() => {
    if (sesion?.id && memoria.sesion !== sesion.id) { memoria.sesion = sesion.id; setAbierto(null) }
  }, [sesion?.id])

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), finEn != null ? 250 : 15000)
    return () => clearInterval(id)
  }, [finEn])
  const restante = finEn == null ? 0 : (finEn - ahora) / 1000
  useEffect(() => {
    if (finEn != null && restante <= 0 && !vibrado) { if (settings.vibrar) vibrar([200, 100, 200]); if (settings.sonido) sonar(); setVibrado(true) }
  }, [restante, finEn, vibrado, settings.vibrar, settings.sonido])

  const items = useMemo<Item[]>(() => (sets && ejercicios ? armarItems(sets, ejercicios) : []), [sets, ejercicios])
  const bloques = useMemo(() => [...new Set(items.map((i) => i.bloque))].sort((a, b) => a - b), [items])

  if (sesion === undefined || !sets || !ejercicios) return <><TopBar titulo="Sesión" atras /><div className="main sin-tabs"><div className="empty">Cargando…</div></div></>
  if (!sesion) return <><TopBar titulo="Sesión" atras /><div className="main sin-tabs"><div className="empty">No hay una sesión en curso.</div></div></>

  const total = sets.length
  const hechas = sets.filter((s) => s.hecha).length
  const conPlan = sesion.plan_day_id != null
  const bloquesPlan = [...new Set(sets.filter((s) => s.plan).map((s) => s.bloque))]
  const bloqueExtra = bloquesPlan.length ? Math.max(...bloquesPlan) + 1 : conPlan ? (bloques.length ? Math.max(...bloques) + 1 : 1) : 1
  const descanso = (seg: number) => { setVibrado(false); setFinEn(Date.now() + seg * 1000); setAhora(Date.now()) }

  /** Marca o desmarca un grupo de series. Devuelve false si alguna no tiene datos. */
  const marcar = async (grupo: SetLog[], nombre: string): Promise<boolean> => {
    const todas = grupo.length > 0 && grupo.every((s) => s.hecha)
    if (!todas) {
      const vacia = grupo.find((s) => !setValido(s))
      if (vacia) { avisar(`${nombre}: hay series sin datos. Cargá reps, tiempo o peso, o borrá la serie.`); return false }
    }
    const ts = Date.now()
    await db.setLogs.bulkUpdate(grupo.map((s, i) => ({ key: s.id!, changes: { hecha: !todas, ts: ts + i } })))
    return !todas
  }

  return (
    <>
      <TopBar titulo={sesion.nombre} sub={`${sesion.retro ? fmtFecha(sesion.fecha) : fmtDur(ahora - sesion.inicio)} · ${hechas} de ${total} series`} atras
        der={<button className="btn primary sm" onClick={() => nav.ir({ v: 'cerrar' })}>Terminar</button>} />
      <div className="main sin-tabs" style={{ paddingBottom: finEn != null ? 110 : undefined }}>
        <div className="bar" style={{ marginBottom: 10 }}><i style={{ width: `${total ? (hechas / total) * 100 : 0}%` }} /></div>
        {!items.length && <div className="empty">Sesión vacía. Agregá el primer ejercicio.</div>}

        {bloques.map((b) => {
          const its = items.filter((i) => i.bloque === b)
          const delBloque = its.flatMap((i) => i.sets)
          const listo = delBloque.length > 0 && delBloque.every((s) => s.hecha)
          const esExtra = !bloquesPlan.includes(b)
          const desc = [...new Set([...its.map((i) => etiqueta(i.ex.grupo)), ...its.map((i) => i.ex.equipo).filter((e) => e !== 'peso_corporal').map(etiqueta)])]
          const nombre = esExtra ? (conPlan ? 'Ejercicios adicionales' : 'Ejercicios') : `Bloque ${b}`
          return (
            <div key={b} className={`bloque${listo ? ' listo' : ''}`}>
              <div className="bloque-h">
                <button className="row grow" onClick={() => setAbierto(abierto === b ? null : b)} aria-expanded={abierto === b}>
                  <span className="num">{esExtra ? '+' : b}</span>
                  <span className="grow">
                    <span className="bold">{nombre}</span>
                    <span className="xsmall muted" style={{ display: 'block' }}>{plural(its.length, 'ejercicio', 'ejercicios')} · {delBloque.filter((s) => s.hecha).length}/{delBloque.length} series</span>
                    <span className="xsmall muted truncate" style={{ display: 'block' }}>{desc.slice(0, 5).join(' · ')}</span>
                  </span>
                  <span className="muted">{abierto === b ? '▾' : '▸'}</span>
                </button>
                {!porEjercicio && (
                  <button className={`tilde${listo ? ' on' : ''}`} aria-pressed={listo} aria-label={`${listo ? 'Desmarcar' : 'Marcar hecho'} ${nombre}`}
                    onClick={() => void marcar(delBloque, nombre)}>✓</button>
                )}
                {porEjercicio && listo && <span className="hecho" aria-label="Bloque hecho">✓</span>}
              </div>
              {abierto === b && (
                <div className="bloque-c">
                  {its.map((it) => (
                    <Tarjeta key={`${it.key}-${it.ex.id}`} item={it} sesion={sesion} porEjercicio={porEjercicio}
                      onMarcar={async () => { if (settings.sonido) prepararSonido(); if (await marcar(it.sets, it.ex.nombre)) descanso(it.ex.descanso_s ?? settings.descanso_s) }} />
                  ))}
                  {esExtra && <button className="btn xs block" onClick={() => setPicker(b)}>+ Otro ejercicio</button>}
                </div>
              )}
            </div>
          )
        })}

        <button className="btn block" style={{ marginTop: 14 }} onClick={() => setPicker(bloqueExtra)}>
          {conPlan ? '+ Agregar ejercicios adicionales' : '+ Agregar ejercicio'}
        </button>
      </div>

      {finEn != null && (
        <div className={`timer${restante <= 0 ? ' listo' : ''}`} role="timer">
          <div className="t">{restante <= 0 ? '0:00' : mmss(restante)}</div>
          <div className="grow small">{restante <= 0 ? '¡A la siguiente!' : 'Descanso'}</div>
          <button className="chip sm" onClick={() => setFinEn((f) => (f ?? Date.now()) - 30000)}>−30</button>
          <button className="chip sm" onClick={() => { setVibrado(false); setFinEn((f) => Math.max(f ?? 0, Date.now()) + 30000) }}>+30</button>
          <button className="chip sm" onClick={() => setFinEn(null)} aria-label="Cerrar descanso">✕</button>
        </div>
      )}

      {picker != null && (
        <Picker multi titulo={conPlan ? 'Ejercicios adicionales' : 'Agregar ejercicio'} onCerrar={() => setPicker(null)}
          onElegir={(e) => { void agregarEjercicio(sesion, e, picker); setAbierto(picker) }} />
      )}
    </>
  )
}

// ------------------------------------------------------------------ tarjeta de ejercicio
const aNum = (v: string): number | null => { const n = Number(v.replace(',', '.')); return v.trim() === '' || !Number.isFinite(n) ? null : n }

/** Tarjeta de un ejercicio con sus series. `editando`: corrige una sesión ya guardada (las series nuevas nacen hechas). */
export function Tarjeta(props: { item: Item; sesion: Session; porEjercicio: boolean; onMarcar: () => void; editando?: boolean }) {
  const { item, sesion, porEjercicio, onMarcar, editando = false } = props
  const { ex, sets } = item
  const { confirmar } = useDialogos()
  const [previo, setPrevio] = useState<{ fecha: string; txt: string } | null>(null)
  const [hoja, setHoja] = useState<'historial' | 'media' | 'cambiar' | null>(null)
  const tieneMedia = useTieneMedia(ex.id!, ex.url)
  const nota = useLiveQuery(async () => {
    if (sesion.plan_day_id == null) return null
    const dia = await db.planDays.get(sesion.plan_day_id)
    const e = dia?.bloques.find((b) => b.orden === item.bloque)?.ejercicios[item.orden - 1]
    return e && e.exercise_id === ex.id ? e.notas : null
  }, [sesion.plan_day_id, item.bloque, item.orden, ex.id])

  useEffect(() => {
    let vivo = true
    void ultimaVez(ex.id!, sesion.id!).then((u) => { if (vivo) setPrevio(u ? { fecha: u.fecha, txt: resumenSets(u.sets, ex.lastre) } : null) })
    return () => { vivo = false }
  }, [ex.id, ex.lastre, sesion.id])

  const listo = sets.every((s) => s.hecha)
  const enSeg = sets.some((s) => s.seg != null) || (ex.mide === 'seg' && !sets.some((s) => s.reps != null))
  const quitar = async () => {
    if (!(await confirmar({ titulo: `¿Quitar ${ex.nombre}?`, texto: 'Solo se quita de esta sesión. El plan no cambia.', ok: 'Quitar', peligro: true }))) return
    await db.setLogs.bulkDelete(sets.map((s) => s.id!))
  }
  const objetivo = (s: SetLog) => [s.tipo === 'calentamiento' ? 'calent.' : '', s.rir != null ? `RIR ${s.rir}` : '', s.rpe != null ? `RPE ${s.rpe}` : '', s.fallo ? 'fallo' : ''].filter(Boolean).join(' · ')

  return (
    <div className={`ej${listo ? ' listo' : ''}`}>
      <div className="row">
        <b className="grow" style={{ fontSize: 15, lineHeight: 1.25 }}>{ex.nombre}</b>
        {tieneMedia && <button className="mini" onClick={() => setHoja('media')} aria-label={`Ver video o imagen de ${ex.nombre}`}>▶</button>}
        <button className="mini" onClick={() => setHoja('historial')} aria-label={`Historial de ${ex.nombre}`}>{Ico.reloj}</button>
        {porEjercicio && <button className={`tilde ch${listo ? ' on' : ''}`} aria-pressed={listo} aria-label={`${listo ? 'Desmarcar' : 'Marcar hecho'} ${ex.nombre}`} onClick={onMarcar}>✓</button>}
      </div>
      {nota && <div className="xsmall nota">Nota: {nota}</div>}
      {!editando && (
        <div className="xsmall muted truncate" style={{ marginTop: 2 }}>
          {previo ? <>Última vez ({fmtFecha(previo.fecha)}): <span className="mono">{previo.txt}</span></> : 'Primera vez que lo registrás'}
        </div>
      )}

      <div className="ss h">
        <span /><span>{enSeg ? 'seg' : 'reps'}{ex.unilateral ? ' c/lado' : ''}</span><span>{ex.lastre ? 'lastre kg' : 'kg'}</span><span>objetivo</span><span />
      </div>
      {sets.map((s) => (
        <div key={s.id} className="ss">
          <span className="n">{s.serie}</span>
          <input inputMode="numeric" aria-label={`${ex.nombre}, serie ${s.serie}: ${enSeg ? 'segundos' : 'reps'}`}
            defaultValue={enSeg ? (s.seg ?? '') : (s.reps ?? '')} placeholder={s.fallo ? 'fallo' : '—'}
            onBlur={(e) => { const n = aNum(e.target.value); void db.setLogs.update(s.id!, enSeg ? { seg: n, reps: null } : { reps: n, seg: null }) }} />
          <input inputMode="decimal" aria-label={`${ex.nombre}, serie ${s.serie}: peso en kg`}
            defaultValue={s.peso_g ? numES(s.peso_g / 1000) : ''} placeholder="—"
            onBlur={(e) => { const n = aNum(e.target.value); void db.setLogs.update(s.id!, { peso_g: n == null || n === 0 ? null : kgToG(n) }) }} />
          <span className="obj">{objetivo(s) || '—'}</span>
          <button className="x" aria-label={`Borrar serie ${s.serie} de ${ex.nombre}`} onClick={() => void db.setLogs.delete(s.id!)}>✕</button>
        </div>
      ))}
      <div className="acc">
        <button onClick={() => void agregarSerie(sets, editando)}>+ Serie</button>
        <button onClick={() => setHoja('cambiar')}>Cambiar ejercicio</button>
        <button className="q" onClick={() => void quitar()}>Quitar</button>
      </div>

      {hoja === 'historial' && <Sheet titulo={ex.nombre} onCerrar={() => setHoja(null)}><HistorialLista exerciseId={ex.id!} lastre={ex.lastre} excluir={sesion.id} /></Sheet>}
      {hoja === 'media' && <Sheet titulo={ex.nombre} onCerrar={() => setHoja(null)}><MediaView exerciseId={ex.id!} url={ex.url} /></Sheet>}
      {hoja === 'cambiar' && (
        <Picker titulo={`Reemplazar ${ex.nombre}`} onCerrar={() => setHoja(null)}
          onElegir={(nuevo) => { void db.setLogs.bulkUpdate(sets.map((s) => ({ key: s.id!, changes: { exercise_id: nuevo.id! } }))) }} />
      )}
    </div>
  )
}

// ------------------------------------------------------------------ cierre
export function CerrarScreen() {
  const nav = useNav()
  const { confirmar } = useDialogos()
  const sesion = useLiveQuery(() => sesionEnCurso(), [])
  const sets = useLiveQuery(async () => (sesion?.id ? db.setLogs.where('session_id').equals(sesion.id).toArray() : []), [sesion?.id])
  const [srpe, setSrpe] = useState<number | null>(null)
  const [notas, setNotas] = useState('')
  const [actualizar, setActualizar] = useState(false)
  const [dur, setDur] = useState<number | null>(60)
  if (!sesion || !sets) return <><TopBar titulo="Terminar sesión" atras /><div className="main sin-tabs"><div className="empty">No hay sesión en curso.</div></div></>
  const hechas = sets.filter((s) => s.hecha).length
  const pend = sets.length - hechas
  const minutos = Math.round((Date.now() - sesion.inicio) / 60000)
  // Sin reloj confiable (sesión de otro día, o quedó abierta por horas): la duración se carga a mano.
  const durManual = !!sesion.retro || minutos > 240
  return (
    <>
      <TopBar titulo="Terminar sesión" sub={sesion.nombre} atras />
      <div className="main sin-tabs">
        <div className="row" style={{ marginBottom: 10 }}>
          <div className="stat"><b>{hechas}</b><span>series hechas</span></div>
          {!durManual && <div className="stat"><b>{fmtDur(Date.now() - sesion.inicio)}</b><span>duración</span></div>}
        </div>
        {durManual && (
          <div className="card">
            <div className="bold small">¿Cuánto duró?</div>
            <div className="xsmall muted" style={{ margin: '2px 0 9px' }}>{sesion.retro ? `Sesión del ${fmtFecha(sesion.fecha)}, cargada después.` : 'La sesión quedó abierta muchas horas. Poné la duración real.'}</div>
            <Stepper value={dur} step={5} min={0} max={600} unit="minutos" onChange={setDur} />
          </div>
        )}
        {pend > 0 && <div className="banner">Quedan {plural(pend, 'serie sin marcar', 'series sin marcar')}. Al terminar se descartan: solo se guarda lo que tildaste.</div>}
        <div className="card">
          <div className="bold small">¿Qué tan dura fue la sesión?</div>
          <div className="xsmall muted" style={{ margin: '2px 0 9px' }}>Esfuerzo global de 1 (muy suave) a 10 (máximo)</div>
          <Chips opciones={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ v: n as number | null, t: String(n) }))} valor={srpe} onPick={setSrpe} />
        </div>
        <div className="card">
          <textarea rows={3} placeholder="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} aria-label="Notas de la sesión" />
        </div>
        {sesion.plan_day_id != null && (
          <button className="card row" onClick={() => setActualizar((a) => !a)} aria-pressed={actualizar}>
            <span className={`chip sm${actualizar ? ' on' : ''}`}>{actualizar ? '✓' : ''}</span>
            <span className="grow small"><b>Actualizar el plan con los pesos y reps de hoy</b><br /><span className="muted xsmall">Si no lo marcás, el plan queda como está configurado. Los ejercicios agregados, cambiados o quitados hoy nunca tocan el plan.</span></span>
          </button>
        )}
        <button className="btn primary block lg" disabled={hechas === 0} onClick={async () => {
          await terminarSesion(sesion, srpe, notas.trim() || null, actualizar, durManual ? dur : null)
          nav.raiz({ v: 'hoy' })
        }}>Guardar sesión</button>
        <button className="btn ghost block danger" style={{ marginTop: 8 }} onClick={async () => {
          if (await confirmar({ titulo: '¿Descartar la sesión?', texto: 'Se borra todo lo registrado en esta sesión.', ok: 'Descartar', peligro: true })) {
            await descartarSesion(sesion.id!)
            nav.raiz({ v: 'hoy' })
          }
        }}>Descartar sesión</button>
      </div>
    </>
  )
}
