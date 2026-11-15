import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, kgToG, type Exercise, type PBlock, type PSet } from '../db'
import { Chevron, Picker, TopBar, useDialogos, useNav } from '../ui'
import { etiqueta, plural, GRUPOS, guardarArchivo, numES, resumenSets, setValido, slugify } from '../lib'
import { activarPlan, borrarPlan, duplicarDia, reordenarDias } from '../actions'
import { EJEMPLO_PLAN, exportarPlan, guardarPlan, leerPlan, pedidoParaIA, type ImpPlan, type Resolucion } from '../plan'

export function PlansScreen() {
  const nav = useNav()
  const planes = useLiveQuery(() => db.plans.toArray(), [])
  const dias = useLiveQuery(() => db.planDays.toArray(), [])
  const crear = async () => {
    const id = await db.plans.add({ nombre: 'Plan nuevo', objetivo: null, activo: !(planes ?? []).some((p) => p.activo), cursor: 0, creado: Date.now() })
    await db.planDays.add({ plan_id: id, orden: 0, nombre: 'Día 1', bloques: [{ orden: 1, ejercicios: [] }] })
    nav.ir({ v: 'plan', id })
  }
  return (
    <>
      <TopBar titulo="Planes" sub="Tus rutinas por día" />
      <div className="main">
        {(planes ?? []).sort((a, b) => Number(b.activo) - Number(a.activo) || b.creado - a.creado).map((p) => {
          const n = (dias ?? []).filter((d) => d.plan_id === p.id).length
          return (
            <button key={p.id} className="card" onClick={() => nav.ir({ v: 'plan', id: p.id! })}>
              <div className="row spread">
                <h3>{p.nombre}</h3>
                {p.activo && <span className="pill pri">activo</span>}
              </div>
              <div className="small muted" style={{ marginTop: 4 }}>{n} {n === 1 ? 'día' : 'días'}{p.objetivo ? ` · ${p.objetivo}` : ''}</div>
            </button>
          )
        })}
        {planes && !planes.length && <div className="empty">Todavía no hay planes. Creá uno o importalo desde un archivo.</div>}
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn primary grow" onClick={() => nav.ir({ v: 'importar' })}>Importar plan</button>
          <button className="btn grow" onClick={() => void crear()}>Crear plan</button>
        </div>
      </div>
    </>
  )
}

