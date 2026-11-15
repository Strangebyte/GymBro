import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { borrarTodo, db, estadoPersistencia, importarTodo, pedirPersistencia, setSettings, type Settings } from '../db'
import { Stepper, TopBar, useDialogos } from '../ui'
import { fmtFecha, hacerCopia, isoDe } from '../lib'

// ------------------------------------------------------------------ ajustes
export function SettingsScreen({ settings }: { settings: Settings }) {
  const { confirmar, avisar } = useDialogos()
  const [pers, setPers] = useState<{ persistido: boolean; usoMB: number | null }>({ persistido: false, usoMB: null })
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const nSes = useLiveQuery(() => db.sessions.count(), [])
  const nSets = useLiveQuery(() => db.setLogs.count(), [])
  const nEj = useLiveQuery(() => db.exercises.count(), [])
  const refrescar = () => void estadoPersistencia().then(setPers)
  useEffect(refrescar, [])
  const enClaude = typeof window !== 'undefined' && window.self !== window.top

  const exportar = async () => {
    const r = await hacerCopia()
    setMsg(r === 'ok' ? { ok: true, t: 'Copia generada. Guardala en Drive o donde la tengas a salvo.' }
      : r === 'cancelado' ? { ok: false, t: 'Exportación cancelada.' } : { ok: false, t: 'No se pudo generar el archivo en este entorno.' })
  }
  const restaurar = async (f: File) => {
    const texto = await f.text()
    if (!(await confirmar({ titulo: '¿Restaurar esta copia?', texto: 'Reemplaza todos los datos actuales de la app por los del archivo.', ok: 'Restaurar', peligro: true }))) return
    try {
      const r = await importarTodo(texto)
      setMsg({ ok: true, t: `Copia restaurada: ${r.sesiones} sesiones y ${r.series} series.` })
    } catch (e) { setMsg({ ok: false, t: e instanceof Error ? e.message : 'No se pudo restaurar.' }) }
  }
  return (
    <>
      <TopBar titulo="Ajustes" atras />
      <div className="main sin-tabs">
        {msg && <div className={`banner ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.t}</div>}
        {enClaude && <div className="banner">Estás usando la app dentro de Claude. Acá los datos se guardan en este navegador y no hay garantía de que duren: exportá una copia después de cada sesión hasta instalarla en tu propio hosting.</div>}

        <h2>Apariencia</h2>
        <div className="card row">
          <span className="grow small bold">Tema</span>
          <button className={`chip${settings.tema === 'claro' ? ' on' : ''}`} aria-pressed={settings.tema === 'claro'} onClick={() => void setSettings({ tema: 'claro' })}>Claro</button>
          <button className={`chip${settings.tema === 'oscuro' ? ' on' : ''}`} aria-pressed={settings.tema === 'oscuro'} onClick={() => void setSettings({ tema: 'oscuro' })}>Oscuro</button>
        </div>

        <div className="card row">
          <span className="grow small bold">Color</span>
          {([['verde', 'Verde', '#0c8a72'], ['azul', 'Azul', '#2563c9'], ['violeta', 'Violeta', '#6d4bd1']] as const).map(([v, t, c]) => (
            <button key={v} className={`chip${settings.paleta === v ? ' on' : ''}`} aria-pressed={settings.paleta === v} onClick={() => void setSettings({ paleta: v })}>
              <i aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: c, marginRight: 6, border: '1px solid rgba(255,255,255,.7)' }} />{t}
            </button>
          ))}
        </div>

        <h2>Entrenamiento</h2>
        <div className="card col">
          <div className="row spread"><span className="small bold">Objetivo semanal de gym</span><div style={{ width: 170 }}><Stepper value={settings.objetivo_semanal} step={1} min={1} max={14} unit="sesiones" onChange={(v) => void setSettings({ objetivo_semanal: v ?? 4 })} /></div></div>
          <div className="row spread"><span className="small bold">Descanso por defecto</span><div style={{ width: 170 }}><Stepper value={settings.descanso_s} step={15} unit="segundos" onChange={(v) => void setSettings({ descanso_s: v ?? 120 })} /></div></div>
          <div>
            <div className="small bold">Tilde de «hecho» durante la sesión</div>
            <div className="row" style={{ marginTop: 6 }}>
              <button className={`chip grow${settings.tilde === 'bloque' ? ' on' : ''}`} aria-pressed={settings.tilde === 'bloque'} onClick={() => void setSettings({ tilde: 'bloque' })}>Por bloque</button>
              <button className={`chip grow${settings.tilde === 'ejercicio' ? ' on' : ''}`} aria-pressed={settings.tilde === 'ejercicio'} onClick={() => void setSettings({ tilde: 'ejercicio' })}>Por ejercicio</button>
            </div>
            <div className="xsmall muted" style={{ marginTop: 6 }}>Por ejercicio, al tildar arranca el cronómetro de descanso. Por bloque no hay cronómetro.</div>
          </div>
          <div className="row spread"><span className="small bold">Vibrar al terminar el descanso</span>
            <button className={`chip${settings.vibrar ? ' on' : ''}`} aria-pressed={settings.vibrar} onClick={() => void setSettings({ vibrar: !settings.vibrar })}>{settings.vibrar ? 'Sí' : 'No'}</button></div>
          <div className="row spread"><span className="small bold">Sonar al terminar el descanso</span>
            <button className={`chip${settings.sonido ? ' on' : ''}`} aria-pressed={settings.sonido} onClick={() => void setSettings({ sonido: !settings.sonido })}>{settings.sonido ? 'Sí' : 'No'}</button></div>
          <div className="xsmall muted">El sonido usa el volumen de multimedia. Con el teléfono en silencio no vibra, pero puede sonar.</div>
        </div>

        <h2>Tipos de actividad</h2>
        <div className="card">
          <div className="chips wrap">
            {settings.tipos_actividad.map((t) => (
              <button key={t} className="chip sm" aria-label={`Quitar ${t}`} onClick={() => void setSettings({ tipos_actividad: settings.tipos_actividad.filter((x) => x !== t) })}>{t} ✕</button>
            ))}
          </div>
          <div className="xsmall muted" style={{ marginTop: 8 }}>Tocá uno para quitarlo de la lista. Los nuevos se agregan al registrar una actividad.</div>
        </div>

        <h2>Copia de seguridad</h2>
        <div className="card">
          <div className="small muted" style={{ marginBottom: 10 }}>Todo vive en este dispositivo. La copia incluye ejercicios, planes, sesiones y actividades.</div>
          <div className="kv" style={{ marginBottom: 10 }}><span className="muted">Última copia</span><b>{settings.ultima_copia ? fmtFecha(isoDe(new Date(settings.ultima_copia))) : 'todavía ninguna'}</b></div>
          <button className="btn primary block" onClick={() => void exportar()}>Exportar copia</button>
          <button className="btn block" style={{ marginTop: 8 }} onClick={() => file.current?.click()}>Restaurar desde una copia</button>
          <input ref={file} type="file" accept=".json,application/json" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void restaurar(f); e.target.value = '' }} />
        </div>

        <h2>Datos</h2>
        <div className="card">
          <div className="kv"><span className="muted">Ejercicios</span><b>{nEj ?? '—'}</b></div>
          <div className="kv"><span className="muted">Sesiones</span><b>{nSes ?? '—'}</b></div>
          <div className="kv"><span className="muted">Series</span><b>{nSets ?? '—'}</b></div>
          <div className="kv"><span className="muted">Almacenamiento protegido</span><b style={{ color: pers.persistido ? 'var(--ok)' : 'var(--warn-text)' }}>{pers.persistido ? 'sí' : 'no'}</b></div>
          {!pers.persistido && !enClaude && <button className="btn block sm" style={{ marginTop: 8 }} onClick={async () => { await pedirPersistencia(); refrescar() }}>Pedir almacenamiento protegido</button>}
          <button className="btn block sm danger" style={{ marginTop: 10 }} onClick={async () => {
            if (await confirmar({ titulo: '¿Borrar todos los datos?', texto: 'Se borran planes, sesiones y actividades. El catálogo de ejercicios queda. Exportá una copia antes si la querés.', ok: 'Borrar todo', peligro: true })) {
              await borrarTodo(true); avisar('Datos borrados.')
            }
          }}>Empezar de cero</button>
        </div>
        <div className="xsmall muted center" style={{ marginTop: 14 }}>GymBro 1.0</div>
      </div>
    </>
  )
}
