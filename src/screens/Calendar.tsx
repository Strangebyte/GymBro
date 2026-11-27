import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, setSettings, type Activity, type Settings } from '../db'
import { alinearArriba, Chips, Desplegable, Escala10, Picker, Stepper, TopBar, useDialogos, useNav } from '../ui'
import { agruparPorDia, duracionSesion, plural, fechaDe, fmtFechaLarga, hoyISO, isoDe, MESES, resumenSets, setValido } from '../lib'
import { agregarEjercicio, descartarSesion, iniciarSesion, sesionEnCurso } from '../actions'
import { ElegirDia, PREGUNTAS } from './Today'
import { armarItems, EncabezadoBloque, Tarjeta } from './Session'

export function CalendarScreen() {
  const nav = useNav()
  const { avisar } = useDialogos()
  const [elegir, setElegir] = useState(false)
  const sesiones = useLiveQuery(() => db.sessions.toArray(), [])
  const actividades = useLiveQuery(() => db.activities.toArray(), [])
  const hoy = hoyISO()
  const [mes, setMes] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const [sel, setSel] = useState(hoy)
  const porDia = useMemo(() => agruparPorDia(sesiones ?? [], actividades ?? []), [sesiones, actividades])

  const primero = new Date(mes.y, mes.m, 1)
  const offset = (primero.getDay() + 6) % 7
  const nDias = new Date(mes.y, mes.m + 1, 0).getDate()
  const celdas: (string | null)[] = [...Array(offset).fill(null), ...Array.from({ length: nDias }, (_, i) => isoDe(new Date(mes.y, mes.m, i + 1)))]
  const delMes = celdas.filter((c): c is string => !!c)
  const nGym = delMes.reduce((n, f) => n + (porDia.get(f)?.gym.length ?? 0), 0)
  const nAct = delMes.reduce((n, f) => n + (porDia.get(f)?.act.length ?? 0), 0)
  const nActivos = delMes.filter((f) => porDia.has(f)).length
  const mover = (d: number) => setMes(({ y, m }) => { const n = new Date(y, m + d, 1); return { y: n.getFullYear(), m: n.getMonth() } })
  const r = porDia.get(sel)
  const cargarGym = async () => {
    if (await sesionEnCurso()) { avisar('Tenés una sesión en curso. Terminala o descartala antes de cargar otra.'); return }
    setElegir(true)
  }
  const empezarRetro = async (diaId: number | null) => {
    setElegir(false)
    const dia = diaId != null ? (await db.planDays.get(diaId)) ?? null : null
    await iniciarSesion(dia, null, sel)
    nav.ir({ v: 'sesion' })
  }

  return (
    <>
      <TopBar titulo="Calendario" sub={`${plural(nGym, 'sesión de gym', 'sesiones de gym')} · ${plural(nAct, 'otra actividad', 'otras actividades')}`} />
      <div className="main">
        <div className="card">
          <div className="row spread" style={{ marginBottom: 8 }}>
            <button className="icon-btn" onClick={() => mover(-1)} aria-label="Mes anterior">‹</button>
            <b style={{ textTransform: 'capitalize' }}>{MESES[mes.m]} {mes.y}</b>
            <button className="icon-btn" onClick={() => mover(1)} aria-label="Mes siguiente">›</button>
          </div>
          <div className="cal">
            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <div key={i} className="dow">{d}</div>)}
            {celdas.map((f, i) => {
              if (!f) return <div key={`v${i}`} />
              const x = porDia.get(f)
              const g = !!x?.gym.length, a = !!x?.act.length
              return (
                <button key={f} onClick={() => setSel(f)} aria-pressed={sel === f}
                  aria-label={`${fmtFechaLarga(f)}${g ? ', gimnasio' : ''}${a ? ', otra actividad' : ''}`}
                  className={`${g && a ? 'ambos' : g ? 'gym' : a ? 'act' : ''}${f === hoy ? ' hoy' : ''}${f === sel ? ' sel' : ''}`}>
                  {fechaDe(f).getDate()}
                  <span className="dots">{g && <i />}{a && <i className="a" />}</span>
                </button>
              )
            })}
          </div>
          <div className="leyenda">
            <span><i style={{ background: 'var(--pri)' }} />Gimnasio</span>
            <span><i style={{ background: 'var(--act)' }} />Otra actividad</span>
          </div>
        </div>

        <div className="row" style={{ marginBottom: 10 }}>
          <div className="stat"><b>{nGym}</b><span>gym</span></div>
          <div className="stat"><b style={{ color: 'var(--act-text)' }}>{nAct}</b><span>otras</span></div>
          <div className="stat"><b>{nActivos}</b><span>días activos</span></div>
        </div>

        <h2 style={{ textTransform: 'none', letterSpacing: 0, fontSize: 15, color: 'var(--text)' }}>{fmtFechaLarga(sel)}</h2>
        {!r && <div className="card flat muted small">Sin actividad registrada.</div>}
        {r?.gym.map((s) => (
          <button key={s.id} className="card tight" onClick={() => nav.ir({ v: 'sesionDetalle', id: s.id! })}>
            <div className="row spread"><span className="pill pri">Gimnasio</span><span className="xsmall muted">{duracionSesion(s) != null ? `${duracionSesion(s)} min` : ''}{s.srpe != null ? ` · esfuerzo ${s.srpe}` : ''}</span></div>
            <div className="bold" style={{ marginTop: 6 }}>{s.nombre}</div>
            {s.notas && <div className="xsmall muted" style={{ marginTop: 3 }}>{s.notas}</div>}
          </button>
        ))}
        {r?.act.map((a) => (
          <button key={a.id} className="card tight" onClick={() => nav.ir({ v: 'actividad', id: a.id!, fecha: a.fecha })}>
            <div className="row spread"><span className="pill act">Actividad</span><span className="xsmall muted">{a.dur_min ? `${a.dur_min} min` : ''}{a.esfuerzo != null ? ` · esfuerzo ${a.esfuerzo}` : ''}</span></div>
            <div className="bold" style={{ marginTop: 6 }}>{a.tipo}</div>
            {a.notas && <div className="xsmall muted" style={{ marginTop: 3 }}>{a.notas}</div>}
          </button>
        ))}
        <button className="btn act block" onClick={() => nav.ir({ v: 'actividad', id: null, fecha: sel })}>+ Actividad este día</button>
        {sel <= hoy && <button className="btn block" style={{ marginTop: 8 }} onClick={() => void cargarGym()}>+ Sesión de gym este día</button>}
      </div>
      {elegir && <ElegirDia titulo={`¿Qué entrenaste el ${fechaDe(sel).getDate()}/${fechaDe(sel).getMonth() + 1}?`} onCerrar={() => setElegir(false)} onElegir={(d) => void empezarRetro(d)} />}
    </>
  )
}

