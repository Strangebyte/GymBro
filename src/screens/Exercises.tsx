import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Exercise, type Mide } from '../db'
import { Catalogo, Chips, HistorialLista, MAX_MEDIA_MB, MediaView, Stepper, TopBar, useDialogos, useNav, useTieneMedia } from '../ui'
import { numES, EQUIPOS, etiqueta, GRUPOS, historicoEjercicio, PATRONES, type SesionDeEjercicio } from '../lib'
import { crearEjercicio } from '../actions'
import { GraficoPesos, type PuntoPeso } from './Progress'

export function ExercisesScreen() {
  const nav = useNav()
  const total = useLiveQuery(() => db.exercises.count(), [])
  return (
    <>
      <TopBar titulo="Ejercicios" sub={`${total ?? '…'} en el catálogo`}
        der={<button className="btn primary sm" onClick={() => nav.ir({ v: 'ejercicioForm', id: null })}>+ Nuevo</button>} />
      <div className="main">
        <Catalogo onElegir={(e) => nav.ir({ v: 'ejercicio', id: e.id! })}
          marca={(e) => <>{e.custom && <span className="pill pri">propio</span>}{e.archivo && <span className="pill">archivado</span>}</>} />
      </div>
    </>
  )
}

export function ExerciseScreen({ id }: { id: number }) {
  const nav = useNav()
  const ex = useLiveQuery(() => db.exercises.get(id), [id])
  const [hist, setHist] = useState<SesionDeEjercicio[] | null>(null)
  useEffect(() => { let v = true; void historicoEjercicio(id, 40).then((h) => { if (v) setHist(h) }); return () => { v = false } }, [id])
  const tieneMedia = useTieneMedia(id, ex?.url)
  if (!ex) return <><TopBar titulo="Ejercicio" atras /><div className="main sin-tabs"><div className="empty">Cargando…</div></div></>

  const tope = new Map<string, PuntoPeso>()
  for (const s of hist ?? []) for (const x of s.sets) {
    if (!x.peso_g || x.tipo === 'calentamiento') continue
    const kg = x.peso_g / 1000, prev = tope.get(s.fecha)
    if (!prev || kg > prev.kg) tope.set(s.fecha, { fecha: s.fecha, kg, reps: x.reps })
  }
  const puntos = [...tope.values()].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const pesoMax = puntos.length ? Math.max(...puntos.map((p) => p.kg)) : 0
  const ultimo = puntos.length ? puntos[puntos.length - 1].kg : null

  return (
    <>
      <TopBar titulo="Ejercicio" atras der={<button className="btn sm" onClick={() => nav.ir({ v: 'ejercicioForm', id })}>Editar</button>} />
      <div className="main sin-tabs">
        <div className="card">
          <h3 style={{ fontSize: 18 }}>{ex.nombre}</h3>
          {ex.legible && <div className="small muted" style={{ marginTop: 3 }}>{ex.legible}</div>}
          <div className="row wrap" style={{ gap: 4, marginTop: 9 }}>
            <span className="pill pri">{etiqueta(ex.grupo)}</span>
            {ex.sec.map((g) => <span key={g.grupo} className="pill">{etiqueta(g.grupo)} ×{numES(g.factor)}</span>)}
            <span className="pill">{etiqueta(ex.equipo)}</span>
            <span className="pill">{etiqueta(ex.patron)}</span>
            {ex.unilateral && <span className="pill">por lado</span>}
            {ex.lastre && <span className="pill">con lastre</span>}
            {!ex.vol && <span className="pill">no suma volumen</span>}
          </div>
          {ex.alias.length > 0 && <div className="xsmall muted" style={{ marginTop: 8 }}>También conocido como: {ex.alias.join(', ')}</div>}
          {ex.notas && <div className="xsmall muted" style={{ marginTop: 6 }}>{ex.notas}</div>}
        </div>

        <div style={{ marginBottom: 10 }}>
          {tieneMedia
            ? <MediaView exerciseId={id} url={ex.url} />
            : <button className="media-vacio" onClick={() => nav.ir({ v: 'ejercicioForm', id })}>Sin video ni imagen.<br /><b>Tocá para agregar uno</b></button>}
        </div>

        <div className="row" style={{ marginBottom: 10 }}>
          <div className="stat"><b>{hist?.length ?? '—'}</b><span>sesiones</span></div>
          <div className="stat"><b>{ultimo != null ? numES(ultimo) : '—'}</b><span>{ex.lastre ? 'último lastre' : 'último kg'}</span></div>
          <div className="stat"><b>{pesoMax ? numES(pesoMax) : '—'}</b><span>{ex.lastre ? 'lastre máx' : 'kg máx'}</span></div>
        </div>

        {puntos.length > 1 && (
          <div className="card">
            <div className="bold small" style={{ marginBottom: 6 }}>Peso máximo por sesión</div>
            <GraficoPesos puntos={puntos} unidad={ex.lastre ? 'kg de lastre' : 'kg'} />
          </div>
        )}

        <h2>Historial</h2>
        <HistorialLista exerciseId={id} lastre={ex.lastre} />
      </div>
    </>
  )
}