// ------------------------------------------------------------------ detalle de plan
export function PlanScreen({ id }: { id: number }) {
  const nav = useNav()
  const { confirmar, avisar } = useDialogos()
  const plan = useLiveQuery(() => db.plans.get(id), [id])
  const dias = useLiveQuery(async () => (await db.planDays.where('plan_id').equals(id).toArray()).sort((a, b) => a.orden - b.orden), [id])
  const nombres = useLiveQuery(async () => new Map((await db.exercises.toArray()).map((e) => [e.id!, e.nombre])), [])
  if (!plan || !dias) return <><TopBar titulo="Plan" atras /><div className="main sin-tabs"><div className="empty">Cargando…</div></div></>

  const mover = async (i: number, d: number) => {
    const ids = dias.map((x) => x.id!)
    const j = i + d
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    await reordenarDias(ids)
  }
  const exportar = async () => {
    const r = await guardarArchivo(`plan-${slugify(plan.nombre)}.json`, await exportarPlan(id))
    avisar(r === 'ok' ? 'Plan exportado.' : r === 'cancelado' ? 'Exportación cancelada.' : 'No se pudo exportar acá.')
  }
  return (
    <>
      <TopBar titulo="Plan" atras der={plan.activo ? <span className="pill pri">activo</span> : undefined} />
      <div className="main sin-tabs">
        <div className="card">
          <label className="f" style={{ marginTop: 0 }} htmlFor="pn">Nombre</label>
          <input id="pn" defaultValue={plan.nombre} onBlur={(e) => void db.plans.update(id, { nombre: e.target.value.trim() || 'Plan sin nombre' })} />
          <label className="f" htmlFor="po">Objetivo o notas</label>
          <textarea id="po" rows={2} defaultValue={plan.objetivo ?? ''} onBlur={(e) => void db.plans.update(id, { objetivo: e.target.value.trim() || null })} />
          {!plan.activo && <button className="btn soft block" style={{ marginTop: 10 }} onClick={() => void activarPlan(id)}>Usar este plan</button>}
        </div>

        <h2>Días · rotan en este orden</h2>
        {dias.map((d, i) => {
          const nEj = d.bloques.reduce((n, b) => n + b.ejercicios.length, 0)
          const primeros = d.bloques.flatMap((b) => b.ejercicios).slice(0, 3).map((e) => nombres?.get(e.exercise_id) ?? '…').join(' · ')
          return (
            <div key={d.id} className="card tight">
              <div className="row top">
                <button className="grow" onClick={() => nav.ir({ v: 'planDia', id: d.id! })}>
                  <div className="row"><b>{d.nombre}</b>{plan.cursor % dias.length === i && <span className="pill pri">próximo</span>}</div>
                  <div className="xsmall muted" style={{ marginTop: 3 }}>{plural(d.bloques.length, 'bloque', 'bloques')} · {plural(nEj, 'ejercicio', 'ejercicios')}</div>
                  {primeros && <div className="xsmall muted truncate" style={{ marginTop: 2 }}>{primeros}</div>}
                </button>
                <div className="col" style={{ gap: 4 }}>
                  <button className="chip sm" disabled={i === 0} onClick={() => void mover(i, -1)} aria-label="Subir día">↑</button>
                  <button className="chip sm" disabled={i === dias.length - 1} onClick={() => void mover(i, 1)} aria-label="Bajar día">↓</button>
                </div>
              </div>
              <div className="row" style={{ marginTop: 9 }}>
                <button className="btn sm grow" onClick={() => nav.ir({ v: 'planDia', id: d.id! })}>Editar</button>
                <button className="btn sm grow" onClick={() => void duplicarDia(d)}>Duplicar</button>
                <button className="btn sm grow" onClick={() => void db.plans.update(id, { cursor: i })}>Es el próximo</button>
              </div>
            </div>
          )
        })}
        <button className="btn block" onClick={async () => {
          const nid = await db.planDays.add({ plan_id: id, orden: dias.length, nombre: `Día ${dias.length + 1}`, bloques: [{ orden: 1, ejercicios: [] }] })
          nav.ir({ v: 'planDia', id: nid })
        }}>+ Día</button>

        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn grow" onClick={() => void exportar()}>Exportar a archivo</button>
          <button className="btn grow danger" onClick={async () => {
            if (await confirmar({ titulo: `¿Borrar el plan «${plan.nombre}»?`, texto: 'Las sesiones ya registradas no se tocan.', ok: 'Borrar', peligro: true })) {
              await borrarPlan(id); nav.volver()
            }
          }}>Borrar plan</button>
        </div>
      </div>
    </>
  )
}

// ------------------------------------------------------------------ editor de día
const aNum = (v: string): number | null => { const n = Number(v.replace(',', '.')); return v.trim() === '' || !Number.isFinite(n) ? null : n }
const aTxt = (n: number | null | undefined): string => (n == null ? '' : numES(n))