// ------------------------------------------------------------------ actividad
export function ActivityScreen({ id, fecha, settings }: { id: number | null; fecha: string; settings: Settings }) {
  const nav = useNav()
  const { confirmar, avisar } = useDialogos()
  const [a, setA] = useState<Activity>({ fecha, tipo: '', dur_min: 60, esfuerzo: null, notas: null })
  const [nuevoTipo, setNuevoTipo] = useState('')
  useEffect(() => { if (id != null) void db.activities.get(id).then((x) => x && setA(x)) }, [id])

  const guardar = async () => {
    if (!a.tipo) { avisar('Elegí qué actividad hiciste.'); return }
    if (!a.fecha) { avisar('Falta la fecha.'); return }
    if (id != null) await db.activities.put({ ...a, id }); else await db.activities.add(a)
    nav.volver()
  }
  const agregarTipo = async () => {
    const t = nuevoTipo.trim()
    if (!t) return
    if (!settings.tipos_actividad.some((x) => x.toLowerCase() === t.toLowerCase())) await setSettings({ tipos_actividad: [...settings.tipos_actividad, t] })
    setA({ ...a, tipo: t }); setNuevoTipo('')
  }
  const tipos = settings.tipos_actividad.includes(a.tipo) || !a.tipo ? settings.tipos_actividad : [...settings.tipos_actividad, a.tipo]
  return (
    <>
      <TopBar titulo={id != null ? 'Editar actividad' : 'Otra actividad'} atras />
      <div className="main sin-tabs">
        <div className="card">
          <label className="f" style={{ marginTop: 0 }}>¿Qué hiciste?</label>
          <Chips wrap opciones={tipos.map((t) => ({ v: t, t }))} valor={a.tipo} onPick={(t) => setA({ ...a, tipo: t })} />
          <div className="row" style={{ marginTop: 10 }}>
            <input placeholder="Otra actividad…" value={nuevoTipo} onChange={(e) => setNuevoTipo(e.target.value)} aria-label="Nueva actividad"
              onKeyDown={(e) => { if (e.key === 'Enter') void agregarTipo() }} />
            <button className="btn sm" onClick={() => void agregarTipo()}>Agregar</button>
          </div>
        </div>
        <div className="card">
          <label className="f" style={{ marginTop: 0 }} htmlFor="af">Fecha</label>
          <input id="af" type="date" value={a.fecha} max={hoyISO()} onChange={(e) => setA({ ...a, fecha: e.target.value })} />
          <label className="f">Duración</label>
          <Stepper value={a.dur_min} step={5} unit="minutos" onChange={(v) => setA({ ...a, dur_min: v })} />
          <label className="f">Esfuerzo (opcional)</label>
          <Escala10 valor={a.esfuerzo} onPick={(v) => setA({ ...a, esfuerzo: v })} etiqueta="Esfuerzo de la actividad" />
          <label className="f" htmlFor="an">Notas (opcional)</label>
          <textarea id="an" rows={2} value={a.notas ?? ''} onChange={(e) => setA({ ...a, notas: e.target.value || null })} />
        </div>
        <button className="btn primary block lg" onClick={() => void guardar()}>Guardar</button>
        {id != null && (
          <button className="btn ghost block danger" style={{ marginTop: 8 }} onClick={async () => {
            if (await confirmar({ titulo: '¿Borrar esta actividad?', ok: 'Borrar', peligro: true })) { await db.activities.delete(id); nav.volver() }
          }}>Borrar actividad</button>
        )}
      </div>
    </>
  )
}