export function ExerciseFormScreen({ id }: { id: number | null }) {
  const nav = useNav()
  const { confirmar, avisar } = useDialogos()
  const [f, setF] = useState<Partial<Exercise>>({ nombre: '', grupo: 'pecho', equipo: 'barra', patron: 'aislamiento', mide: 'reps', vol: true, unilateral: false, lastre: false, inc: 2.5, alias: [] })
  const [alias, setAlias] = useState('')
  const [usos, setUsos] = useState(0)
  const [archivoNuevo, setArchivoNuevo] = useState<File | null>(null)
  const [quitarMedia, setQuitarMedia] = useState(false)
  const [previa, setPrevia] = useState<string | null>(null)
  const guardado = useLiveQuery(async () => (id != null ? (await db.media.get(id)) ?? null : null), [id])
  useEffect(() => {
    if (!archivoNuevo) { setPrevia(null); return }
    const u = URL.createObjectURL(archivoNuevo)
    setPrevia(u)
    return () => URL.revokeObjectURL(u)
  }, [archivoNuevo])
  const elegirArchivo = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) { avisar('Tiene que ser una imagen o un video.'); return }
    if (file.size > MAX_MEDIA_MB * 1048576) { avisar(`El archivo pesa ${Math.round(file.size / 1048576)} MB. El máximo es ${MAX_MEDIA_MB} MB.`); return }
    setArchivoNuevo(file); setQuitarMedia(false)
  }
  const guardarMedia = async (exId: number) => {
    if (archivoNuevo) await db.media.put({ exercise_id: exId, tipo: archivoNuevo.type.startsWith('video/') ? 'video' : 'imagen', blob: archivoNuevo, nombre: archivoNuevo.name, size: archivoNuevo.size })
    else if (quitarMedia) await db.media.delete(exId)
  }
  useEffect(() => {
    if (id == null) return
    void db.exercises.get(id).then((e) => { if (e) { setF(e); setAlias(e.alias.join(', ')) } })
    void db.setLogs.where('exercise_id').equals(id).count().then(setUsos)
  }, [id])
  const guardar = async () => {
    const nombre = (f.nombre ?? '').trim()
    if (!nombre) { avisar('El ejercicio necesita un nombre.'); return }
    let url = (f.url ?? '').trim() || null
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`
    const datos = { ...f, nombre, url, alias: alias.split(',').map((a) => a.trim()).filter(Boolean) }
    try {
      if (id != null) { await db.exercises.update(id, datos); await guardarMedia(id); nav.volver() }
      else {
        const nid = await crearEjercicio(datos as Partial<Exercise> & { nombre: string })
        if (url) await db.exercises.update(nid, { url })
        await guardarMedia(nid)
        nav.reemplazar({ v: 'ejercicio', id: nid })
      }
    } catch { avisar('No se pudo guardar. Si adjuntaste un archivo grande, probá con uno más liviano.') }
  }
  const sel = (k: 'grupo' | 'equipo' | 'patron', ops: string[], label: string) => (
    <>
      <label className="f" htmlFor={`s-${k}`}>{label}</label>
      <select id={`s-${k}`} value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })}>
        {ops.map((o) => <option key={o} value={o}>{etiqueta(o)}</option>)}
      </select>
    </>
  )
  const interruptor = (k: 'unilateral' | 'lastre' | 'vol' | 'archivo', t: string, d: string) => (
    <button className="row" style={{ width: '100%', padding: '8px 0' }} aria-pressed={!!f[k]} onClick={() => setF({ ...f, [k]: !f[k] })}>
      <span className={`chip sm${f[k] ? ' on' : ''}`}>{f[k] ? '✓' : ''}</span>
      <span className="grow small"><b>{t}</b><br /><span className="xsmall muted">{d}</span></span>
    </button>
  )
  return (
    <>
      <TopBar titulo={id != null ? 'Editar ejercicio' : 'Nuevo ejercicio'} atras />
      <div className="main sin-tabs">
        <div className="card">
          <label className="f" style={{ marginTop: 0 }} htmlFor="en">Nombre</label>
          <input id="en" value={f.nombre ?? ''} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej.: Press banca con barra" />
          <label className="f" htmlFor="el">Descripción (opcional)</label>
          <input id="el" value={f.legible ?? ''} onChange={(e) => setF({ ...f, legible: e.target.value || null })} />
          {sel('grupo', GRUPOS, 'Grupo muscular principal')}
          {sel('equipo', EQUIPOS, 'Equipamiento')}
          {sel('patron', PATRONES, 'Patrón de movimiento')}
          <label className="f">Se mide en</label>
          <Chips opciones={[{ v: 'reps' as Mide, t: 'repeticiones' }, { v: 'seg' as Mide, t: 'tiempo' }, { v: 'ambos' as Mide, t: 'cualquiera' }]} valor={(f.mide ?? 'reps') as Mide} onPick={(v) => setF({ ...f, mide: v })} />
          <label className="f">Salto mínimo de carga</label>
          <Stepper value={f.inc ?? null} step={0.25} unit="kg" onChange={(v) => setF({ ...f, inc: v })} />
          <label className="f">Descanso entre series</label>
          <Stepper value={f.descanso_s ?? null} step={15} unit="segundos" onChange={(v) => setF({ ...f, descanso_s: v })} />
        </div>
        <div className="card">
          <label className="f" style={{ marginTop: 0 }}>Video o imagen del ejercicio</label>
          {archivoNuevo && previa ? (
            <div className="media">{archivoNuevo.type.startsWith('video/')
              ? <video src={previa} controls playsInline muted preload="metadata" aria-label="Vista previa del video" />
              : <img src={previa} alt="Vista previa de la imagen" />}</div>
          ) : id != null && guardado && !quitarMedia ? <MediaView exerciseId={id} /> : (
            <label className="media-vacio" style={{ display: 'block', cursor: 'pointer' }} htmlFor="em">Todavía no hay video ni imagen.<br /><b>Tocá para elegir un archivo</b></label>
          )}
          <input id="em" type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={(e) => { elegirArchivo(e.target.files?.[0]); e.target.value = '' }} />
          {(archivoNuevo || (guardado && !quitarMedia)) && (
            <div className="row" style={{ marginTop: 8 }}>
              <label className="btn sm grow" htmlFor="em" style={{ cursor: 'pointer' }}>Cambiar archivo</label>
              <button className="btn sm danger grow" onClick={() => { setArchivoNuevo(null); setQuitarMedia(true) }}>Quitar</button>
            </div>
          )}
          <div className="xsmall muted" style={{ marginTop: 8 }}>Imagen o video de hasta {MAX_MEDIA_MB} MB. Se guarda solo en este dispositivo y no entra en la copia de seguridad.</div>
          <label className="f" htmlFor="eu">O un enlace (YouTube, Instagram…)</label>
          <input id="eu" inputMode="url" placeholder="https://…" value={f.url ?? ''} onChange={(e) => setF({ ...f, url: e.target.value })} />
        </div>
        <div className="card">
          {interruptor('unilateral', 'Unilateral', 'Se hace por lado')}
          {interruptor('lastre', 'Peso corporal con lastre', 'El peso cargado es el lastre agregado')}
          {interruptor('vol', 'Suma volumen', 'Desmarcalo para movilidad y activación')}
          {id != null && interruptor('archivo', 'Archivado', 'No aparece en los buscadores salvo que lo pidas')}
        </div>
        <div className="card">
          <label className="f" style={{ marginTop: 0 }} htmlFor="ea">Otros nombres, separados por coma</label>
          <input id="ea" value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Sirven para reconocerlo al importar planes" />
          <label className="f" htmlFor="eo">Notas</label>
          <textarea id="eo" rows={2} value={f.notas ?? ''} onChange={(e) => setF({ ...f, notas: e.target.value || null })} />
        </div>
        <button className="btn primary block lg" onClick={() => void guardar()}>Guardar</button>
        {id != null && usos === 0 && (
          <button className="btn ghost block danger" style={{ marginTop: 8 }} onClick={async () => {
            const enPlanes = (await db.planDays.toArray()).some((d) => d.bloques.some((b) => b.ejercicios.some((e) => e.exercise_id === id)))
            if (enPlanes) { avisar('Está en uso en un plan. Quitalo del plan o archivalo.'); return }
            if (await confirmar({ titulo: '¿Borrar este ejercicio?', ok: 'Borrar', peligro: true })) { await db.exercises.delete(id); nav.raiz({ v: 'ejercicios' }) }
          }}>Borrar ejercicio</button>
        )}
        {id != null && usos > 0 && <div className="xsmall muted center" style={{ marginTop: 10 }}>Tiene {usos} series registradas, así que no se puede borrar; sí archivar.</div>}
      </div>
    </>
  )
}