export function PlanDayScreen({ id }: { id: number }) {
  const nav = useNav()
  const { confirmar } = useDialogos()
  const dia = useLiveQuery(() => db.planDays.get(id), [id])
  const ejercicios = useLiveQuery(() => db.exercises.toArray(), [])
  const [picker, setPicker] = useState<{ b: number; e: number | null } | null>(null)
  const [rev, setRev] = useState(0)
  const mapa = useMemo(() => new Map((ejercicios ?? []).map((e) => [e.id!, e])), [ejercicios])
  if (!dia || !ejercicios) return <><TopBar titulo="Día" atras /><div className="main sin-tabs"><div className="empty">Cargando…</div></div></>

  const guardar = (bloques: PBlock[]) => void db.planDays.update(id, { bloques })
  const editar = (fn: (b: PBlock[]) => void, estructural = true) => {
    const c: PBlock[] = JSON.parse(JSON.stringify(dia.bloques)); fn(c); guardar(c)
    if (estructural) setRev((r) => r + 1)
  }
  const invalidas = dia.bloques.reduce((n, b) => n + b.ejercicios.reduce((m, e) => m + e.series.filter((s) => !setValido(s)).length, 0), 0)

  const elegido = (ex: Exercise) => {
    if (!picker) return
    editar((bl) => {
      const b = bl[picker.b]
      if (picker.e == null) {
        const base: PSet = ex.mide === 'seg' ? { seg: 30 } : { reps: 10 }
        b.ejercicios.push({ exercise_id: ex.id!, notas: null, series: [base, { ...base }, { ...base }] })
      } else b.ejercicios[picker.e].exercise_id = ex.id!
    })
  }

  return (
    <>
      <TopBar titulo="Editar día" atras />
      <div className="main sin-tabs">
        <div className="card">
          <label className="f" style={{ marginTop: 0 }} htmlFor="dn">Nombre del día</label>
          <input id="dn" defaultValue={dia.nombre} onBlur={(e) => void db.planDays.update(id, { nombre: e.target.value.trim() || 'Día sin nombre' })} />
        </div>
        {invalidas > 0 && <div className="banner err">{invalidas} {invalidas === 1 ? 'serie no tiene' : 'series no tienen'} ningún dato. Cada serie necesita al menos reps, tiempo, peso, RIR o RPE.</div>}

        {dia.bloques.map((b, bi) => (
          <div key={bi}>
            <div className="row spread" style={{ margin: '16px 2px 8px' }}>
              <b>Bloque {b.orden}</b>
              <button className="btn sm danger" onClick={async () => {
                if (!b.ejercicios.length || await confirmar({ titulo: `¿Borrar el bloque ${b.orden}?`, ok: 'Borrar', peligro: true })) editar((bl) => { bl.splice(bi, 1) })
              }}>Borrar bloque</button>
            </div>
            {b.ejercicios.map((e, ei) => {
              const ex = mapa.get(e.exercise_id)
              const enSeg = e.series.some((s) => s.seg != null) || (ex?.mide === 'seg' && !e.series.some((s) => s.reps != null))
              return (
                <div key={`${ei}-${rev}`} className="card tight">
                  <div className="row top">
                    <button className="grow" onClick={() => setPicker({ b: bi, e: ei })}>
                      <b style={{ fontSize: 15 }}>{ex?.nombre ?? 'Ejercicio borrado'}</b>
                      <div className="xsmall muted">{ex ? `${etiqueta(ex.grupo)} · tocá para cambiarlo` : 'Tocá para elegir otro'}</div>
                    </button>
                    <button className="chip sm" disabled={ei === 0} aria-label="Subir ejercicio" onClick={() => editar((bl) => { const a = bl[bi].ejercicios; [a[ei - 1], a[ei]] = [a[ei], a[ei - 1]] })}>↑</button>
                    <button className="chip sm" disabled={ei === b.ejercicios.length - 1} aria-label="Bajar ejercicio" onClick={() => editar((bl) => { const a = bl[bi].ejercicios; [a[ei + 1], a[ei]] = [a[ei], a[ei + 1]] })}>↓</button>
                    <button className="chip sm" aria-label="Quitar ejercicio" onClick={() => editar((bl) => { bl[bi].ejercicios.splice(ei, 1) })}>✕</button>
                  </div>

                  <div className="ed-serie" style={{ marginTop: 10 }}>
                    <span /><span className="h">{enSeg ? 'seg' : 'reps'}</span><span className="h">kg</span><span className="h">RIR</span><span className="h">RPE</span><span className="h">fallo</span><span />
                  </div>
                  {e.series.map((s, si) => {
                    const set = (c: Partial<PSet>) => editar((bl) => { Object.assign(bl[bi].ejercicios[ei].series[si], c) }, false)
                    return (
                      <div key={si} className={`ed-serie${setValido(s) ? '' : ' mal'}`}>
                        <span className="xsmall muted center">{si + 1}</span>
                        <input inputMode="numeric" aria-label={`Serie ${si + 1}: ${enSeg ? 'segundos' : 'reps'}`} defaultValue={aTxt(enSeg ? s.seg : s.reps)} key={`m${enSeg}${si}${e.series.length}`}
                          onBlur={(ev) => set(enSeg ? { seg: aNum(ev.target.value), reps: null } : { reps: aNum(ev.target.value), seg: null })} />
                        <input inputMode="decimal" aria-label={`Serie ${si + 1}: peso en kg`} defaultValue={s.peso_g ? aTxt(s.peso_g / 1000) : ''} key={`p${si}${e.series.length}`}
                          onBlur={(ev) => { const n = aNum(ev.target.value); set({ peso_g: n == null ? null : kgToG(n) }) }} />
                        <input inputMode="numeric" aria-label={`Serie ${si + 1}: RIR`} defaultValue={aTxt(s.rir)} key={`i${si}${e.series.length}${s.rir ?? 'x'}`}
                          onBlur={(ev) => { const n = aNum(ev.target.value); set(n == null ? { rir: null } : { rir: n, rpe: null }) }} />
                        <input inputMode="numeric" aria-label={`Serie ${si + 1}: RPE`} defaultValue={aTxt(s.rpe)} key={`e${si}${e.series.length}${s.rpe ?? 'x'}`}
                          onBlur={(ev) => { const n = aNum(ev.target.value); set(n == null ? { rpe: null } : { rpe: Math.min(10, n), rir: null }) }} />
                        <button className={`chip sm${s.fallo ? ' on' : ''}`} aria-pressed={!!s.fallo} aria-label={`Serie ${si + 1} al fallo`} onClick={() => set({ fallo: !s.fallo })}>F</button>
                        <button className="chip sm" aria-label={`Borrar serie ${si + 1}`} onClick={() => editar((bl) => { bl[bi].ejercicios[ei].series.splice(si, 1) })}>✕</button>
                      </div>
                    )
                  })}
                  <div className="row" style={{ marginTop: 6 }}>
                    <button className="btn sm grow" onClick={() => editar((bl) => { const ss = bl[bi].ejercicios[ei].series; ss.push(ss.length ? { ...ss[ss.length - 1], fallo: false } : { reps: 10 }) })}>+ Serie</button>
                    {ex?.mide !== 'reps' || enSeg ? (
                      <button className="btn sm grow" onClick={() => editar((bl) => {
                        for (const s of bl[bi].ejercicios[ei].series) { if (enSeg) { s.reps = s.seg ?? null; s.seg = null } else { s.seg = s.reps ?? null; s.reps = null } }
                      })}>{enSeg ? 'Medir en reps' : 'Medir en tiempo'}</button>
                    ) : null}
                  </div>
                  <input style={{ marginTop: 8 }} placeholder="Nota para este ejercicio (opcional)" aria-label="Nota del ejercicio" defaultValue={e.notas ?? ''}
                    onBlur={(ev) => editar((bl) => { bl[bi].ejercicios[ei].notas = ev.target.value.trim() || null })} />
                </div>
              )
            })}
            <button className="btn soft block sm" onClick={() => setPicker({ b: bi, e: null })}>+ Ejercicio en el bloque {b.orden}</button>
          </div>
        ))}

        <button className="btn block" style={{ marginTop: 16 }} onClick={() => editar((bl) => { bl.push({ orden: bl.length ? Math.max(...bl.map((x) => x.orden)) + 1 : 1, ejercicios: [] }) })}>+ Bloque</button>
        <button className="btn primary block" style={{ marginTop: 10 }} onClick={nav.volver}>Listo</button>
        <div className="xsmall muted center" style={{ marginTop: 8 }}>Los cambios se guardan solos. RIR y RPE no van juntos: al cargar uno se borra el otro.</div>
      </div>
      {picker && (
        <Picker multi={picker.e == null} titulo={picker.e == null ? `Agregar al bloque ${dia.bloques[picker.b]?.orden}` : 'Cambiar ejercicio'}
          onCerrar={() => setPicker(null)} onElegir={elegido} />
      )}
    </>
  )
}

