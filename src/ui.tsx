import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Exercise } from './db'
import { agruparPorCategoria, buscar, categoria, etiqueta, fmtFecha, historicoEjercicio, numES, plural, resumenSets, type SesionDeEjercicio } from './lib'
import { crearEjercicio } from './actions'

// ------------------------------------------------------------------ navegación
export type Vista =
  | { v: 'hoy' } | { v: 'calendario' } | { v: 'planes' } | { v: 'ejercicios' } | { v: 'progreso' }
  | { v: 'wellness'; diaId: number | null }
  | { v: 'sesion' } | { v: 'cerrar' }
  | { v: 'sesionDetalle'; id: number }
  | { v: 'plan'; id: number } | { v: 'planDia'; id: number } | { v: 'importar' }
  | { v: 'ejercicio'; id: number } | { v: 'ejercicioForm'; id: number | null }
  | { v: 'actividad'; id: number | null; fecha: string }
  | { v: 'ajustes' }

export interface Nav { ir: (v: Vista) => void; volver: () => void; reemplazar: (v: Vista) => void; raiz: (v: Vista) => void }
export const NavCtx = createContext<Nav>({ ir: () => {}, volver: () => {}, reemplazar: () => {}, raiz: () => {} })
export const useNav = () => useContext(NavCtx)

// ------------------------------------------------------------------ botón atrás
// Cada pantalla apilada y cada hoja o diálogo abierto suma una entrada al historial del navegador: así el botón
// atrás de Android cierra lo último que se abrió. Cuando la app cierra algo por su cuenta, quita esa entrada.
// Dentro de un marco (la vista previa en Claude) no se toca el historial.
const CON_HISTORIAL = typeof window !== 'undefined' && window.self === window.top
let prof = 0      // entradas propias por encima de la inicial
let ignorar = 0   // retrocesos provocados por la app: su popstate no es un "atrás" del usuario
const abiertas: (() => void)[] = []   // hojas y diálogos abiertos, el de arriba al final
const profActual = (): number => { try { const g = (history.state as { gl?: unknown } | null)?.gl; return typeof g === 'number' ? g : 0 } catch { return 0 } }
const retroceder = (n: number): void => { ignorar++; try { history.go(-n) } catch { ignorar-- } }
// Tras recargar, el navegador conserva entradas de la visita anterior: se descartan.
if (CON_HISTORIAL && profActual() > 0) retroceder(profActual())

