import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type PlanDay, type Settings, type Wellness } from '../db'
import { Sheet, TopBar, useNav } from '../ui'
import { agruparPorDia, plural, duracionSesion, fmtDur, fmtFechaLarga, hoyISO, lunesDe, sumarDias } from '../lib'
import { iniciarSesion, sesionEnCurso } from '../actions'

const cuenta = (d: PlanDay) => ({
  ej: d.bloques.reduce((n, b) => n + b.ejercicios.length, 0),
  series: d.bloques.reduce((n, b) => n + b.ejercicios.reduce((m, e) => m + e.series.length, 0), 0),
})

export function TodayScreen({ settings }: { settings: Settings }) {
  const nav = useNav()
  const sesiones = useLiveQuery(() => db.sessions.toArray(), [])
  const actividades = useLiveQuery(() => db.activities.toArray(), [])
  const planes = useLiveQuery(() => db.plans.toArray(), [])
  const dias = useLiveQuery(() => db.planDays.toArray(), [])
  const enCurso = useLiveQuery(() => sesionEnCurso(), [])
  const [elegir, setElegir] = useState(false)

  const hoy = hoyISO()
  const lunes = lunesDe(hoy)
  const porDia = useMemo(() => agruparPorDia(sesiones ?? [], actividades ?? []), [sesiones, actividades])
  const semana = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i))
  const gymSemana = semana.reduce((n, f) => n + (porDia.get(f)?.gym.length ?? 0), 0)
  const actSemana = semana.reduce((n, f) => n + (porDia.get(f)?.act.length ?? 0), 0)
  const minSemana = semana.reduce((n, f) => n + (porDia.get(f)?.gym.reduce((m, s) => m + (duracionSesion(s) ?? 0), 0) ?? 0)
    + (porDia.get(f)?.act.reduce((m, a) => m + (a.dur_min ?? 0), 0) ?? 0), 0)

  const activo = (planes ?? []).find((p) => p.activo) ?? null
  const diasActivo = (dias ?? []).filter((d) => d.plan_id === activo?.id).sort((a, b) => a.orden - b.orden)
  const sugerido = diasActivo.length ? diasActivo[(activo?.cursor ?? 0) % diasActivo.length] : null
  const hechoHoy = porDia.get(hoy)

  return (
    <>
      <TopBar titulo="Hoy" sub={fmtFechaLarga(hoy)}
        der={<button className="icon-btn" onClick={() => nav.ir({ v: 'ajustes' })} aria-label="Ajustes">⚙</button>} />
      <div className="main">
        <div className="card">
          <div className="semana">
            {semana.map((f, i) => {
              const r = porDia.get(f)
              const g = !!r?.gym.length, a = !!r?.act.length
              return (
                <div key={f} className="d">
                  {'LMMJVSD'[i]}
                  <div className={`c${g && a ? ' ambos' : g ? ' gym' : a ? ' act' : ''}${f === hoy ? ' hoy' : ''}`}>{g || a ? '✓' : ''}</div>
                </div>
              )
            })}
          </div>
          <div className="row spread small" style={{ margin: '14px 0 6px' }}>
            <span className="muted">Gimnasio esta semana</span>
            <b>{gymSemana} de {settings.objetivo_semanal}</b>
          </div>
          <div className="bar"><i style={{ width: `${Math.min(100, (gymSemana / Math.max(1, settings.objetivo_semanal)) * 100)}%` }} /></div>
          {(actSemana > 0 || minSemana > 0) && (
            <div className="xsmall muted" style={{ marginTop: 8 }}>
              {actSemana > 0 && `${actSemana} ${actSemana === 1 ? 'actividad' : 'actividades'} fuera del gym · `}{minSemana} min en total
            </div>
          )}
        </div>

        <h2>Entrenamiento</h2>
        {enCurso ? (
          <div className="card pri">
            <div className="small" style={{ color: 'var(--pri-text)' }}>Sesión en curso · {fmtDur(Date.now() - enCurso.inicio)}</div>
            <h3 style={{ margin: '4px 0 12px' }}>{enCurso.nombre}</h3>
            <button className="btn primary block lg" onClick={() => nav.ir({ v: 'sesion' })}>Continuar</button>
          </div>
        ) : sugerido ? (
          <div className="card">
            <div className="row spread">
              <span className="pill pri">{activo?.nombre}</span>
              <span className="xsmall muted">te toca</span>
            </div>
            <h3 style={{ margin: '8px 0 4px' }}>{sugerido.nombre}</h3>
            <div className="small muted">{sugerido.bloques.length} bloques · {cuenta(sugerido).ej} ejercicios · {cuenta(sugerido).series} series</div>
            <button className="btn primary block lg" style={{ marginTop: 14 }} onClick={() => nav.ir({ v: 'wellness', diaId: sugerido.id! })}>Empezar</button>
            <button className="btn ghost block" style={{ marginTop: 6 }} onClick={() => setElegir(true)}>Elegir otro día</button>
          </div>
        ) : (
          <div className="card">
            <div className="small muted">No hay un plan activo. Elegí un día de cualquier plan o entrená sin plan.</div>
            <button className="btn primary block lg" style={{ marginTop: 12 }} onClick={() => setElegir(true)}>Elegir qué entrenar</button>
          </div>
        )}

        <button className="btn act block" onClick={() => nav.ir({ v: 'actividad', id: null, fecha: hoy })}>+ Registrar otra actividad</button>

        {hechoHoy && (hechoHoy.gym.length > 0 || hechoHoy.act.length > 0) && (
          <>
            <h2>Hecho hoy</h2>
            <div className="list">
              {hechoHoy.gym.map((s) => (
                <button key={s.id} className="item" onClick={() => nav.ir({ v: 'sesionDetalle', id: s.id! })}>
                  <span className="pill pri">gym</span><span className="grow bold small">{s.nombre}</span>
                  <span className="xsmall muted">{duracionSesion(s) ?? '—'} min</span>
                </button>
              ))}
              {hechoHoy.act.map((a) => (
                <button key={a.id} className="item" onClick={() => nav.ir({ v: 'actividad', id: a.id!, fecha: a.fecha })}>
                  <span className="pill act">actividad</span><span className="grow bold small">{a.tipo}</span>
                  <span className="xsmall muted">{a.dur_min ? `${a.dur_min} min` : ''}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {elegir && (
        <Sheet titulo="¿Qué entrenás hoy?" onCerrar={() => setElegir(false)}>
          {(planes ?? []).sort((a, b) => Number(b.activo) - Number(a.activo)).map((p) => {
            const ds = (dias ?? []).filter((d) => d.plan_id === p.id).sort((a, b) => a.orden - b.orden)
            if (!ds.length) return null
            return (
              <div key={p.id}>
                <h2>{p.nombre}{p.activo ? ' · activo' : ''}</h2>
                <div className="list">
                  {ds.map((d) => (
                    <button key={d.id} className="item" onClick={() => { setElegir(false); nav.ir({ v: 'wellness', diaId: d.id! }) }}>
                      <div className="grow">
                        <div className="bold small">{d.nombre}</div>
                        <div className="xsmall muted">{plural(d.bloques.length, 'bloque', 'bloques')} · {plural(cuenta(d).ej, 'ejercicio', 'ejercicios')}</div>
                      </div>
                      {sugerido?.id === d.id && <span className="pill pri">te toca</span>}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
          <button className="btn block" style={{ marginTop: 14 }} onClick={() => { setElegir(false); nav.ir({ v: 'wellness', diaId: null }) }}>
            Sesión libre, sin plan
          </button>
        </Sheet>
      )}
    </>
  )
}

// ------------------------------------------------------------------ wellness
export const PREGUNTAS: { k: keyof Wellness; q: string; corto: string; r: [string, string, string, string, string] }[] = [
  { k: 'sueno', q: '¿Cómo dormiste anoche?', corto: 'Sueño', r: ['Muy bien', 'Bien', 'Normal', 'Mal', 'Muy mal'] },
  { k: 'dolor', q: '¿Cuánto dolor muscular tenés hoy?', corto: 'Dolor muscular', r: ['Nada', 'Poco', 'Normal', 'Bastante', 'Muchísimo'] },
  { k: 'cansancio', q: '¿Qué tan cansado te sentís?', corto: 'Cansancio', r: ['Nada cansado', 'Algo cansado', 'Normal', 'Cansado', 'Muy cansado'] },
  { k: 'estres', q: '¿Qué tan estresado estás?', corto: 'Estrés', r: ['Nada estresado', 'Algo estresado', 'Normal', 'Estresado', 'Muy estresado'] },
  { k: 'energia', q: '¿Cómo está tu energía?', corto: 'Energía', r: ['Muy alta', 'Alta', 'Normal', 'Baja', 'Muy baja'] },
]

export function WellnessScreen({ diaId }: { diaId: number | null }) {
  const nav = useNav()
  const [paso, setPaso] = useState(0)
  const [resp, setResp] = useState<Partial<Wellness>>({})
  const [ocupado, setOcupado] = useState(false)

  const empezar = async (w: Wellness | null) => {
    if (ocupado) return
    setOcupado(true)
    const dia = diaId != null ? (await db.planDays.get(diaId)) ?? null : null
    await iniciarSesion(dia, w)
    nav.reemplazar({ v: 'sesion' })
  }
  const responder = (v: number) => {
    const r = { ...resp, [PREGUNTAS[paso].k]: v }
    setResp(r)
    if (paso < 4) setPaso(paso + 1)
    else void empezar(r as Wellness)
  }
  const p = PREGUNTAS[paso]
  return (
    <>
      <TopBar titulo="¿Cómo llegás hoy?" atras />
      <div className="main sin-tabs">
        <div className="pasos">{PREGUNTAS.map((_, i) => <i key={i} className={i <= paso ? 'on' : ''} />)}</div>
        <div className="center muted small">{paso + 1} de 5</div>
        <h3 className="center" style={{ fontSize: 21, margin: '6px 0 16px' }}>{p.q}</h3>
        <div className="well">
          {[5, 4, 3, 2, 1].map((v, i) => (
            <button key={v} className={`o${v}`} disabled={ocupado} onClick={() => responder(v)}><b>{v}</b>{p.r[i]}</button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 16 }}>
          {paso > 0 && <button className="btn grow" onClick={() => setPaso(paso - 1)}>Anterior</button>}
          <button className="btn ghost grow" disabled={ocupado} onClick={() => void empezar(null)}>Saltear y empezar</button>
        </div>
      </div>
    </>
  )
}
