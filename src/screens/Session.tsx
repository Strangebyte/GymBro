import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Exercise, type Session, type SetLog, type Settings, type Tramo } from '../db'
import { alinearArriba, bajarConEnter, Chevron, Desplegable, Escala10, HistorialLista, Ico, MediaView, Picker, Sheet, Stepper, TopBar, useDialogos, useNav, useTieneMedia } from '../ui'
import { AYUDA_TEC, etiqueta, fmtDur, fmtFecha, fmtFechaCorta, NOMBRE_TEC, resumenTramos, pesoDesdeTexto, pesoTxt, plural, resumenSets, rotuloPeso, setValido, tecCorta, ultimaVez, unidadPeso } from '../lib'
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
  const [ahora, setAhora] = useState(Date.now())   // solo para mostrar cuánto lleva la sesión
  const porEjercicio = settings.tilde === 'ejercicio'

  const setAbierto = (b: number | null) => { memoria.abierto = b; setAbiertoLocal(b) }
  // Al abrir un bloque tocándolo, la pantalla lo lleva arriba (el que estaba abierto se cierra y todo se corre).
  const irA = useRef<number | null>(null)
  const tocarBloque = (b: number) => { if (abierto !== b) irA.current = b; setAbierto(abierto === b ? null : b) }
  /** Al completar un bloque, se cierra. Si su encabezado había quedado fuera de la vista, la pantalla vuelve a él. */
  const cerrarCompleto = (b: number) => {
    if (memoria.abierto !== b) return
    setAbierto(null)
    const el = document.querySelector<HTMLElement>(`[data-bloque="${b}"]`)
    const barra = document.querySelector<HTMLElement>('.topbar')?.offsetHeight ?? 0
    if (el && el.getBoundingClientRect().top < barra) alinearArriba(el)
  }
  useEffect(() => {
    if (irA.current == null) return
    const b = irA.current; irA.current = null
    requestAnimationFrame(() => alinearArriba(document.querySelector(`[data-bloque="${b}"]`)))
  }, [abierto])
  useEffect(() => {
    if (sesion?.id && memoria.sesion !== sesion.id) { memoria.sesion = sesion.id; setAbierto(null) }
  }, [sesion?.id])

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 15000)
    return () => clearInterval(id)
  }, [])

  const items = useMemo<Item[]>(() => (sets && ejercicios ? armarItems(sets, ejercicios) : []), [sets, ejercicios])
  const bloques = useMemo(() => [...new Set(items.map((i) => i.bloque))].sort((a, b) => a - b), [items])

  if (sesion === undefined || !sets || !ejercicios) return <><TopBar titulo="Sesión" atras /><div className="main sin-tabs"><div className="empty">Cargando…</div></div></>
  if (!sesion) return <><TopBar titulo="Sesión" atras /><div className="main sin-tabs"><div className="empty">No hay una sesión en curso.</div></div></>

  const total = sets.length
  const hechas = sets.filter((s) => s.hecha).length
  const conPlan = sesion.plan_day_id != null
  const bloquesPlan = [...new Set(sets.filter((s) => s.plan).map((s) => s.bloque))]
  const bloqueExtra = bloquesPlan.length ? Math.max(...bloquesPlan) + 1 : conPlan ? (bloques.length ? Math.max(...bloques) + 1 : 1) : 1

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
      <div className="main sin-tabs">
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
            <div key={b} className={`bloque${listo ? ' listo' : ''}`} data-bloque={b}>
              <div className="bloque-h">
                <button className="row grow" onClick={() => tocarBloque(b)} aria-expanded={abierto === b}>
                  <Chevron abierto={abierto === b} />
                  <span className="num">{esExtra ? '+' : b}</span>
                  <span className="grow">
                    <span className="bold">{nombre}</span>
                    <span className="xsmall muted" style={{ display: 'block' }}>{plural(its.length, 'ejercicio', 'ejercicios')}</span>
                    <span className="xsmall muted truncate" style={{ display: 'block' }}>{desc.slice(0, 5).join(' · ')}</span>
                  </span>
                </button>
                {!porEjercicio && (
                  <button className={`tilde${listo ? ' on' : ''}`} aria-pressed={listo} aria-label={`${listo ? 'Desmarcar' : 'Marcar hecho'} ${nombre}`}
                    onClick={async () => { if (await marcar(delBloque, nombre)) cerrarCompleto(b) }}>✓</button>
                )}
                {porEjercicio && listo && <span className="hecho" aria-label="Bloque hecho">✓</span>}
              </div>
              <Desplegable abierto={abierto === b} cerrarYa={abierto != null}>
                <div className="bloque-c">
                  {its.map((it) => (
                    <Tarjeta key={`${it.key}-${it.ex.id}`} item={it} sesion={sesion} porEjercicio={porEjercicio}
                      onMarcar={async () => { if (await marcar(it.sets, it.ex.nombre) && delBloque.every((s) => s.hecha || it.sets.includes(s))) cerrarCompleto(b) }} />
                  ))}
                  {esExtra && <button className="btn xs block" onClick={() => setPicker(b)}>+ Otro ejercicio</button>}
                </div>
              </Desplegable>
            </div>
          )
        })}

        <button className="btn block" style={{ marginTop: 14 }} onClick={() => setPicker(bloqueExtra)}>
          {conPlan ? '+ Agregar ejercicios adicionales' : '+ Agregar ejercicio'}
        </button>
      </div>

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
  const [tramosDe, setTramosDe] = useState<number | null>(null)   // serie con la ventana de técnica abierta
  const tieneMedia = useTieneMedia(ex.id!, ex.url, ex.slug)
  const nota = useLiveQuery(async () => {
    if (sesion.plan_day_id == null) return null
    const dia = await db.planDays.get(sesion.plan_day_id)
    const e = dia?.bloques.find((b) => b.orden === item.bloque)?.ejercicios[item.orden - 1]
    return e && e.exercise_id === ex.id ? e.notas : null
  }, [sesion.plan_day_id, item.bloque, item.orden, ex.id])

  useEffect(() => {
    let vivo = true
    void ultimaVez(ex.id!, sesion.id!).then((u) => { if (vivo) setPrevio(u ? { fecha: u.fecha, txt: resumenSets(u.sets, ex.lastre, ex.dos_pesas) } : null) })
    return () => { vivo = false }
  }, [ex.id, ex.lastre, ex.dos_pesas, sesion.id])

  const listo = sets.every((s) => s.hecha)
  const enSeg = sets.some((s) => s.seg != null) || (ex.mide === 'seg' && !sets.some((s) => s.reps != null))
  const quitar = async () => {
    if (!(await confirmar({ titulo: `¿Quitar ${ex.nombre}?`, texto: 'Solo se quita de esta sesión. El plan no cambia.', ok: 'Quitar', peligro: true }))) return
    await db.setLogs.bulkDelete(sets.map((s) => s.id!))
  }
  const objetivo = (s: SetLog) => [s.tipo === 'calentamiento' ? 'calent.' : '', s.rir != null ? `RIR ${s.rir}` : '', s.rpe != null ? `RPE ${s.rpe}` : '', s.fallo ? 'fallo' : '', tecCorta(s.tec)].filter(Boolean).join(' · ')

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
        <div className="xsmall muted" style={{ marginTop: 2 }}>
          {previo ? <>Últ. vez ({fmtFechaCorta(previo.fecha)}): <span className="mono">{previo.txt}</span></> : 'Primera vez que lo registrás'}
        </div>
      )}

      <div className="ss h">
        <span /><span>{enSeg ? 'seg' : 'reps'}{ex.unilateral ? ' c/lado' : ''}</span><span>{ex.lastre ? `lastre ${unidadPeso()}` : rotuloPeso(ex.dos_pesas)}</span><span>objetivo</span><span />
      </div>
      {sets.map((s) => (
        <Fragment key={s.id}>
        <div className="ss">
          <span className="n">{s.serie}</span>
          <input inputMode="numeric" enterKeyHint="enter" onKeyDown={bajarConEnter} aria-label={`${ex.nombre}, serie ${s.serie}: ${enSeg ? 'segundos' : 'reps'}`}
            defaultValue={enSeg ? (s.seg ?? '') : (s.reps ?? '')} placeholder={s.fallo ? 'fallo' : '—'}
            onBlur={(e) => { const n = aNum(e.target.value); void db.setLogs.update(s.id!, enSeg ? { seg: n, reps: null } : { reps: n, seg: null }) }} />
          <input inputMode="decimal" enterKeyHint="enter" onKeyDown={bajarConEnter} aria-label={`${ex.nombre}, serie ${s.serie}: peso en ${rotuloPeso(ex.dos_pesas)}`}
            defaultValue={pesoTxt(s.peso_g)} placeholder="—"
            onBlur={(e) => { const g = pesoDesdeTexto(e.target.value, s.peso_g); if (g !== (s.peso_g || null)) void db.setLogs.update(s.id!, { peso_g: g }) }} />
          {s.tec ? (
            <button className="obj tec" onClick={() => setTramosDe(s.id!)} aria-label={`${NOMBRE_TEC[s.tec.tipo]} de la serie ${s.serie}: cargar`}>
              <span className="tip">{objetivo(s)}</span><span className={`res${resumenTramos(s) ? '' : ' vacio'}`}>{resumenTramos(s) || 'Cargar'} ›</span>
            </button>
          ) : <span className="obj">{objetivo(s) || '—'}</span>}
          <button className="x" aria-label={`Borrar serie ${s.serie} de ${ex.nombre}`} onClick={() => void db.setLogs.delete(s.id!)}>✕</button>
        </div>
        </Fragment>
      ))}
      <div className="acc">
        <button onClick={() => void agregarSerie(sets, editando)}>+ Serie</button>
        <button onClick={() => setHoja('cambiar')}>Cambiar ejercicio</button>
        <button className="q" onClick={() => void quitar()}>Quitar</button>
      </div>

      {hoja === 'historial' && <Sheet titulo={ex.nombre} onCerrar={() => setHoja(null)}><HistorialLista exerciseId={ex.id!} lastre={ex.lastre} cu={ex.dos_pesas} excluir={sesion.id} /></Sheet>}
      {hoja === 'media' && <Sheet titulo={ex.nombre} onCerrar={() => setHoja(null)}><MediaView exerciseId={ex.id!} url={ex.url} slug={ex.slug} /></Sheet>}
      {tramosDe != null && sets.find((x) => x.id === tramosDe)?.tec && (
        <TramosHoja s={sets.find((x) => x.id === tramosDe)!} ex={ex} onCerrar={() => setTramosDe(null)} />
      )}
      {hoja === 'cambiar' && (
        <Picker titulo={`Reemplazar ${ex.nombre}`} onCerrar={() => setHoja(null)}
          onElegir={(nuevo) => { void db.setLogs.bulkUpdate(sets.map((s) => ({ key: s.id!, changes: { exercise_id: nuevo.id! } }))) }} />
      )}
    </div>
  )
}