export const atras = {
  /** Se abrió una pantalla, hoja o diálogo. */
  sumar(): void {
    if (!CON_HISTORIAL) return
    try { history.pushState({ gl: prof + 1 }, ''); prof++ } catch { /* sin historial */ }
  },
  /** La app cerró n cosas por su cuenta (botón, tocar afuera, guardar). */
  quitar(n = 1): void {
    if (!CON_HISTORIAL) return
    const k = Math.min(n, prof)
    if (k <= 0) return
    prof -= k
    retroceder(k)
  },
  /** Si la pantalla actual tiene cambios sin guardar, le pregunta al usuario y devuelve true (no hay que salir). */
  bloqueado(): boolean {
    if (!guardia) return false
    guardia()
    return true
  },
  /** Atiende el botón atrás del sistema. `sacar` cierra la pantalla de arriba. */
  escuchar(sacar: () => void): () => void {
    const onPop = () => {
      if (ignorar > 0) { ignorar--; return }
      const g = profActual()
      if (g > prof) { retroceder(1); return }   // "adelante" del navegador: se deshace
      const n = prof - g
      prof = g
      for (let i = 0; i < n; i++) {
        const cerrar = abiertas.pop()
        if (cerrar) cerrar()
        else if (guardia) { atras.sumar(); guardia() }   // la pantalla tiene cambios sin guardar: no se sale, se pregunta
        else sacar()
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  },
}

// Pantalla con cambios sin guardar: mientras haya guardia, salir (flecha de la barra o botón atrás) la llama en vez de salir.
let guardia: (() => void) | null = null
export function useGuardiaSalida(activa: boolean, alIntentarSalir: () => void): void {
  const ref = useRef(alIntentarSalir)
  ref.current = alIntentarSalir
  useEffect(() => {
    if (!activa) return
    const fn = () => ref.current()
    guardia = fn
    return () => { if (guardia === fn) guardia = null }
  }, [activa])
}
/** Quita la guardia ya mismo, para poder salir después de guardar o descartar. */
export function sinGuardia(): void { guardia = null }

/** Registra una hoja o diálogo abierto para que el botón atrás lo cierre. */
function useCapa(cerrar: () => void): void {
  const ref = useRef(cerrar)
  ref.current = cerrar
  useEffect(() => {
    const fn = () => ref.current()
    abiertas.push(fn)
    atras.sumar()
    return () => { const i = abiertas.indexOf(fn); if (i >= 0) { abiertas.splice(i, 1); atras.quitar(1) } }
  }, [])
}
function Capa({ cerrar }: { cerrar: () => void }) { useCapa(cerrar); return null }

// ------------------------------------------------------------------ diálogos y avisos
interface Pregunta { titulo: string; texto?: string; ok?: string; peligro?: boolean }
type Confirmar = (p: Pregunta) => Promise<boolean>
/** Pregunta con dos acciones además de cancelar. Devuelve cuál se eligió, o null si se canceló. */
interface Eleccion { titulo: string; texto?: string; ok: string; otro: string; cancelar?: string }
type Elegir = (p: Eleccion) => Promise<'ok' | 'otro' | null>
const DlgCtx = createContext<{ confirmar: Confirmar; elegir: Elegir; avisar: (t: string) => void }>({ confirmar: async () => false, elegir: async () => null, avisar: () => {} })
export const useDialogos = () => useContext(DlgCtx)

export function Dialogos({ children }: { children: ReactNode }) {
  const [preg, setPreg] = useState<(Pregunta & { otro?: string; cancelar?: string; res: (v: 'ok' | 'otro' | null) => void }) | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const t = useRef<number>()
  const confirmar = useCallback<Confirmar>((p) => new Promise((res) => setPreg({ ...p, res: (v) => res(v === 'ok') })), [])
  const elegir = useCallback<Elegir>((p) => new Promise((res) => setPreg({ ...p, res })), [])
  const avisar = useCallback((txt: string) => {
    setToast(txt)
    window.clearTimeout(t.current)
    t.current = window.setTimeout(() => setToast(null), 3200)
  }, [])
  const cerrar = (v: 'ok' | 'otro' | null) => { preg?.res(v); setPreg(null) }
  const valor = useMemo(() => ({ confirmar, elegir, avisar }), [confirmar, elegir, avisar])
  return (
    <DlgCtx.Provider value={valor}>
      {children}
      {preg && (
        <div className="overlay" style={{ alignItems: 'center' }} onClick={() => cerrar(null)}>
          <FondoFijo /><Capa cerrar={() => cerrar(null)} />
          <div className="dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>{preg.titulo}</h3>
            {preg.texto && <p className="small muted" style={{ margin: '8px 0 0' }}>{preg.texto}</p>}
            {preg.otro ? (
              <div className="col" style={{ marginTop: 18, gap: 8 }}>
                <button className="btn primary block" onClick={() => cerrar('ok')}>{preg.ok}</button>
                <button className="btn danger block" onClick={() => cerrar('otro')}>{preg.otro}</button>
                <button className="btn ghost block" onClick={() => cerrar(null)}>{preg.cancelar ?? 'Cancelar'}</button>
              </div>
            ) : (
              <div className="row" style={{ marginTop: 18 }}>
                <button className="btn grow" onClick={() => cerrar(null)}>Cancelar</button>
                <button className={`btn grow ${preg.peligro ? 'danger' : 'primary'}`} onClick={() => cerrar('ok')}>{preg.ok ?? 'Aceptar'}</button>
              </div>
            )}
          </div>
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </DlgCtx.Provider>
  )
}

// ------------------------------------------------------------------ piezas
export function TopBar(props: { titulo: string; sub?: string; atras?: boolean; der?: ReactNode }) {
  const nav = useNav()
  return (
    <div className="topbar">
      {props.atras && <button className="icon-btn" onClick={nav.volver} aria-label="Volver">←</button>}
      <div className="tt">
        <h1>{props.titulo}</h1>
        {props.sub && <div className="sub truncate">{props.sub}</div>}
      </div>
      {props.der}
    </div>
  )
}

/** Flecha de "esto se despliega". Va siempre a la izquierda; apunta a la derecha cerrado y hacia abajo abierto. */
export function Chevron({ abierto }: { abierto: boolean }) {
  return (
    <svg className={`chev${abierto ? ' abierto' : ''}`} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
  )
}

/**
 * Contenido que se abre y se cierra con una transición (alto y opacidad). Si ya estaba abierto al montarse, aparece sin
 * animar (volver a una pantalla). `cerrarYa`: se cierra sin animar, porque se abrió otro bloque y la pantalla se acomoda.
 */
export function Desplegable({ abierto, cerrarYa = false, children }: { abierto: boolean; cerrarYa?: boolean; children: ReactNode }) {
  const [montado, setMontado] = useState(abierto)
  const [visible, setVisible] = useState(abierto)
  useEffect(() => {
    if (abierto) {
      setMontado(true)
      let r2 = 0
      const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setVisible(true)) })
      return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2) }
    }
    setVisible(false)
    if (cerrarYa) { setMontado(false); return }
    const t = window.setTimeout(() => setMontado(false), 260)
    return () => window.clearTimeout(t)
  }, [abierto, cerrarYa])
  if (!montado || (!abierto && cerrarYa)) return null
  return <div className={`despl${visible && abierto ? ' abierto' : ''}`}><div>{children}</div></div>
}