// ------------------------------------------------------------------ detalle de sesión
export function SessionDetailScreen({ id }: { id: number }) {
  const nav = useNav()
  const { confirmar } = useDialogos()
  const sesion = useLiveQuery(() => db.sessions.get(id), [id])
  const sets = useLiveQuery(() => db.setLogs.where('session_id').equals(id).toArray(), [id])
  const ejercicios = useLiveQuery(() => db.exercises.toArray(), [])
  const [editando, setEditando] = useState(false)
  const [picker, setPicker] = useState<number | null>(null)
  const [abierto, setAbierto] = useState<number | null>(null)   // al editar, como en la sesión: un bloque abierto por vez
  if (!sesion || !sets || !ejercicios) return <><TopBar titulo="Sesión" atras /><div className="main sin-tabs"><div className="empty">Cargando…</div></div></>

  if (editando) {
    const items = armarItems(sets, ejercicios)
    const bloquesEd = [...new Set(items.map((i) => i.bloque))].sort((a, b) => a - b)
    // Al terminar se descartan las series que quedaron sin ningún dato. Se relee la base por si el último campo recién se guardó.
    const listo = async () => {
      const vacias = (await db.setLogs.where('session_id').equals(id).toArray()).filter((s) => !setValido(s))
      if (vacias.length) await db.setLogs.bulkDelete(vacias.map((s) => s.id!))
      setEditando(false)
    }
    // Al abrir un bloque, la pantalla lo lleva arriba (el que estaba abierto se cierra y todo se corre).
    const tocarBloque = (b: number) => {
      const abre = abierto !== b
      setAbierto(abre ? b : null)
      if (abre) requestAnimationFrame(() => alinearArriba(document.querySelector(`[data-bloque="${b}"]`)))
    }
    return (
      <>
        <TopBar titulo="Editar sesión" sub={sesion.nombre} atras der={<button className="btn primary sm" onClick={() => void listo()}>Listo</button>} />
        <div className="main sin-tabs">
          <div className="card">
            <label className="f" style={{ marginTop: 0 }} htmlFor="sf">Fecha</label>
            <input id="sf" type="date" defaultValue={sesion.fecha} max={hoyISO()} onChange={(e) => { if (e.target.value) void db.sessions.update(id, { fecha: e.target.value }) }} />
            <label className="f">Duración</label>
            <Stepper value={duracionSesion(sesion)} step={5} min={0} max={600} unit="minutos" onChange={(v) => void db.sessions.update(id, { dur_min: v })} />
            <label className="f">Esfuerzo (opcional)</label>
            <Escala10 valor={sesion.srpe} onPick={(v) => void db.sessions.update(id, { srpe: v })} etiqueta="Esfuerzo de la sesión" />
            <label className="f" htmlFor="sn">Notas</label>
            <textarea id="sn" rows={2} defaultValue={sesion.notas ?? ''} onBlur={(e) => void db.sessions.update(id, { notas: e.target.value.trim() || null })} />
          </div>
          {bloquesEd.map((b) => {
            const its = items.filter((i) => i.bloque === b)
            return (
              <div key={b} className="bloque" data-bloque={b}>
                <EncabezadoBloque num={b} nombre={`Bloque ${b}`} its={its} abierto={abierto === b} onTocar={() => tocarBloque(b)} />
                <Desplegable abierto={abierto === b} cerrarYa={abierto != null}>
                  <div className="bloque-c">
                    {its.map((it) => (
                      <Tarjeta key={`${it.key}-${it.ex.id}`} item={it} sesion={sesion} porEjercicio={false} onMarcar={() => {}} editando />
                    ))}
                  </div>
                </Desplegable>
              </div>
            )
          })}
          <button className="btn block" style={{ marginTop: 14 }} onClick={() => setPicker(bloquesEd.length ? Math.max(...bloquesEd) + 1 : 1)}>+ Agregar ejercicio</button>
          <div className="xsmall muted center" style={{ marginTop: 8 }}>Los cambios se guardan solos. El plan no se modifica.</div>
        </div>
        {picker != null && (
          <Picker multi titulo="Agregar ejercicio" onCerrar={() => setPicker(null)} onElegir={(e) => { void agregarEjercicio(sesion, e, picker, true); setAbierto(picker) }} />
        )}
      </>
    )
  }

  const mapa = new Map(ejercicios.map((e) => [e.id!, e]))
  const hechas = sets.filter((s) => s.hecha)
  const grupos = new Map<string, typeof hechas>()
  for (const s of hechas) { const k = `${s.bloque}-${s.orden}`; grupos.set(k, [...(grupos.get(k) ?? []), s]) }
  const orden = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
  const bloques = [...new Set(hechas.map((s) => s.bloque))].sort((a, b) => a - b)
  return (
    <>
      <TopBar titulo={sesion.nombre} sub={fmtFechaLarga(sesion.fecha)} atras der={<button className="btn sm" onClick={() => { setAbierto(null); setEditando(true) }}>Editar</button>} />
      <div className="main sin-tabs">
        {sesion.origen === 'importado' && <div className="banner">Sesión importada del historial anterior. Los pesos tienen confianza media: se leyeron de capturas de pantalla.</div>}
        <div className="row" style={{ marginBottom: 10 }}>
          <div className="stat"><b>{duracionSesion(sesion) ?? '—'}</b><span>minutos</span></div>
          <div className="stat"><b>{hechas.filter((s) => s.tipo !== 'calentamiento').length}</b><span>series</span></div>
          <div className="stat"><b>{sesion.srpe ?? '—'}</b><span>esfuerzo</span></div>
          <div className="stat"><b>{sesion.wellness_prom ?? '—'}</b><span>wellness</span></div>
        </div>
        {sesion.wellness && (
          <div className="card tight">
            {PREGUNTAS.map((p) => <div key={p.k} className="kv"><span className="muted">{p.corto}</span><b>{sesion.wellness![p.k]} / 5</b></div>)}
          </div>
        )}
        {sesion.notas && <div className="card tight small">{sesion.notas}</div>}
        {bloques.map((b) => (
          <div key={b}>
            <h2>Bloque {b}</h2>
            <div className="list">
              {orden.filter(([k]) => k.startsWith(`${b}-`)).map(([k, arr]) => {
                const ex = mapa.get(arr[0].exercise_id)
                const ordenadas = [...arr].sort((x, y) => x.serie - y.serie)
                return (
                  <button key={k} className="item" style={{ alignItems: 'flex-start' }} onClick={() => ex && nav.ir({ v: 'ejercicio', id: ex.id! })}>
                    <div className="grow">
                      <div className="bold small">{ex?.nombre ?? 'Ejercicio borrado'}</div>
                      <div className="xsmall muted mono" style={{ marginTop: 2 }}>{resumenSets(ordenadas, ex?.lastre, ex?.dos_pesas)}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        <button className="btn ghost block danger" style={{ marginTop: 16 }} onClick={async () => {
          if (await confirmar({ titulo: '¿Borrar esta sesión?', texto: 'Se borran también todas sus series. No se puede deshacer.', ok: 'Borrar', peligro: true })) {
            await descartarSesion(id); nav.volver()
          }
        }}>Borrar sesión</button>
      </div>
    </>
  )
}