// ------------------------------------------------------------------ importar
export function ImportScreen() {
  const nav = useNav()
  const { avisar } = useDialogos()
  const ejercicios = useLiveQuery(() => db.exercises.toArray(), [])
  const [imp, setImp] = useState<ImpPlan | null>(null)
  const [res, setRes] = useState<Map<string, Resolucion>>(new Map())
  const [texto, setTexto] = useState('')
  const [pegar, setPegar] = useState(false)
  const [ayuda, setAyuda] = useState(false)
  const [vincular, setVincular] = useState<string | null>(null)
  const [activar, setActivar] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [pedido, setPedido] = useState<string | null>(null)
  // Primer paso: ¿ya tiene un plan o quiere que una IA se lo arme?
  const [modo, setModo] = useState<'tengo' | 'crear' | null>(null)
  // Lo que se escribió en "Crear nuevo" para cada ejercicio, para no perderlo al pasar a "Vincular" y volver.
  const borradores = useRef(new Map<string, Resolucion>())
  const file = useRef<HTMLInputElement>(null)
  const mapa = useMemo(() => new Map((ejercicios ?? []).map((e) => [e.id!, e])), [ejercicios])

  const leer = (t: string) => {
    const r = leerPlan(t, ejercicios ?? [])
    const m = new Map<string, Resolucion>()
    for (const d of r.desconocidos) m.set(d.clave, { tipo: 'crear', nombre: d.original, grupo: d.grupo ?? 'full_body' })
    borradores.current = new Map()
    setRes(m); setImp(r)
  }
  // Copia el pedido para el asistente. Si el navegador no deja copiar, lo muestra para copiarlo a mano.
  const copiarPedido = async (para: 'crear' | 'convertir') => {
    const t = pedidoParaIA(ejercicios ?? [], para)
    try { await navigator.clipboard.writeText(t); setPedido(null); avisar('Pedido copiado. Pegalo en la IA.') } catch { setPedido(t) }
  }
  const poner = (clave: string, r: Resolucion) => { if (r.tipo === 'crear') borradores.current.set(clave, r); setRes((m) => new Map(m).set(clave, r)) }
  const importar = async () => {
    if (!imp) return
    setOcupado(true)
    try {
      const id = await guardarPlan(imp, res, activar)
      avisar('Plan importado.')
      nav.reemplazar({ v: 'plan', id })
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo importar.')
      setOcupado(false)
    }
  }

  const cajaPedido = pedido != null && (
    <>
      <div className="xsmall muted" style={{ margin: '8px 0 4px' }}>No se pudo copiar solo. Mantené apretado el texto, elegí «Seleccionar todo» y copialo.</div>
      <textarea rows={6} readOnly value={pedido} aria-label="Pedido para la IA" style={{ fontSize: 12 }} onFocus={(e) => e.target.select()} />
    </>
  )
  const cajaPegar = (
    <>
      <button className="btn block" style={{ marginTop: 8 }} onClick={() => setPegar(true)}>Pegar el plan</button>
      {pegar && (
        <>
          <label className="f" htmlFor="pp">Pegá acá lo que te devolvió la IA</label>
          <textarea id="pp" rows={7} autoFocus placeholder='{ "formato": "plan-gym/v1", … }' value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Contenido del plan" style={{ fontFamily: 'monospace', fontSize: 12 }} />
          <button className="btn block" style={{ marginTop: 8 }} disabled={!texto.trim()} onClick={() => leer(texto)}>Leer</button>
        </>
      )}
    </>
  )
  const botonArchivo = (principal: boolean) => (
    <button className={`btn block${principal ? ' primary lg' : ''}`} style={{ marginTop: 12 }} onClick={() => file.current?.click()}>Elegir archivo</button>
  )

  if (!imp) return (
    <>
      <TopBar titulo="Importar plan" atras />
      <div className="main sin-tabs">
        <input ref={file} type="file" accept=".json,application/json,text/plain" style={{ display: 'none' }}
          onChange={async (e) => { const f = e.target.files?.[0]; if (f) leer(await f.text()); e.target.value = '' }} />

        {modo == null && (
          <>
            <button className="card" onClick={() => setModo('tengo')}>
              <h3>Ya tengo un plan</h3>
              <div className="small muted" style={{ marginTop: 4 }}>Tengo el archivo, o lo tengo en una foto, un PDF, una planilla u otra app y quiero pasarlo.</div>
            </button>
            <button className="card" onClick={() => setModo('crear')}>
              <h3>Quiero que una IA me arme un plan</h3>
              <div className="small muted" style={{ marginTop: 4 }}>Le pedís el plan a Claude u otra IA con un texto ya preparado y lo traés a la app.</div>
            </button>
          </>
        )}

        {modo === 'tengo' && (
          <>
            <div className="card">
              <b>Tengo el archivo (.json)</b>
              <div className="small muted" style={{ marginTop: 4 }}>Antes de guardar vas a ver qué trae y vas a poder resolver los ejercicios que la app no conozca.</div>
              {botonArchivo(true)}
            </div>
            <div className="card">
              <b>Lo tengo en otro formato</b>
              <ol className="small muted" style={{ margin: '8px 0 12px', paddingLeft: 20 }}>
                <li>Tocá <b>Copiar pedido</b>: lleva el formato de la app y tu lista de ejercicios.</li>
                <li>Pegalo en Claude u otra IA y pasale tu plan (texto, foto o archivo). Le pide que lo pase tal cual, sin cambiarlo.</li>
                <li>Copiá lo que te devuelve y pegalo acá abajo.</li>
              </ol>
              <button className="btn soft block" onClick={() => void copiarPedido('convertir')}>Copiar pedido para la IA</button>
              {cajaPedido}
              {cajaPegar}
            </div>
          </>
        )}

        {modo === 'crear' && (
          <>
            <div className="card">
              <b>Pedile el plan a una IA</b>
              <ol className="small muted" style={{ margin: '8px 0 12px', paddingLeft: 20 }}>
                <li>Tocá <b>Copiar pedido</b>: lleva el formato de la app y tu lista de ejercicios.</li>
                <li>Pegalo en Claude u otra IA y contale qué querés entrenar.</li>
                <li>Copiá el plan que te devuelve y pegalo acá abajo.</li>
              </ol>
              <button className="btn primary block" onClick={() => void copiarPedido('crear')}>Copiar pedido para la IA</button>
              {cajaPedido}
              {cajaPegar}
            </div>
            <div className="card">
              <b>Si la IA te dio un archivo (.json)</b>
              {botonArchivo(false)}
            </div>
          </>
        )}

        {modo != null && (
          <>
            <button className="card tight" onClick={() => setAyuda((a) => !a)} aria-expanded={ayuda}>
              <div className="row"><Chevron abierto={ayuda} /><b className="small">¿Cómo es el archivo?</b></div>
              {ayuda && (
                <>
                  <div className="xsmall muted" style={{ marginTop: 6 }}>
                    Días → bloques → ejercicios → series. Cada serie lleva al menos uno de: <b>reps</b>, <b>seg</b>, <b>peso_kg</b>, <b>rir</b>, <b>rpe</b>. RIR y RPE no van juntos.
                    Si todas las series son iguales se puede abreviar con <b>"series": 3</b> y los valores al lado.
                  </div>
                  <pre className="code">{EJEMPLO_PLAN}</pre>
                </>
              )}
            </button>
            <button className="btn ghost block" onClick={() => { setModo(null); setPedido(null); setPegar(false) }}>Elegir otra opción</button>
          </>
        )}
      </div>
    </>
  )

  const nEj = imp.dias.reduce((n, d) => n + d.bloques.reduce((m, b) => m + b.ejercicios.length, 0), 0)
  return (
    <>
      <TopBar titulo="Revisar plan" atras />
      <div className="main sin-tabs">
        {imp.errores.length > 0 ? (
          <>
            <div className="banner err"><b>El archivo tiene {imp.errores.length} {imp.errores.length === 1 ? 'problema' : 'problemas'} y no se puede importar.</b> Corregilo y volvé a subirlo.</div>
            <div className="list">{imp.errores.slice(0, 40).map((e, i) => <div key={i} className="item small">{e}</div>)}</div>
            <button className="btn block" style={{ marginTop: 12 }} onClick={() => setImp(null)}>Elegir otro archivo</button>
          </>
        ) : (
          <>
            <div className="card">
              <label className="f" style={{ marginTop: 0 }} htmlFor="in">Nombre del plan</label>
              <input id="in" value={imp.nombre} onChange={(e) => setImp({ ...imp, nombre: e.target.value })} />
              <div className="small muted" style={{ marginTop: 8 }}>{imp.dias.length} {imp.dias.length === 1 ? 'día' : 'días'} · {nEj} ejercicios · {imp.resueltos.size - imp.desconocidos.length} reconocidos del catálogo</div>
            </div>

            {imp.desconocidos.length > 0 && (
              <>
                <h2>Ejercicios que no están en la app · {imp.desconocidos.length}</h2>
                <div className="banner">Para cada uno elegí: crearlo como ejercicio nuevo (podés cambiarle el nombre) o vincularlo a uno que ya existe.</div>
                {imp.desconocidos.map((d) => {
                  const r = res.get(d.clave)!
                  return (
                    <div key={d.clave} className="card tight">
                      <div className="xsmall muted">En el archivo</div>
                      <b>{d.original}</b>
                      <div className="row" style={{ margin: '9px 0' }}>
                        <button className={`chip grow${r.tipo === 'crear' ? ' on' : ''}`} aria-pressed={r.tipo === 'crear'} onClick={() => { if (r.tipo !== 'crear') poner(d.clave, borradores.current.get(d.clave) ?? { tipo: 'crear', nombre: d.original, grupo: d.grupo ?? 'full_body' }) }}>Crear nuevo</button>
                        <button className={`chip grow${r.tipo === 'vincular' ? ' on' : ''}`} aria-pressed={r.tipo === 'vincular'} onClick={() => setVincular(d.clave)}>Vincular a existente</button>
                      </div>
                      {r.tipo === 'crear' ? (
                        <>
                          <label className="f" style={{ marginTop: 0 }}>Nombre con el que queda en la app</label>
                          <input value={r.nombre} aria-label="Nombre del ejercicio nuevo" onChange={(e) => poner(d.clave, { ...r, nombre: e.target.value })} />
                          <label className="f">Músculo principal</label>
                          <select value={r.grupo} aria-label="Grupo muscular" onChange={(e) => poner(d.clave, { ...r, grupo: e.target.value })}>
                            {GRUPOS.map((g) => <option key={g} value={g}>{etiqueta(g)}</option>)}
                          </select>
                          {d.sugerencia && (
                            <button className="btn ghost sm" style={{ marginTop: 4 }} onClick={() => poner(d.clave, { tipo: 'vincular', id: d.sugerencia!.id! })}>¿Es «{d.sugerencia.nombre}»? Vincular</button>
                          )}
                        </>
                      ) : (
                        <button className="btn soft block sm" onClick={() => setVincular(d.clave)}>→ {mapa.get(r.id)?.nombre ?? 'Elegir'} · cambiar</button>
                      )}
                    </div>
                  )
                })}
              </>
            )}

            <h2>Contenido</h2>
            {imp.dias.map((d, i) => (
              <div key={i} className="card tight">
                <b>{d.nombre}</b>
                {d.bloques.map((b) => (
                  <div key={b.orden} style={{ marginTop: 6 }}>
                    <div className="xsmall muted bold">Bloque {b.orden}</div>
                    {b.ejercicios.map((e, j) => {
                      const id = imp.resueltos.get(e.clave)
                      const r = res.get(e.clave)
                      const nombre = id != null ? mapa.get(id)?.nombre : r?.tipo === 'vincular' ? mapa.get(r.id)?.nombre : r?.nombre
                      return <div key={j} className="xsmall"><b>{nombre ?? e.original}</b> <span className="muted mono">{resumenSets(e.series)}</span></div>
                    })}
                  </div>
                ))}
              </div>
            ))}

            <button className="card row" onClick={() => setActivar((a) => !a)} aria-pressed={activar}>
              <span className={`chip sm${activar ? ' on' : ''}`}>{activar ? '✓' : ''}</span>
              <span className="grow small bold">Dejarlo como plan activo</span>
            </button>
            <button className="btn primary block lg" disabled={ocupado} onClick={() => void importar()}>Importar plan</button>
            <button className="btn ghost block" style={{ marginTop: 6 }} onClick={() => setImp(null)}>Elegir otro archivo</button>
          </>
        )}
      </div>
      {vincular && <Picker sinCrear titulo="Vincular a…" onCerrar={() => setVincular(null)} onElegir={(e) => poner(vincular, { tipo: 'vincular', id: e.id! })} />}
    </>
  )
}
