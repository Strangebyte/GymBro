import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, setSettings, type Medidas, type SetLog, type Settings } from '../db'
import { Catalogo, Chevron, Chips, Sheet, TopBar, useDialogos } from '../ui'
import { agruparPorDia, enUnidad, etiqueta, fmtFecha, fmtPeso, hoyISO, lunesDe, numES, pesoDesdeTexto, pesoTxt, plural, progresoDe, sumarDias, unidadDe, unidadPeso, type Medida, type Punto } from '../lib'
import { PREGUNTAS } from './Today'

/** Gráfico de línea con puntos que se pueden tocar. */
export function GraficoPesos({ puntos, unidad = unidadPeso(), ayuda = 'Tocá un punto para ver esa sesión' }: { puntos: Punto[]; unidad?: string; ayuda?: string }) {
  const [sel, setSel] = useState(puntos.length - 1)
  if (!puntos.length) return null
  const W = 320, H = 150, px = 34, py = 16
  const ks = puntos.map((p) => p.valor)
  let min = Math.min(...ks), max = Math.max(...ks)
  if (max - min < 1) { min -= 2.5; max += 2.5 }
  const pad = (max - min) * 0.12
  min -= pad; max += pad
  const x = (i: number) => (puntos.length === 1 ? W / 2 : px + (i / (puntos.length - 1)) * (W - px - 12))
  const y = (k: number) => py + (1 - (k - min) / (max - min)) * (H - py - 24)
  const s = puntos[Math.min(sel, puntos.length - 1)]
  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Mejor marca por sesión, de ${numES(puntos[0].valor)} a ${numES(puntos[puntos.length - 1].valor)} ${unidad}`}>
        {[0, 0.5, 1].map((t) => { const v = min + pad + t * (max - min - 2 * pad); return (
          <g key={t}><line className="eje" x1={px} x2={W - 6} y1={y(v)} y2={y(v)} /><text x={px - 5} y={y(v) + 4} textAnchor="end">{numES(Math.round(v * 2) / 2)}</text></g>
        ) })}
        <polyline className="ln" points={puntos.map((p, i) => `${x(i)},${y(p.valor)}`).join(' ')} />
        {puntos.map((p, i) => (
          <g key={i} onClick={() => setSel(i)} style={{ cursor: 'pointer' }}>
            <circle cx={x(i)} cy={y(p.valor)} r={14} fill="transparent" />
            <circle className={`pt${i === sel ? ' sel' : ''}`} cx={x(i)} cy={y(p.valor)} r={i === sel ? 5.5 : 4} />
          </g>
        ))}
        <text x={px} y={H - 4}>{fmtFecha(puntos[0].fecha).slice(0, 5)}</text>
        {puntos.length > 1 && <text x={W - 6} y={H - 4} textAnchor="end">{fmtFecha(puntos[puntos.length - 1].fecha).slice(0, 5)}</text>}
      </svg>
      <div className="small center" role="status"><b>{fmtFecha(s.fecha)}</b> · {numES(s.valor)} {unidad}{s.reps != null ? ` × ${s.reps} reps` : ''}</div>
      <div className="xsmall muted center">{ayuda}</div>
    </div>
  )
}

// ------------------------------------------------------------------ peso corporal
/** Peso corporal: se carga cuando uno quiere (no es obligatorio) y se ve su evolución. */
function PesoCorporalCard() {
  const { avisar } = useDialogos()
  const filas = useLiveQuery(() => db.pesoCorporal.orderBy('fecha').toArray(), [])
  const [hoja, setHoja] = useState<'cargar' | 'lista' | null>(null)
  if (!filas) return null
  const ult = filas[filas.length - 1]
  const pts: Punto[] = filas.map((f) => ({ fecha: f.fecha, valor: enUnidad(f.peso_g), reps: null }))
  return (
    <>
      <h2>Peso corporal</h2>
      <div className="card" data-seccion="peso-corporal">
        {!filas.length && <div className="muted small">Registrá tu peso cuando quieras y acá vas a ver cómo evoluciona. No es obligatorio.</div>}
        {filas.length === 1 && <div className="small"><b>{fmtPeso(ult.peso_g)}</b> <span className="muted">el {fmtFecha(ult.fecha)}</span></div>}
        {filas.length > 1 && <GraficoPesos key={filas.length} puntos={pts} ayuda="Tocá un punto para ver ese registro" />}
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary sm grow" onClick={() => setHoja('cargar')}>Registrar peso</button>
          {filas.length > 0 && <button className="btn sm grow" onClick={() => setHoja('lista')}>Ver registros</button>}
        </div>
      </div>
      {hoja === 'cargar' && <CargarPeso ultimo={ult?.peso_g ?? null} onCerrar={() => setHoja(null)} onListo={() => { setHoja(null); avisar('Peso registrado.') }} />}
      {hoja === 'lista' && (
        <Sheet titulo="Registros de peso" onCerrar={() => setHoja(null)}>
          {!filas.length && <div className="empty">No hay registros.</div>}
          <div className="list">
            {[...filas].reverse().map((f) => (
              <div key={f.id} className="item">
                <b className="small mono" style={{ minWidth: 92 }}>{fmtFecha(f.fecha)}</b>
                <span className="grow small">{fmtPeso(f.peso_g)}</span>
                <button className="mini" aria-label={`Borrar el registro del ${fmtFecha(f.fecha)}`} onClick={() => void db.pesoCorporal.delete(f.id!)}>✕</button>
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </>
  )
}

function CargarPeso({ ultimo, onCerrar, onListo }: { ultimo: number | null; onCerrar: () => void; onListo: () => void }) {
  const [fecha, setFecha] = useState(hoyISO())
  const [txt, setTxt] = useState('')
  const g = pesoDesdeTexto(txt, null)
  const guardar = async () => {
    if (!g || !fecha) return
    const previo = await db.pesoCorporal.where('fecha').equals(fecha).first()   // uno por día: si ya hay, se reemplaza
    if (previo) await db.pesoCorporal.update(previo.id!, { peso_g: g })
    else await db.pesoCorporal.add({ fecha, peso_g: g })
    onListo()
  }
  return (
    <Sheet titulo="Registrar peso" onCerrar={onCerrar}>
      <label className="f" style={{ marginTop: 0 }} htmlFor="pcf">Fecha</label>
      <input id="pcf" type="date" value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} />
      <label className="f" htmlFor="pcp">Peso ({unidadPeso()})</label>
      <input id="pcp" inputMode="decimal" value={txt} placeholder={pesoTxt(ultimo) || '—'} onChange={(e) => setTxt(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void guardar() }} />
      <div className="xsmall muted" style={{ marginTop: 6 }}>Si ya hay un registro ese día, se reemplaza.</div>
      <button className="btn primary block" style={{ marginTop: 12 }} disabled={!g || !fecha} onClick={() => void guardar()}>Guardar</button>
    </Sheet>
  )
}

// ------------------------------------------------------------------ medidas del cuerpo
/** Perímetros que se pueden registrar, con cómo medir cada uno. */
const MEDIDAS: { k: string; t: string; como: string }[] = [
  { k: 'cuello', t: 'Cuello', como: 'Justo debajo de la nuez.' },
  { k: 'hombros', t: 'Hombros', como: 'La vuelta más ancha, por encima de los hombros, con los brazos relajados.' },
  { k: 'pecho', t: 'Pecho', como: 'A la altura de los pezones, después de soltar el aire.' },
  { k: 'cintura', t: 'Cintura', como: 'A la altura del ombligo, relajado, después de soltar el aire.' },
  { k: 'cadera', t: 'Cadera', como: 'En la parte más ancha de los glúteos, con los pies juntos.' },
  { k: 'brazo', t: 'Brazo', como: 'En la parte más gruesa, con el brazo relajado y colgando.' },
  { k: 'muslo', t: 'Muslo', como: 'En la parte más gruesa, de pie, con el peso repartido en las dos piernas.' },
  { k: 'pantorrilla', t: 'Pantorrilla', como: 'En la parte más gruesa, de pie.' },
]
const cm = (mm: number): string => `${numES(mm / 10)} cm`
const aMm = (v: string): number | null => {
  const n = Number(v.replace(',', '.').trim())
  return v.trim() === '' || !Number.isFinite(n) || n <= 0 || n > 300 ? null : Math.round(n * 10)
}

/** Medidas del cuerpo: se cargan cuando uno quiere, cada una optativa, y se ve cómo cambian. */
function MedidasCard() {
  const { avisar } = useDialogos()
  const filas = useLiveQuery(() => db.medidas.orderBy('fecha').toArray(), [])
  const [hoja, setHoja] = useState<'cargar' | 'lista' | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)
  if (!filas) return null
  const conDatos = MEDIDAS.map((m) => ({ ...m, pts: filas.filter((f) => f.mm[m.k] != null).map((f) => ({ fecha: f.fecha, valor: f.mm[m.k] / 10, reps: null })) }))
    .filter((m) => m.pts.length)
  return (
    <>
      <h2>Medidas del cuerpo</h2>
      <div className="card" data-seccion="medidas" style={conDatos.length ? { padding: 0 } : undefined}>
        {!filas.length && <div className="muted small">Registrá tus medidas (cintura, brazo, pecho…) cuando quieras y acá vas a ver cómo cambian. Ninguna es obligatoria.</div>}
        {conDatos.map((m) => {
          const pri = m.pts[0].valor, ult = m.pts[m.pts.length - 1].valor, d = Math.round((ult - pri) * 10) / 10
          return (
            <div key={m.k}>
              <button className="pm" onClick={() => setAbierta(abierta === m.k ? null : m.k)} aria-expanded={abierta === m.k} disabled={m.pts.length < 2}>
                {m.pts.length > 1 ? <Chevron abierto={abierta === m.k} /> : <span />}
                <span><b className="small" style={{ display: 'block' }}>{m.t}</b><span className="xsmall muted">{plural(m.pts.length, 'registro', 'registros')}</span></span>
                <span className="mono small" style={{ textAlign: 'right' }}><b>{numES(ult)}</b> cm</span>
                <span className="mono small bold muted" style={{ textAlign: 'right' }}>{m.pts.length > 1 ? (d === 0 ? 'igual' : `${d > 0 ? '+' : '−'}${numES(Math.abs(d))}`) : ''}</span>
              </button>
              {abierta === m.k && <div className="pm-d"><GraficoPesos key={m.pts.length} puntos={m.pts} unidad="cm" ayuda="Tocá un punto para ver ese registro" /></div>}
            </div>
          )
        })}
        <div className="row" style={conDatos.length ? { padding: 12 } : { marginTop: 10 }}>
          <button className="btn primary sm grow" onClick={() => setHoja('cargar')}>Registrar medidas</button>
          {filas.length > 0 && <button className="btn sm grow" onClick={() => setHoja('lista')}>Ver registros</button>}
        </div>
      </div>
      {filas.length > 0 && <div className="xsmall muted" style={{ marginTop: 6 }}>La variación compara el primer y el último registro de cada medida.</div>}
      {hoja === 'cargar' && <CargarMedidas filas={filas} onCerrar={() => setHoja(null)} onListo={() => { setHoja(null); avisar('Medidas registradas.') }} />}
      {hoja === 'lista' && (
        <Sheet titulo="Registros de medidas" onCerrar={() => setHoja(null)}>
          {!filas.length && <div className="empty">No hay registros.</div>}
          <div className="list">
            {[...filas].reverse().map((f) => (
              <div key={f.id} className="item" style={{ alignItems: 'flex-start' }}>
                <b className="small mono" style={{ minWidth: 92 }}>{fmtFecha(f.fecha)}</b>
                <span className="grow xsmall">{MEDIDAS.filter((m) => f.mm[m.k] != null).map((m) => `${m.t} ${cm(f.mm[m.k])}`).join(' · ')}</span>
                <button className="mini" aria-label={`Borrar las medidas del ${fmtFecha(f.fecha)}`} onClick={() => void db.medidas.delete(f.id!)}>✕</button>
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </>
  )
}

function CargarMedidas({ filas, onCerrar, onListo }: { filas: Medidas[]; onCerrar: () => void; onListo: () => void }) {
  // Si ya hay un registro ese día, se muestra para corregirlo; si no, los campos arrancan vacíos con el último valor de guía.
  const delDia = (f: string) => Object.fromEntries(Object.entries(filas.find((x) => x.fecha === f)?.mm ?? {}).map(([k, v]) => [k, numES(v / 10)]))
  const [fecha, setFecha] = useState(hoyISO())
  const [txt, setTxt] = useState<Record<string, string>>(() => delDia(hoyISO()))
  const [ayuda, setAyuda] = useState(false)
  const ultimo = (k: string) => [...filas].reverse().find((f) => f.mm[k] != null)?.mm[k]
  const mm = Object.fromEntries(MEDIDAS.map((m) => [m.k, aMm(txt[m.k] ?? '')]).filter(([, v]) => v != null)) as Record<string, number>
  const guardar = async () => {
    if (!Object.keys(mm).length || !fecha) return
    const previo = await db.medidas.where('fecha').equals(fecha).first()   // una por día: si ya hay, se reemplaza
    if (previo) await db.medidas.update(previo.id!, { mm })
    else await db.medidas.add({ fecha, mm })
    onListo()
  }
  return (
    <Sheet titulo="Registrar medidas" onCerrar={onCerrar}>
      <label className="f" style={{ marginTop: 0 }} htmlFor="mdf">Fecha</label>
      <input id="mdf" type="date" value={fecha} max={hoyISO()} onChange={(e) => { setFecha(e.target.value); setTxt(delDia(e.target.value)) }} />
      <button className="card tight" style={{ marginTop: 10 }} onClick={() => setAyuda((a) => !a)} aria-expanded={ayuda}>
        <div className="row"><Chevron abierto={ayuda} /><b className="small">¿Cómo medir?</b></div>
        {ayuda && (
          <div className="xsmall muted" style={{ marginTop: 6 }}>
            Con una cinta métrica flexible, apoyada sin apretar la piel. Medí siempre en el mismo momento (mejor a la mañana,
            antes de comer y de entrenar) y del mismo lado del cuerpo: así los números se pueden comparar. Debajo de cada
            medida dice dónde va la cinta.
          </div>
        )}
      </button>
      {MEDIDAS.map((m) => (
        <div key={m.k} className="medida">
          <label htmlFor={`md-${m.k}`}><b className="small">{m.t}</b><span className="xsmall muted">{m.como}</span></label>
          <input id={`md-${m.k}`} inputMode="decimal" value={txt[m.k] ?? ''} placeholder={ultimo(m.k) != null ? numES(ultimo(m.k)! / 10) : 'cm'}
            onChange={(e) => setTxt({ ...txt, [m.k]: e.target.value })} aria-label={`${m.t} en cm`} />
        </div>
      ))}
      <div className="xsmall muted" style={{ marginTop: 6 }}>En centímetros. Cargá solo las que quieras; si ya hay un registro ese día, se reemplaza.</div>
      <button className="btn primary block" style={{ marginTop: 12 }} disabled={!Object.keys(mm).length || !fecha} onClick={() => void guardar()}>Guardar</button>
    </Sheet>
  )
}

const PERIODOS = [{ v: 30, t: '1 mes' }, { v: 90, t: '3 meses' }, { v: 0, t: 'Todo' }]

export function ProgressScreen({ settings }: { settings: Settings }) {
  const sesiones = useLiveQuery(() => db.sessions.toArray(), [])
  const actividades = useLiveQuery(() => db.activities.toArray(), [])
  const sets = useLiveQuery(() => db.setLogs.toArray(), [])
  const ejercicios = useLiveQuery(() => db.exercises.toArray(), [])
  const [periodo, setPeriodo] = useState(90)
  const [abierto, setAbierto] = useState<number | null>(null)
  const [elegir, setElegir] = useState(false)

  const base = useMemo(() => {
    if (!sesiones || !actividades || !sets || !ejercicios) return null
    const hoy = hoyISO(), lunes = lunesDe(hoy)
    const porDia = agruparPorDia(sesiones, actividades)
    const semanas = Array.from({ length: 8 }, (_, i) => {
      const ini = sumarDias(lunes, -7 * (7 - i))
      let gym = 0, act = 0; const w: number[] = []
      for (let d = 0; d < 7; d++) {
        const r = porDia.get(sumarDias(ini, d))
        gym += r?.gym.length ?? 0; act += r?.act.length ?? 0
        for (const s of r?.gym ?? []) if (s.wellness_prom != null) w.push(s.wellness_prom)
      }
      return { ini, gym, act, well: w.length ? w.reduce((a, b) => a + b, 0) / w.length : null }
    })
    const desde8 = semanas[0].ini
    const tipos = new Map<string, number>()
    for (const a of actividades) if (a.fecha >= desde8) tipos.set(a.tipo, (tipos.get(a.tipo) ?? 0) + 1)

    const fechaDe = new Map(sesiones.filter((s) => s.estado === 'completada').map((s) => [s.id!, s.fecha]))
    const mapaEx = new Map(ejercicios.map((e) => [e.id!, e]))

    // mejor serie de cada ejercicio en cada sesión (peso; sin peso, reps; sin reps, tiempo)
    const porEj = new Map<number, { fecha: string; set: SetLog }[]>()
    for (const s of sets) {
      const f = fechaDe.get(s.session_id)
      if (!s.hecha || !f || s.tipo === 'calentamiento') continue
      let a = porEj.get(s.exercise_id); if (!a) { a = []; porEj.set(s.exercise_id, a) }
      a.push({ fecha: f, set: s })
    }
    const series = new Map<number, { medida: Medida; puntos: Punto[] }>()
    for (const [id, a] of porEj) { const p = progresoDe(a); if (p.puntos.length) series.set(id, p) }
    const PRINCIPALES = ['sentadilla', 'bisagra', 'zancada', 'empuje_horizontal', 'empuje_vertical', 'traccion_horizontal', 'traccion_vertical']
    const frecuentes = [...series.entries()].filter(([id, a]) => { const e = mapaEx.get(id); return a.puntos.length >= 2 && !!e && e.vol && !e.archivo && PRINCIPALES.includes(e.patron) && e.grupo !== 'core' })
      .sort((a, b) => b[1].puntos.length - a[1].puntos.length).slice(0, 6).map(([id]) => id)

    // series por grupo
    const desde7 = sumarDias(hoy, -6), desde35 = sumarDias(hoy, -34)
    const v7 = new Map<string, number>(), vp = new Map<string, number>()
    for (const s of sets) {
      if (!s.hecha || s.tipo === 'calentamiento') continue
      const ex = mapaEx.get(s.exercise_id), f = fechaDe.get(s.session_id)
      if (!ex || !ex.vol || !f || f < desde35) continue
      const d = f >= desde7 ? v7 : vp
      d.set(ex.grupo, (d.get(ex.grupo) ?? 0) + 1)
      for (const g of ex.sec) d.set(g.grupo, (d.get(g.grupo) ?? 0) + g.factor)
    }
    const grupos = [...new Set([...v7.keys(), ...vp.keys()])].map((g) => ({ g, actual: v7.get(g) ?? 0, prev: (vp.get(g) ?? 0) / 4 }))
      .sort((a, b) => Math.max(b.actual, b.prev) - Math.max(a.actual, a.prev))

    // wellness por componente: últimos 7 días vs 4 semanas previas
    const conW = sesiones.filter((s) => s.estado === 'completada' && s.wellness)
    const prom = (arr: typeof conW, k: keyof NonNullable<typeof conW[number]['wellness']>) => (arr.length ? arr.reduce((n, s) => n + s.wellness![k], 0) / arr.length : null)
    const rec = conW.filter((s) => s.fecha >= desde7), ant = conW.filter((s) => s.fecha < desde7 && s.fecha >= desde35)
    const comp = PREGUNTAS.map((p) => ({ t: p.corto, rec: prom(rec, p.k), ant: prom(ant, p.k) }))
    const completadas = sesiones.filter((s) => s.estado === 'completada')
    return { semanas, tipos: [...tipos.entries()].sort((a, b) => b[1] - a[1]), series, frecuentes, mapaEx, grupos, comp, nRec: rec.length,
      total: completadas.length, importadas: completadas.filter((s) => s.origen === 'importado').length, nAct: actividades.length }
  }, [sesiones, actividades, sets, ejercicios])

  if (!base) return <><TopBar titulo="Progreso" /><div className="main"><div className="empty">Calculando…</div></div></>

  const seguidos = (settings.seguimiento ?? base.frecuentes).filter((id) => base.mapaEx.has(id))
  const desde = periodo ? sumarDias(hoyISO(), -periodo) : ''
  const filas = seguidos.map((id) => {
    const serie = base.series.get(id)
    const medida: Medida = serie?.medida ?? 'kg'
    const pts = (serie?.puntos ?? []).filter((p) => p.fecha >= desde)
    const ex = base.mapaEx.get(id)!
    const pri = pts[0], ult = pts[pts.length - 1]
    const d = pts.length > 1 ? ult.valor - pri.valor : null
    const cambia = d != null && Math.abs(d) >= 0.01
    // A igual peso, el progreso está en las reps hechas con esa carga.
    const dReps = medida === 'kg' && d != null && !cambia && pri.reps != null && ult.reps != null ? ult.reps - pri.reps : 0
    const signo = (n: number) => (n > 0 ? '+' : '−')
    const u = medida === 'kg' ? unidadPeso() : medida === 'reps' ? 'reps' : 's'
    return {
      id, ex, medida, pts, pri, ult,
      sube: cambia ? d! : dReps,
      delta: d == null ? '' : cambia ? `${signo(d)}${numES(Math.abs(d))} ${u}` : dReps ? `${signo(dReps)}${Math.abs(dReps)} reps` : 'igual',
      pct: cambia && pri.valor ? `${signo(d!)}${Math.abs(Math.round((d! / pri.valor) * 100))}%` : null,
    }
  })
  const alternar = (id: number) => void setSettings({ seguimiento: seguidos.includes(id) ? seguidos.filter((x) => x !== id) : [...seguidos, id] })
  const maxSem = Math.max(settings.objetivo_semanal, ...base.semanas.map((s) => s.gym + s.act), 1)
  const maxVol = Math.max(1, ...base.grupos.map((g) => Math.max(g.actual, g.prev)))
  const hayWell = base.semanas.some((s) => s.well != null)

  return (
    <>
      <TopBar titulo="Progreso" sub={`${plural(base.total, 'sesión de gym', 'sesiones de gym')} · ${plural(base.nAct, 'otra actividad', 'otras actividades')}`} />
      <div className="main">
        <h2>Constancia · últimas 8 semanas</h2>
        <div className="card">
          <div className="cols">
            {base.semanas.map((s) => (
              <div key={s.ini} className="c">
                <span>{s.gym + s.act || ''}</span>
                {s.act > 0 && <i className="a" style={{ height: `${(s.act / maxSem) * 78}%` }} />}
                <i style={{ height: `${(s.gym / maxSem) * 78}%`, opacity: s.gym ? 1 : .25 }} />
                <span>{s.ini.slice(8)}/{s.ini.slice(5, 7)}</span>
              </div>
            ))}
          </div>
          <div className="leyenda"><span><i style={{ background: 'var(--pri)' }} />Gimnasio</span><span><i style={{ background: 'var(--act)' }} />Otras actividades</span></div>
          <div className="xsmall muted" style={{ marginTop: 6 }}>Cada columna es una semana (lunes a domingo). Objetivo: {settings.objetivo_semanal} de gym.</div>
          {base.tipos.length > 0 && <div className="small" style={{ marginTop: 8 }}>{base.tipos.map(([t, n]) => `${t} ${n}`).join(' · ')}</div>}
        </div>

        <PesoCorporalCard />
        <MedidasCard />

        <div className="row spread" style={{ margin: '20px 2px 8px' }}>
          <h2 style={{ margin: 0 }}>Progreso por ejercicio</h2>
          <button className="btn sm" onClick={() => setElegir(true)}>Elegir ejercicios</button>
        </div>
        <div style={{ marginBottom: 8 }}><Chips sm opciones={PERIODOS} valor={periodo} onPick={setPeriodo} /></div>
        <div className="list">
          {!filas.length && <div className="empty">Elegí qué ejercicios querés seguir.</div>}
          {filas.map((f) => (
            <div key={f.id}>
              <button className="pm" onClick={() => setAbierto(abierto === f.id ? null : f.id)} aria-expanded={abierto === f.id}>
                <Chevron abierto={abierto === f.id} />
                <span><b className="small" style={{ display: 'block' }}>{f.ex.nombre}</b>
                  <span className="xsmall muted">{f.pts.length ? `${plural(f.pts.length, 'sesión', 'sesiones')}${f.medida === 'kg' ? ' con peso' : f.medida === 'reps' ? ' · en reps, sin peso' : ' · por tiempo'}` : 'Sin registros en el período'}</span></span>
                <span className="mono small" style={{ textAlign: 'right' }}>
                  {f.pts.length ? <>{f.pts.length > 1 && <span className="muted">{numES(f.pri.valor)} → </span>}<b>{numES(f.ult.valor)}</b>{f.medida === 'seg' ? ' s' : ''}</> : '—'}
                  {f.medida === 'kg' && f.pts.length > 0 && f.ult.reps != null && (
                    <span className="xsmall muted" style={{ display: 'block' }}>{f.pts.length > 1 && f.pri.reps != null ? `${f.pri.reps} → ` : '× '}{f.ult.reps} reps</span>
                  )}
                </span>
                <span className={`mono small bold ${f.sube === 0 ? 'muted' : f.sube > 0 ? 'up' : 'down'}`} style={{ textAlign: 'right' }}>
                  {f.delta}
                  {f.pct && <span className="xsmall" style={{ display: 'block', fontWeight: 600 }}>{f.pct}</span>}
                </span>
              </button>
              {abierto === f.id && f.pts.length > 0 && <div className="pm-d"><GraficoPesos puntos={f.pts} unidad={unidadDe(f.medida, f.ex.lastre, f.ex.dos_pesas)} /></div>}
            </div>
          ))}
        </div>
        <div className="xsmall muted" style={{ marginTop: 6 }}>La mejor serie de cada sesión, sin calentamientos: el peso más alto y las reps hechas con ese peso. En ejercicios sin peso, las reps (o el tiempo) más altas. La variación compara la primera y la última sesión del período; a igual peso, compara las reps. Tocá un ejercicio para ver el gráfico.</div>

        <h2>Wellness por semana</h2>
        <div className="card">
          {!hayWell ? <div className="muted small">Aparece cuando respondas las preguntas antes de entrenar.</div> : (
            <>
              <div className="cols" style={{ height: 90 }}>
                {base.semanas.map((s) => (
                  <div key={s.ini} className="c">
                    <span>{s.well != null ? numES(Math.round(s.well * 10) / 10) : ''}</span>
                    <i style={{ height: `${s.well != null ? (s.well / 5) * 70 : 0}%`, minHeight: s.well != null ? 2 : 0, background: s.well != null && s.well < 3 ? 'var(--bad)' : 'var(--pri)' }} />
                    <span>{s.ini.slice(8)}/{s.ini.slice(5, 7)}</span>
                  </div>
                ))}
              </div>
              <div className="xsmall muted" style={{ margin: '6px 0 4px' }}>Promedio de 1 a 5 de las sesiones de cada semana. Más alto es mejor.</div>
              {base.comp.some((c) => c.rec != null || c.ant != null) && (
                <table className="t" style={{ marginTop: 8 }}>
                  <thead><tr><th>Componente</th><th>Últimos 7 días</th><th>4 sem. previas</th></tr></thead>
                  <tbody>
                    {base.comp.map((c) => (
                      <tr key={c.t}><td>{c.t}</td>
                        <td className={c.rec != null && c.ant != null && c.rec < c.ant - 0.4 ? 'down bold' : ''}>{c.rec != null ? numES(Math.round(c.rec * 10) / 10) : '—'}</td>
                        <td className="muted">{c.ant != null ? numES(Math.round(c.ant * 10) / 10) : '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>

        <h2>Series por grupo muscular · 7 días</h2>
        {(
          <div className="card">
            {!base.grupos.length && <div className="muted small">Sin series en las últimas cinco semanas.</div>}
            {base.grupos.slice(0, 12).map((g) => (
              <div key={g.g} className="hbar">
                <span className="truncate">{etiqueta(g.g)}</span>
                <div>
                  <div className="bar"><i style={{ width: `${(g.actual / maxVol) * 100}%` }} /></div>
                  <div className="bar" style={{ height: 4, marginTop: 3 }}><i style={{ width: `${(g.prev / maxVol) * 100}%`, background: 'var(--muted)', opacity: .5 }} /></div>
                </div>
                <b className="mono" style={{ textAlign: 'right' }}>{Math.round(g.actual)}</b>
              </div>
            ))}
            <div className="xsmall muted" style={{ marginTop: 6 }}>Barra fina: promedio semanal de las cuatro semanas anteriores. Es una aproximación: los músculos secundarios suman una fracción de serie estimada. No cuenta movilidad ni calentamientos.</div>
          </div>
        )}
        {base.importadas > 0 && <div className="xsmall muted" style={{ marginTop: 10 }}>{base.importadas} de las {base.total} sesiones vienen del historial importado: sus pesos se leyeron de capturas y pueden tener errores.</div>}
      </div>

      {elegir && (
        <Sheet titulo="Ejercicios a seguir" onCerrar={() => setElegir(false)} full accion={<button className="btn primary sm" onClick={() => setElegir(false)}>Listo · {seguidos.length}</button>}>
          <Catalogo pegajoso onElegir={(e) => alternar(e.id!)}
            marca={(e) => (seguidos.includes(e.id!) ? <span className="pill pri">✓ siguiendo</span> : base.series.has(e.id!) ? <span className="pill">{base.series.get(e.id!)!.puntos.length} ses.</span> : null)} />
        </Sheet>
      )}
    </>
  )
}