// ------------------------------------------------------------------ técnicas
/**
 * Ventana para cargar lo hecho en una serie con técnica: reps de cada mini-serie (myo), de cada tanda tras una pausa
 * (rest-pause), o peso y reps de cada bajada (drop). Un renglón por tramo; se puede agregar hasta 3 más de lo
 * prescripto y quitar cualquiera.
 */
function TramosHoja({ s, ex, onCerrar }: { s: SetLog; ex: Exercise; onCerrar: () => void }) {
  const tec = s.tec!
  // Sin cargar todavía: tantos renglones como lo prescripto. Si el usuario los quitó todos queda [] (y no se vuelven a llenar).
  const tramos: Tramo[] = s.tramos ?? Array.from({ length: tec.n }, () => ({ reps: null }))
  const max = Math.min(10, tec.n + 3)
  // Cada cambio lee lo último guardado dentro de una transacción: si se cargan peso y reps seguidos, uno no pisa al otro.
  const cambiar = (fn: (actuales: Tramo[]) => Tramo[]) => void db.transaction('rw', db.setLogs, async () => {
    const guardados = (await db.setLogs.get(s.id!))?.tramos
    await db.setLogs.update(s.id!, { tramos: fn(guardados ?? tramos) })
  })
  const guardar = (i: number, c: Partial<Tramo>) => cambiar((ts) => ts.map((t, j) => (j === i ? { ...t, ...c } : t)))
  const sugerido = (i: number) => (s.peso_g && tec.pct ? Math.round(s.peso_g * Math.pow(1 - tec.pct / 100, i + 1)) : null)
  const cual = tec.tipo === 'myo' ? 'mini-serie' : tec.tipo === 'rp' ? 'pausa' : 'bajada'
  const titulo = tec.tipo === 'myo' ? 'Mini-serie' : tec.tipo === 'rp' ? 'Tras la pausa' : 'Bajada'
  const u = rotuloPeso(ex.dos_pesas)
  return (
    <Sheet titulo={`Serie ${s.serie} · ${NOMBRE_TEC[tec.tipo]}`} onCerrar={onCerrar} accion={<button className="btn primary sm" onClick={onCerrar}>Listo</button>}>
      <div className="xsmall muted">{AYUDA_TEC[tec.tipo]}</div>
      <div className="tramo-fila principal">
        <b className="small">Serie</b>
        <span className="small">{s.reps != null ? `${s.reps} reps` : s.seg != null ? `${s.seg} seg` : '— reps'}{s.peso_g ? ` × ${pesoTxt(s.peso_g)} ${u}` : ''}</span>
        <span />
      </div>
      {tramos.map((t, i) => (
        <div key={`${i}-${tramos.length}`} className="tramo-fila">
          <span className="small">{titulo} {i + 1}</span>
          <span className="campos">
            {tec.tipo === 'drop' && (
              <>
                <input inputMode="decimal" aria-label={`${ex.nombre}, serie ${s.serie}, ${cual} ${i + 1}: peso`} defaultValue={pesoTxt(t.peso_g)}
                  placeholder={pesoTxt(sugerido(i)) || unidadPeso()}
                  onBlur={(e) => { const g = pesoDesdeTexto(e.target.value, t.peso_g); if (g !== (t.peso_g || null)) guardar(i, { peso_g: g }) }} />
                <span className="xsmall muted">{u} ×</span>
              </>
            )}
            <input inputMode="numeric" aria-label={`${ex.nombre}, serie ${s.serie}, ${cual} ${i + 1}: reps`} defaultValue={t.reps ?? ''}
              placeholder={tec.tipo === 'myo' && tec.reps ? String(tec.reps) : '—'}
              onBlur={(e) => { const n = aNum(e.target.value); if (n !== t.reps) guardar(i, { reps: n }) }} />
            <span className="xsmall muted">reps</span>
          </span>
          <button className="mini" aria-label={`Quitar la ${cual} ${i + 1} de la serie ${s.serie}`} onClick={() => cambiar((ts) => ts.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      {tramos.length < max
        ? <button className="btn ghost block sm" style={{ marginTop: 6 }} aria-label={`Agregar otra ${cual} a la serie ${s.serie}`} onClick={() => cambiar((ts) => (ts.length < max ? [...ts, { reps: null }] : ts))}>+ Otra {cual}</button>
        : <div className="xsmall muted center" style={{ marginTop: 8 }}>Hasta {max} por serie.</div>}
    </Sheet>
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
  const [aMano, setAMano] = useState(false)   // el reloj siguió corriendo (se olvidó de terminarla): la duración la pone él
  if (!sesion || !sets) return <><TopBar titulo="Terminar sesión" atras /><div className="main sin-tabs"><div className="empty">No hay sesión en curso.</div></div></>
  const hechas = sets.filter((s) => s.hecha).length
  const pend = sets.length - hechas
  const minutos = Math.round((Date.now() - sesion.inicio) / 60000)
  // Sin reloj confiable (sesión de otro día, o quedó abierta por horas): la duración se carga a mano.
  const sinReloj = !!sesion.retro || minutos > 240
  const durManual = sinReloj || aMano
  const hora = (ms: number) => new Date(ms).toTimeString().slice(0, 5)
  return (
    <>
      <TopBar titulo="Terminar sesión" sub={sesion.nombre} atras />
      <div className="main sin-tabs">
        <div className="row" style={{ marginBottom: 10, alignItems: 'stretch' }}>
          <div className="stat"><b>{hechas}</b><span>series hechas</span></div>
          {!durManual && (
            <div className="stat"><b>{fmtDur(Date.now() - sesion.inicio)}</b><span>duración</span>
              <button className="btn xs dur" onClick={() => { setDur(Math.min(600, Math.max(5, Math.round(minutos / 5) * 5))); setAMano(true) }}>Cambiar</button>
            </div>
          )}
        </div>
        {durManual && (
          <div className="card">
            <div className="row spread">
              <span className="bold small">¿Cuánto duró?</span>
              {!sinReloj && <button className="btn xs" onClick={() => setAMano(false)}>Usar el reloj</button>}
            </div>
            <div className="xsmall muted" style={{ margin: '2px 0 9px' }}>
              {sesion.retro ? `Sesión del ${fmtFecha(sesion.fecha)}, cargada después.` : sinReloj ? 'La sesión quedó abierta muchas horas. Poné la duración real.' : 'Si te olvidaste de terminarla, poné cuánto duró de verdad.'}
            </div>
            <Stepper value={dur} step={5} min={0} max={600} unit="minutos" onChange={setDur} />
            {!sesion.retro && dur != null && (
              <div className="xsmall muted" style={{ marginTop: 8 }}>Empezó a las {hora(sesion.inicio)}: con esta duración, terminó a las {hora(sesion.inicio + dur * 60000)}.</div>
            )}
          </div>
        )}
        {pend > 0 && <div className="banner">Quedan {plural(pend, 'serie sin marcar', 'series sin marcar')}. Al terminar se descartan: solo se guarda lo que tildaste.</div>}
        <div className="card">
          <div className="bold small">¿Qué tan dura fue la sesión?</div>
          <div className="xsmall muted" style={{ margin: '2px 0 9px' }}>Esfuerzo global de la sesión</div>
          <Escala10 valor={srpe} onPick={setSrpe} etiqueta="Esfuerzo de la sesión" />
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