/** Lleva la pantalla hasta que el elemento quede arriba, justo debajo de la barra superior. */
export function alinearArriba(el: HTMLElement | null): void {
  if (!el) return
  const destino = () => {
    const barra = document.querySelector('.topbar') as HTMLElement | null
    return Math.max(0, el.getBoundingClientRect().top + window.scrollY - (barra?.offsetHeight ?? 0) - 8)
  }
  window.scrollTo({ top: destino(), behavior: 'smooth' })
  // Si el bloque está al final, la página todavía no era tan larga: cuando termina de abrirse, se corrige.
  window.setTimeout(() => { if (Math.abs(window.scrollY - destino()) > 4) window.scrollTo({ top: destino(), behavior: 'smooth' }) }, 320)
}

let capas = 0
/** Mientras haya una hoja o diálogo abierto, el fondo no se desplaza. */
function useFondoFijo(): void {
  useEffect(() => {
    capas++
    document.body.classList.add('fijo')
    return () => { if (--capas <= 0) { capas = 0; document.body.classList.remove('fijo') } }
  }, [])
}
function FondoFijo() { useFondoFijo(); return null }

export function Sheet(props: { titulo: string; onCerrar: () => void; children: ReactNode; full?: boolean; accion?: ReactNode }) {
  useFondoFijo()
  useCapa(props.onCerrar)
  return (
    <div className="overlay" onClick={props.onCerrar}>
      <div className={`sheet${props.full ? ' full' : ''}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-h">
          <h3 className="grow">{props.titulo}</h3>
          {props.accion}
          <button className="icon-btn" onClick={props.onCerrar} aria-label="Cerrar">✕</button>
        </div>
        <div className="sheet-b">{props.children}</div>
      </div>
    </div>
  )
}

export function Stepper(props: { value: number | null; step: number; onChange: (v: number | null) => void; unit: string; min?: number; max?: number }) {
  const { value, step, onChange, unit, min = 0, max = 100000 } = props
  const [txt, setTxt] = useState(value == null ? '' : numES(value))
  useEffect(() => { setTxt(value == null ? '' : numES(value)) }, [value])
  const lim = (n: number) => Math.min(max, Math.max(min, Math.round(n * 1000) / 1000))
  const commit = (s: string) => {
    const limpio = s.replace(',', '.').trim()
    if (limpio === '') return onChange(null)
    const n = Number(limpio)
    if (!Number.isFinite(n)) return setTxt(value == null ? '' : numES(value))
    onChange(lim(n))
  }
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(lim((value ?? 0) - step))} aria-label={`Menos ${unit}`}>−</button>
      <div className="val">
        <input inputMode="decimal" value={txt} placeholder="—" aria-label={unit}
          onChange={(e) => setTxt(e.target.value)} onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
        <span>{unit}</span>
      </div>
      <button type="button" onClick={() => onChange(lim((value ?? 0) + step))} aria-label={`Más ${unit}`}>+</button>
    </div>
  )
}

export function Chips<T extends string | number | null>(props: {
  opciones: { v: T; t: string }[]; valor: T; onPick: (v: T) => void; sm?: boolean; wrap?: boolean
}) {
  return (
    <div className={`chips${props.wrap ? ' wrap' : ''}`}>
      {props.opciones.map((o) => (
        <button key={String(o.v)} type="button" aria-pressed={props.valor === o.v}
          className={`chip${props.sm ? ' sm' : ''}${props.valor === o.v ? ' on' : ''}`} onClick={() => props.onPick(o.v)}>
          {o.t}
        </button>
      ))}
    </div>
  )
}

/** Buscador + filtro + lista del catálogo agrupada por categoría. Lo usan la pestaña Ejercicios y el selector. */
export function Catalogo(props: { onElegir: (e: Exercise) => void; marca?: (e: Exercise) => ReactNode; onCrear?: (nombre: string) => void; pegajoso?: boolean }) {
  const ejercicios = useLiveQuery(() => db.exercises.toArray(), [])
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  const [archivo, setArchivo] = useState(false)
  const [filtros, setFiltros] = useState(false)
  const cats = useMemo(() => agruparPorCategoria(ejercicios ?? []).map((g) => g.cat), [ejercicios])
  const grupos = useMemo(() => {
    let l = ejercicios ?? []
    if (!archivo) l = l.filter((e) => !e.archivo)
    if (cat) l = l.filter((e) => categoria(e) === cat)
    return agruparPorCategoria(buscar(l, q))
  }, [ejercicios, q, cat, archivo])
  const n = grupos.reduce((t, g) => t + g.items.length, 0)
  const activo = cat != null || archivo
  return (
    <>
      <div className="col" style={props.pegajoso ? { position: 'sticky', top: 0, background: 'var(--bg)', paddingBottom: 8, zIndex: 2 } : { marginBottom: 8 }}>
        <div className="row">
          <input className="grow" placeholder="Buscar ejercicio…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar ejercicio" />
          <button className={`icon-btn${activo ? ' on' : ''}`} style={{ width: 46, height: 46 }} onClick={() => setFiltros((f) => !f)} aria-expanded={filtros} aria-label="Filtrar ejercicios">{Ico.filtro}</button>
        </div>
        {filtros && (
          <div className="card flat tight" style={{ margin: 0 }}>
            <Chips sm wrap opciones={[{ v: null, t: 'Todos' }, ...cats.map((c) => ({ v: c as string | null, t: c }))]} valor={cat} onPick={setCat} />
            <button className={`chip sm${archivo ? ' on' : ''}`} style={{ marginTop: 8 }} aria-pressed={archivo} onClick={() => setArchivo((x) => !x)}>Incluir archivados</button>
          </div>
        )}
        {(activo || q) && <div className="xsmall muted">{plural(n, 'ejercicio', 'ejercicios')}{cat ? ` · ${cat}` : ''}</div>}
      </div>
      {grupos.map((g) => (
        <div key={g.cat}>
          <h2 className="cat">{g.cat} <span>{g.items.length}</span></h2>
          <div className="list">
            {g.items.map((e) => (
              <button key={e.id} className="item" onClick={() => props.onElegir(e)}>
                <div className="grow">
                  <div className="bold" style={{ fontSize: 14.5 }}>{e.nombre}</div>
                  <div className="xsmall muted truncate">{e.legible ?? etiqueta(e.equipo)}</div>
                </div>
                {props.marca?.(e)}
              </button>
            ))}
          </div>
        </div>
      ))}
      {!n && <div className="empty">No hay ejercicios que coincidan.</div>}
      {props.onCrear && q.trim().length > 2 && !(ejercicios ?? []).some((e) => e.nombre.toLowerCase() === q.trim().toLowerCase()) && (
        <button className="btn soft block" style={{ marginTop: 10 }} onClick={() => props.onCrear!(q.trim())}>Crear «{q.trim()}»</button>
      )}
    </>
  )
}

/** Selector de ejercicios del catálogo, con alta rápida si no existe. */
export function Picker(props: { titulo: string; onElegir: (e: Exercise) => void; onCerrar: () => void; multi?: boolean; sinCrear?: boolean }) {
  const [marcados, setMarcados] = useState<number[]>([])
  const elegir = (e: Exercise) => {
    props.onElegir(e)
    if (props.multi) setMarcados((m) => [...m, e.id!]); else props.onCerrar()
  }
  const crear = async (nombre: string) => {
    const id = await crearEjercicio({ nombre })
    const e = await db.exercises.get(id)
    if (e) elegir(e)
  }
  return (
    <Sheet titulo={props.titulo} onCerrar={props.onCerrar} full
      accion={props.multi ? <button className="btn primary sm" onClick={props.onCerrar}>Listo{marcados.length ? ` · ${marcados.length}` : ''}</button> : undefined}>
      <Catalogo pegajoso onElegir={elegir} onCrear={props.sinCrear ? undefined : (n) => void crear(n)}
        marca={(e) => (marcados.includes(e.id!) ? <span className="pill pri">agregado</span> : null)} />
    </Sheet>
  )
}

/** Historial de un ejercicio: lista informativa, sin enlaces. */
export function HistorialLista({ exerciseId, lastre, cu = false, excluir }: { exerciseId: number; lastre: boolean; cu?: boolean; excluir?: number }) {
  const [hist, setHist] = useState<SesionDeEjercicio[] | null>(null)
  useEffect(() => { let v = true; void historicoEjercicio(exerciseId, 40).then((h) => { if (v) setHist(h.filter((x) => x.session_id !== excluir)) }); return () => { v = false } }, [exerciseId, excluir])
  if (!hist) return <div className="empty">Cargando…</div>
  if (!hist.length) return <div className="card flat muted small">Todavía no lo registraste.</div>
  return (
    <div className="list">
      {hist.map((s) => (
        <div key={s.session_id} className="item" style={{ alignItems: 'flex-start' }}>
          <b className="small mono" style={{ minWidth: 84 }}>{fmtFecha(s.fecha)}</b>
          <span className="grow xsmall mono">{resumenSets(s.sets, lastre, cu)}</span>
        </div>
      ))}
    </div>
  )
}

export const MAX_MEDIA_MB = 40

// Imágenes que vienen con la app: src/ejercicios-img/<slug>.webp (las arma tools/imagenes/gen.py).
const IMAGENES_INCLUIDAS = import.meta.glob('./ejercicios-img/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
/** Imagen incluida para ese ejercicio, si hay. La que carga el usuario tiene prioridad. */
export const imagenIncluida = (slug?: string | null): string | null => (slug ? IMAGENES_INCLUIDAS[`./ejercicios-img/${slug}.webp`] ?? null : null)

/** Por qué no se puede usar el archivo como video o imagen de un ejercicio, o null si sirve. */
export function problemaMedia(file: File): string | null {
  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return 'Tiene que ser una imagen o un video.'
  if (file.size > MAX_MEDIA_MB * 1048576) return `El archivo pesa ${Math.round(file.size / 1048576)} MB. El máximo es ${MAX_MEDIA_MB} MB.`
  return null
}
export async function guardarMediaDe(exerciseId: number, file: File): Promise<void> {
  await db.media.put({ exercise_id: exerciseId, tipo: file.type.startsWith('video/') ? 'video' : 'imagen', blob: file, nombre: file.name, size: file.size })
}

/** Muestra el video o la imagen del ejercicio (la propia o, si no hay, la que viene con la app) y el enlace externo si tiene. */
export function MediaView({ exerciseId, url, slug }: { exerciseId: number; url?: string | null; slug?: string | null }) {
  const incluida = imagenIncluida(slug)
  // undefined mientras carga; null si el usuario no cargó nada propio
  const m = useLiveQuery(async () => (await db.media.get(exerciseId)) ?? null, [exerciseId])
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    if (!m) { setSrc(null); return }
    const u = URL.createObjectURL(m.blob)
    setSrc(u)
    return () => URL.revokeObjectURL(u)
  }, [m])
  if (m === undefined) return null   // todavía no se sabe si hay una propia: no mostrar la incluida para después cambiarla
  if (url && !/^https?:\/\//i.test(url)) url = null   // solo enlaces web: nada de javascript: u otros esquemas
  if (!m && !url && !incluida) return null
  return (
    <div className="media">
      {m && src && (m.tipo === 'video'
        ? <video src={src} controls playsInline loop muted preload="metadata" aria-label="Video del ejercicio" />
        : <img src={src} alt="Imagen del ejercicio" />)}
      {!m && incluida && <img src={incluida} alt="Posición inicial y final del ejercicio" />}
      {url && <a className="btn soft block sm" style={{ marginTop: m || incluida ? 8 : 0 }} href={url} target="_blank" rel="noopener noreferrer">Abrir enlace del ejercicio ↗</a>}
    </div>
  )
}

export function useTieneMedia(exerciseId: number, url?: string | null, slug?: string | null): boolean {
  const n = useLiveQuery(() => db.media.where('exercise_id').equals(exerciseId).count(), [exerciseId])
  return !!n || !!url || !!imagenIncluida(slug)
}

export const Ico = {
  reloj: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>,
  filtro: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16l-6.2 7.4V18l-3.6 1.8v-7.4z" /></svg>,
  hoy: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" /></svg>,
  cal: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>,
  planes: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" /></svg>,
  ej: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h18M6 7v10M18 7v10M3.5 9.5v5M20.5 9.5v5" /></svg>,
  prog: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V5M4 19h16" /><path d="M8 15l4-5 3 3 4-6" /></svg>,
}
