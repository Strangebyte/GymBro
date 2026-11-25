"""Arma la copia de seguridad completa del dueño, para restaurar en su teléfono, sin publicar nada.

Uso:  python tools/seed/armar_copia.py privado/plan-a.json [privado/plan-b.json …]
      (requiere haber corrido `npm run seed` y Playwright con Chromium)

Qué hace:
  1. Compila la app con el historial completo (privado/seed-historial-completo.json) en lugar del de las pruebas.
  2. La abre en un navegador sin interfaz, importa cada plan con el importador de la app ("Ya tengo un plan" →
     pegar) y lo deja activo (el último importado queda como plan activo).
  3. Exporta la copia desde Ajustes, igual que en el teléfono, a privado/gymbro-copia-AAAA-MM-DD.json.
  4. Vuelve a dejar el historial de las pruebas y recompila.
Todo queda en esta PC: privado/ no se sube al repositorio.
"""
import json, os, shutil, socket, subprocess, sys, time
from datetime import date
from playwright.sync_api import sync_playwright

RAIZ = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
HIST = os.path.join(RAIZ, 'src', 'seed-historial.json')
COMPLETO = os.path.join(RAIZ, 'privado', 'seed-historial-completo.json')
RESPALDO = os.path.join(RAIZ, 'privado', 'seed-historial-pruebas.json')
SALIDA = os.path.join(RAIZ, 'privado', f'gymbro-copia-{date.today().isoformat()}.json')

def compilar():
    r = subprocess.run('npm run build', cwd=RAIZ, shell=True, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        sys.exit('No compiló:\n' + r.stdout[-2000:] + r.stderr[-2000:])

def armar(planes):
    puerto = (lambda s: (s.bind(('127.0.0.1', 0)), s.getsockname()[1], s.close())[1])(socket.socket())
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(puerto), '--bind', '127.0.0.1', '-d', os.path.join(RAIZ, 'dist')],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.2)
    errores = []
    try:
        with sync_playwright() as pw:
            nav = pw.chromium.launch()
            ctx = nav.new_context(viewport={'width': 390, 'height': 844}, accept_downloads=True)
            pg = ctx.new_page()
            pg.on('pageerror', lambda e: errores.append(str(e)))
            pg.goto(f'http://127.0.0.1:{puerto}/', wait_until='networkidle'); pg.wait_for_selector('.tabbar', timeout=30000)
            for ruta in planes:
                texto = open(ruta, encoding='utf-8').read()
                pg.click('.tabbar >> text=Planes'); pg.wait_for_timeout(300)
                pg.click('text=Importar plan'); pg.click('text=Ya tengo un plan'); pg.click('text=Pegar el plan')
                pg.fill('[aria-label="Contenido del plan"]', texto); pg.click('text="Leer"'); pg.wait_for_timeout(500)
                revision = pg.inner_text('.main')
                if 'no se puede importar' in revision or 'NO ESTÁN EN LA APP' in revision.upper():
                    sys.exit(f'El plan {os.path.basename(ruta)} no entra limpio en la app:\n' + revision[:1500])
                pg.click('text="Importar plan"'); pg.wait_for_timeout(800)
                pg.click('[aria-label="Volver"]'); pg.wait_for_timeout(300)
                print('plan importado:', os.path.basename(ruta))
            pg.click('.tabbar >> text=Hoy'); pg.wait_for_timeout(300)
            pg.click('[aria-label="Ajustes"]'); pg.wait_for_timeout(300)
            with pg.expect_download() as d:
                pg.click('text=Exportar copia')
            d.value.save_as(SALIDA)
            nav.close()
    finally:
        srv.terminate()
    if errores:
        sys.exit('Errores en la app: ' + '; '.join(errores))

if __name__ == '__main__':
    planes = [os.path.abspath(p) for p in sys.argv[1:]]
    for p in planes:
        if not os.path.exists(p): sys.exit(f'No existe {p}')
    if not os.path.exists(COMPLETO): sys.exit('Falta privado/seed-historial-completo.json: corré `npm run seed` primero.')
    shutil.copyfile(HIST, RESPALDO)
    try:
        shutil.copyfile(COMPLETO, HIST)
        compilar()
        armar(planes)
    finally:
        shutil.copyfile(RESPALDO, HIST)
        os.remove(RESPALDO)
        compilar()
    c = json.load(open(SALIDA, encoding='utf-8'))
    activos = [p['nombre'] for p in c['plans'] if p['activo']]
    print(f"copia: {os.path.relpath(SALIDA, RAIZ)} · {len(c['sessions'])} sesiones · {len(c['setLogs'])} series · "
          f"{len(c['exercises'])} ejercicios · planes: {', '.join(p['nombre'] for p in c['plans'])} (activo: {', '.join(activos)})")
