import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, ensureSeed, getSettings, pedirPersistencia, SETTINGS_DEFAULT, type Settings } from './db'
import { atras, Dialogos, Ico, NavCtx, type Nav, type Vista } from './ui'
import { mantenerPantalla } from './lib'
import { TodayScreen, WellnessScreen } from './screens/Today'
import { CerrarScreen, SessionScreen } from './screens/Session'
import { ActivityScreen, CalendarScreen, SessionDetailScreen } from './screens/Calendar'
import { ImportScreen, PlanDayScreen, PlanScreen, PlansScreen } from './screens/Plans'
import { ExerciseFormScreen, ExerciseScreen, ExercisesScreen } from './screens/Exercises'
import { SettingsScreen } from './screens/More'
import { ProgressScreen } from './screens/Progress'

const TABS: { v: Vista['v']; t: string; i: JSX.Element }[] = [
  { v: 'hoy', t: 'Hoy', i: Ico.hoy },
  { v: 'calendario', t: 'Calendario', i: Ico.cal },
  { v: 'planes', t: 'Planes', i: Ico.planes },
  { v: 'ejercicios', t: 'Ejercicios', i: Ico.ej },
  { v: 'progreso', t: 'Progreso', i: Ico.prog },
]
const esTab = (v: Vista['v']) => TABS.some((t) => t.v === v)

export default function App() {
  const [pila, setPila] = useState<Vista[]>([{ v: 'hoy' }])
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando')
  const [settings, setSettingsLocal] = useState<Settings>(SETTINGS_DEFAULT)
  const metaSettings = useLiveQuery(() => db.meta.get('settings'), [])
  const pilaRef = useRef(pila)
  pilaRef.current = pila
  // Posición de scroll de cada pantalla apilada, para volver exactamente a donde estabas.
  const scrolls = useRef<number[]>([])
  const restaurar = useRef<number | null>(null)
  const sacar = useCallback(() => {
    setPila((p) => {
      if (p.length <= 1) return p
      restaurar.current = scrolls.current[p.length - 2] ?? 0
      scrolls.current.length = p.length - 2
      return p.slice(0, -1)
    })
  }, [])
  useEffect(() => {
    if (restaurar.current == null) return
    const y = restaurar.current
    restaurar.current = null
    let n = 0
    const t = setInterval(() => { window.scrollTo(0, y); if (Math.abs(window.scrollY - y) < 2 || ++n > 12) clearInterval(t) }, 40)
    return () => clearInterval(t)
  }, [pila])

  useEffect(() => {
    void (async () => {
      try { await ensureSeed(); void pedirPersistencia(); setEstado('listo') } catch { setEstado('error') }
    })()
  }, [])
  useEffect(() => { if (estado === 'listo') void getSettings().then(setSettingsLocal) }, [metaSettings, estado])
  useEffect(() => {
    document.documentElement.dataset.theme = settings.tema
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', settings.tema === 'oscuro' ? '#0e1412' : '#f3f5f4')
  }, [settings.tema])

  // Botón "atrás" de Android: cierra la hoja o el diálogo abierto y, si no hay, la pantalla de arriba (ver ui.tsx).
  useEffect(() => atras.escuchar(sacar), [sacar])

  const nav = useMemo<Nav>(() => ({
    ir: (v) => { atras.sumar(); scrolls.current[pilaRef.current.length - 1] = window.scrollY; setPila((p) => [...p, v]); window.scrollTo(0, 0) },
    volver: () => { if (pilaRef.current.length <= 1) return; sacar(); atras.quitar(1) },
    reemplazar: (v) => { setPila((p) => [...p.slice(0, -1), v]); window.scrollTo(0, 0) },
    raiz: (v) => { atras.quitar(pilaRef.current.length - 1); scrolls.current = []; setPila([v]); window.scrollTo(0, 0) },
  }), [sacar])

  const vista = pila[pila.length - 1]
  useEffect(() => {
    void mantenerPantalla(vista.v === 'sesion')
    return () => { void mantenerPantalla(false) }
  }, [vista.v])

  const pantalla = useCallback(() => {
    switch (vista.v) {
      case 'hoy': return <TodayScreen settings={settings} />
      case 'calendario': return <CalendarScreen />
      case 'planes': return <PlansScreen />
      case 'ejercicios': return <ExercisesScreen />
      case 'progreso': return <ProgressScreen settings={settings} />
      case 'wellness': return <WellnessScreen diaId={vista.diaId} />
      case 'sesion': return <SessionScreen settings={settings} />
      case 'cerrar': return <CerrarScreen />
      case 'sesionDetalle': return <SessionDetailScreen key={vista.id} id={vista.id} />
      case 'plan': return <PlanScreen key={vista.id} id={vista.id} />
      case 'planDia': return <PlanDayScreen key={vista.id} id={vista.id} />
      case 'importar': return <ImportScreen />
      case 'ejercicio': return <ExerciseScreen key={vista.id} id={vista.id} />
      case 'ejercicioForm': return <ExerciseFormScreen id={vista.id} />
      case 'actividad': return <ActivityScreen id={vista.id} fecha={vista.fecha} settings={settings} />
      case 'ajustes': return <SettingsScreen settings={settings} />
    }
  }, [vista, settings])

  if (estado === 'cargando') return <div className="empty" style={{ paddingTop: 120 }}>Preparando Gym Log…</div>
  if (estado === 'error') return (
    <div className="empty" style={{ paddingTop: 100 }}>
      <b>No se pudo abrir el almacenamiento de este navegador.</b><br /><br />
      La app guarda todo en el dispositivo y este entorno no lo permite. Probá abrirla en Chrome, fuera del modo incógnito.
    </div>
  )

  return (
    <NavCtx.Provider value={nav}>
      <Dialogos>
        <div className="app">
          {pantalla()}
          {esTab(vista.v) && (
            <nav className="tabbar" aria-label="Secciones">
              {TABS.map((t) => (
                <button key={t.v} className={vista.v === t.v ? 'on' : ''} aria-current={vista.v === t.v ? 'page' : undefined}
                  onClick={() => nav.raiz({ v: t.v } as Vista)}>{t.i}{t.t}</button>
              ))}
            </nav>
          )}
        </div>
      </Dialogos>
    </NavCtx.Provider>
  )
}
