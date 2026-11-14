import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, setSettings, type Settings } from '../db'
import { Catalogo, Chips, Sheet, TopBar } from '../ui'
import { agruparPorDia, etiqueta, fmtFecha, hoyISO, lunesDe, numES, plural, sumarDias } from '../lib'
import { PREGUNTAS } from './Today'

export interface PuntoPeso { fecha: string; kg: number; reps: number | null }

/** Gráfico de línea con puntos que se pueden tocar. */
export function GraficoPesos({ puntos, unidad = 'kg' }: { puntos: PuntoPeso[]; unidad?: string }) {
  const [sel, setSel] = useState(puntos.length - 1)
  if (!puntos.length) return null
  const W = 320, H = 150, px = 34, py = 16
  const ks = puntos.map((p) => p.kg)
  let min = Math.min(...ks), max = Math.max(...ks)
  if (max - min < 1) { min -= 2.5; max += 2.5 }
  const pad = (max - min) * 0.12
  min -= pad; max += pad
  const x = (i: number) => (puntos.length === 1 ? W / 2 : px + (i / (puntos.length - 1)) * (W - px - 12))
  const y = (k: number) => py + (1 - (k - min) / (max - min)) * (H - py - 24)
  const s = puntos[Math.min(sel, puntos.length - 1)]
  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Peso máximo por sesión, de ${numES(puntos[0].kg)} a ${numES(puntos[puntos.length - 1].kg)} ${unidad}`}>
        {[0, 0.5, 1].map((t) => { const v = min + pad + t * (max - min - 2 * pad); return (
          <g key={t}><line className="eje" x1={px} x2={W - 6} y1={y(v)} y2={y(v)} /><text x={px - 5} y={y(v) + 4} textAnchor="end">{numES(Math.round(v * 2) / 2)}</text></g>
        ) })}
        <polyline className="ln" points={puntos.map((p, i) => `${x(i)},${y(p.kg)}`).join(' ')} />
        {puntos.map((p, i) => (
          <g key={i} onClick={() => setSel(i)} style={{ cursor: 'pointer' }}>
            <circle cx={x(i)} cy={y(p.kg)} r={14} fill="transparent" />
            <circle className={`pt${i === sel ? ' sel' : ''}`} cx={x(i)} cy={y(p.kg)} r={i === sel ? 5.5 : 4} />
          </g>
        ))}
        <text x={px} y={H - 4}>{fmtFecha(puntos[0].fecha).slice(0, 5)}</text>
        {puntos.length > 1 && <text x={W - 6} y={H - 4} textAnchor="end">{fmtFecha(puntos[puntos.length - 1].fecha).slice(0, 5)}</text>}
      </svg>
      <div className="small center" role="status"><b>{fmtFecha(s.fecha)}</b> · {numES(s.kg)} {unidad}{s.reps != null ? ` × ${s.reps} reps` : ''}</div>
      <div className="xsmall muted center">Tocá un punto para ver esa sesión</div>
    </div>
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
  const [verGrupos, setVerGrupos] = useState(false)

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

    // peso máximo por ejercicio y sesión
    const tope = new Map<number, Map<string, PuntoPeso>>()
    for (const s of sets) {
      const f = fechaDe.get(s.session_id)
      if (!s.hecha || !f || !s.peso_g || s.tipo === 'calentamiento') continue
      let m = tope.get(s.exercise_id); if (!m) { m = new Map(); tope.set(s.exercise_id, m) }
      const kg = s.peso_g / 1000, prev = m.get(f)
      if (!prev || kg > prev.kg || (kg === prev.kg && (s.reps ?? 0) > (prev.reps ?? 0))) m.set(f, { fecha: f, kg, reps: s.reps })
    }
    const series = new Map<number, PuntoPeso[]>()
    for (const [id, m] of tope) series.set(id, [...m.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)))
    const PRINCIPALES = ['sentadilla', 'bisagra', 'zancada', 'empuje_horizontal', 'empuje_vertical', 'traccion_horizontal', 'traccion_vertical']
    const frecuentes = [...series.entries()].filter(([id, a]) => { const e = mapaEx.get(id); return a.length >= 2 && !!e && e.vol && !e.archivo && PRINCIPALES.includes(e.patron) && e.grupo !== 'core' })
      .sort((a, b) => b[1].length - a[1].length).slice(0, 6).map(([id]) => id)

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
    const pts = (base.series.get(id) ?? []).filter((p) => p.fecha >= desde)
    const ex = base.mapaEx.get(id)!
    const d = pts.length > 1 ? pts[pts.length - 1].kg - pts[0].kg : null
    return { id, ex, pts, d, pct: d != null && pts[0].kg ? (d / pts[0].kg) * 100 : null }
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

        <div className="row spread" style={{ margin: '20px 2px 8px' }}>
          <h2 style={{ margin: 0 }}>Peso máximo por ejercicio</h2>
          <button className="btn sm" onClick={() => setElegir(true)}>Elegir ejercicios</button>
        </div>
        <div style={{ marginBottom: 8 }}><Chips sm opciones={PERIODOS} valor={periodo} onPick={setPeriodo} /></div>
        <div className="list">
          {!filas.length && <div className="empty">Elegí qué ejercicios querés seguir.</div>}
          {filas.map((f) => (
            <div key={f.id}>
              <button className="pm" onClick={() => setAbierto(abierto === f.id ? null : f.id)} aria-expanded={abierto === f.id}>
                <span><b className="small" style={{ display: 'block' }}>{f.ex.nombre}</b>
                  <span className="xsmall muted">{f.pts.length ? `${plural(f.pts.length, 'sesión', 'sesiones')} con peso` : 'Sin registros con peso en el período'}</span></span>
                <span className="mono small" style={{ textAlign: 'right' }}>{f.pts.length ? <>{f.pts.length > 1 && <span className="muted">{numES(f.pts[0].kg)} → </span>}<b>{numES(f.pts[f.pts.length - 1].kg)}</b></> : '—'}</span>
                <span className={`mono small bold ${f.d == null || Math.abs(f.d) < 0.01 ? 'muted' : f.d > 0 ? 'up' : 'down'}`} style={{ textAlign: 'right' }}>
                  {f.d == null ? '' : Math.abs(f.d) < 0.01 ? 'igual' : `${f.d > 0 ? '+' : '−'}${numES(Math.abs(f.d))} kg`}
                  {f.pct != null && Math.abs(f.d!) >= 0.01 && <span className="xsmall" style={{ display: 'block', fontWeight: 600 }}>{f.pct > 0 ? '+' : '−'}{Math.abs(Math.round(f.pct))}%</span>}
                </span>
              </button>
              {abierto === f.id && f.pts.length > 0 && <div className="pm-d"><GraficoPesos puntos={f.pts} unidad={f.ex.lastre ? 'kg de lastre' : 'kg'} /></div>}
            </div>
          ))}
        </div>
        <div className="xsmall muted" style={{ marginTop: 6 }}>El peso más alto que moviste en cada sesión, sin calentamientos. Variación entre la primera y la última sesión del período. Tocá un ejercicio para ver el gráfico.</div>

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

        <button className="row spread" style={{ width: '100%', margin: '20px 2px 8px' }} onClick={() => setVerGrupos((v) => !v)} aria-expanded={verGrupos}>
          <h2 style={{ margin: 0 }}>Series por grupo muscular · 7 días</h2><span className="muted">{verGrupos ? '▾' : '▸'}</span>
        </button>
        {verGrupos && (
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
            marca={(e) => (seguidos.includes(e.id!) ? <span className="pill pri">✓ siguiendo</span> : base.series.has(e.id!) ? <span className="pill">{base.series.get(e.id!)!.length} ses.</span> : null)} />
        </Sheet>
      )}
    </>
  )
}
