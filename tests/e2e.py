"""Prueba de punta a punta de GymBro sobre la versión compilada.

Requisitos (una vez):   pip install "playwright>=1.45"  &&  playwright install chromium
Uso:                    npm run build  &&  python tests/e2e.py
                        python tests/e2e.py --capturas    (guarda capturas en tests/capturas/)

Levanta un servidor estático sobre dist/, abre la app en un móvil simulado (390x844) con la fecha
fijada en el 14-11-2026 (el historial sembrado es relativo a esa fecha) y recorre cada flujo.
Cada sección usa un navegador limpio, así que arranca con los datos iniciales.
Termina con código 1 si falla algo.
"""
import json, os, socket, subprocess, sys, time
from datetime import datetime
from playwright.sync_api import sync_playwright

RAIZ = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
DIST = os.path.join(RAIZ, 'dist')
FIX = os.path.join(RAIZ, 'tests', 'fixtures')
CAP = os.path.join(RAIZ, 'tests', 'capturas')
CAPTURAS = '--capturas' in sys.argv
HOY = datetime(2026, 11, 14, 12, 0, 0)

sys.stdout.reconfigure(encoding='utf-8')  # la consola de Windows no puede imprimir '→' en cp1252
resultados, errores = [], []

def ok(nombre, cond, extra=''):
    resultados.append((nombre, bool(cond)))
    print(('  ok   ' if cond else '  FALLA') + ' ' + nombre + (f'   [{extra}]' if extra and not cond else ''))

def puerto_libre():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

def main():
    if not os.path.isfile(os.path.join(DIST, 'index.html')):
        sys.exit('No existe dist/. Corré primero: npm run build')
    puerto = puerto_libre()
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(puerto), '--bind', '127.0.0.1', '-d', DIST],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.2)
    try:
        with sync_playwright() as pw:
            navegador = pw.chromium.launch()

            def abrir():
                ctx = navegador.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, accept_downloads=True)
                pg = ctx.new_page()
                pg.clock.set_fixed_time(HOY)
                pg.on('console', lambda m: errores.append(m.text) if m.type == 'error' else None)
                pg.on('pageerror', lambda e: errores.append('pageerror: ' + str(e)))
                pg.goto(f'http://127.0.0.1:{puerto}/', wait_until='networkidle')
                pg.wait_for_selector('.tabbar', timeout=20000)
                pg.wait_for_timeout(500)
                return ctx, pg

            def captura(pg, nombre):
                if CAPTURAS:
                    os.makedirs(CAP, exist_ok=True)
                    pg.screenshot(path=os.path.join(CAP, nombre + '.png'), full_page=True)

            def texto(pg, sel='.main'):
                return pg.inner_text(sel)

            def tab(pg, nombre):
                pg.click(f'.tabbar >> text={nombre}'); pg.wait_for_timeout(400)

            def backup(pg):
                """Exporta la copia de seguridad desde Ajustes y la devuelve como dict. Vuelve a Hoy."""
                tab(pg, 'Hoy'); pg.click('[aria-label="Ajustes"]'); pg.wait_for_timeout(200)
                with pg.expect_download() as d:
                    pg.click('text=Exportar copia')
                ruta = d.value.path()
                data = json.load(open(ruta, encoding='utf-8'))
                pg.click('[aria-label="Volver"]'); pg.wait_for_timeout(250)
                return data, ruta

            def empezar(pg):
                pg.click('text=Empezar'); pg.wait_for_timeout(250)
                pg.click('text=Saltear y empezar'); pg.wait_for_selector('.bloque'); pg.wait_for_timeout(350)

            def abrir_bloque(pg, n):
                pg.locator('.bloque-h button.row').nth(n - 1).click(); pg.wait_for_timeout(300)

            # ------------------------------------------------------------ A
            print('\nA. Datos iniciales, calendario y detalle de sesión')
            ctx, pg = abrir()
            t = texto(pg)
            ok('Hoy sugiere el Día 1 del plan activo', 'Día 1 · Búlgara + press' in t and 'Mesociclo B' in t)
            ok('Semana: 3 de 4 sesiones (lun, mar, mié importadas)', '3 de 4' in t)
            captura(pg, 'A1-hoy')
            tab(pg, 'Calendario')
            ok('Noviembre: 7 días de gym marcados', pg.locator('.cal button.gym').count() == 7, str(pg.locator('.cal button.gym').count()))
            pg.locator('.cal button', has_text='11').first.click(); pg.wait_for_timeout(300)
            ok('Tocar un día muestra qué se hizo', 'Día 6 · Peso muerto + tracción' in texto(pg))
            captura(pg, 'A2-calendario')
            pg.click('text=Día 6 · Peso muerto + tracción'); pg.wait_for_timeout(400)
            t = texto(pg)
            ok('Detalle de sesión importada', 'Peso muerto - BR' in t and 'importada' in t and 'RPE 8' in t)
            pg.click('.topbar >> text=Editar'); pg.wait_for_timeout(400)
            campo = pg.locator('.ej', has_text='Peso muerto - BR').first.locator('input').nth(1)
            campo.fill('123,5'); campo.blur(); pg.wait_for_timeout(250)
            pg.click('.topbar >> text=Listo'); pg.wait_for_timeout(400)
            ok('Editar una sesión guardada corrige un peso', '123,5 kg' in texto(pg) and pg.locator('.ej').count() == 0)
            pg.click('[aria-label="Volver"]'); pg.wait_for_timeout(300)
            pg.click('[aria-label="Mes anterior"]'); pg.wait_for_timeout(250)
            ok('Octubre: 10 días de gym', pg.locator('.cal button.gym').count() == 10, str(pg.locator('.cal button.gym').count()))
            ctx.close()

            # ------------------------------------------------------------ B
            print('\nB. Sesión con tilde por bloque')
            ctx, pg = abrir()
            antes, _ = backup(pg)
            nombres = {e['id']: e['nombre'] for e in antes['exercises']}
            dia1 = lambda d: [x for x in d['planDays'] if x['nombre'].startswith('Día 1 ·')][0]
            pg.click('text=Empezar'); pg.wait_for_timeout(250)
            ok('Wellness: primera pregunta', '¿Cómo dormiste anoche?' in texto(pg))
            captura(pg, 'B1-wellness')
            for r in ['Bien', 'Poco', 'Normal', 'Algo estresado', 'Alta']:
                pg.click(f'.well >> text="{r}"'); pg.wait_for_timeout(220)
            pg.wait_for_selector('.bloque'); pg.wait_for_timeout(350)
            ok('6 bloques, todos colapsados', pg.locator('.bloque').count() == 6 and pg.locator('.ej').count() == 0)
            ok('Flecha de desplegar a la izquierda del bloque', pg.locator('.bloque-h button.row').first.evaluate('b => b.firstElementChild.classList.contains("chev")'))
            ok('Un tilde por bloque', pg.locator('.tilde').count() == 6)
            ok('Etiquetas del bloque en su encabezado', 'movilidad cadera' in pg.locator('.bloque').first.inner_text())
            ok('Encabezado de bloque sin contador de series', 'series' not in pg.locator('.bloque').first.inner_text())
            ok('37 series del plan', 'de 37 series' in texto(pg, '.topbar'))
            captura(pg, 'B2-sesion')
            abrir_bloque(pg, 4); abrir_bloque(pg, 5)
            ok('Abrir un bloque cierra el anterior', pg.locator('.bloque-c').count() == 1 and 'Press plano' in pg.locator('.bloque-c').inner_text())
            ej = pg.locator('.ej', has_text='Press plano')
            ok('Series precargadas con el plan y editables a mano', ej.locator('input').nth(0).input_value() == '8' and ej.locator('input').nth(1).input_value() == '80')
            ok('Sesión: botón para ver la imagen incluida', ej.locator('[aria-label^="Ver video o imagen"]').count() == 1)
            ok('Sin controles de RIR/RPE/fallo en la sesión', pg.locator('.bloque-c .chip').count() == 0)
            ok('Última vez: fecha corta y texto completo, sin cortar', 'Últ. vez (10/11):' in ej.inner_text() and ej.locator('.truncate').count() == 0)
            campo = ej.locator('input').nth(1); campo.fill('82,5'); campo.blur(); pg.wait_for_timeout(250)
            ej.locator('[aria-label="Historial de Press plano"]').click(); pg.wait_for_timeout(450)
            ok('Historial en una hoja, sin enlaces', pg.locator('.sheet .item').count() >= 5 and pg.locator('.sheet button.item').count() == 0)
            ok('Con la hoja abierta el fondo no se desplaza', pg.evaluate('getComputedStyle(document.body).overflow') == 'hidden')
            captura(pg, 'B3-historial')
            pg.go_back(); pg.wait_for_timeout(400)
            ok('El botón atrás cierra la hoja, no la sesión', pg.locator('.sheet').count() == 0 and 'de 37 series' in texto(pg, '.topbar'))
            ok('Al cerrar el historial sigue el mismo bloque abierto', pg.locator('.bloque-c').count() == 1 and 'Press plano' in pg.locator('.bloque-c').inner_text())
            pg.locator('.ej', has_text='Caminata de gemelo').locator('text=Cambiar ejercicio').click(); pg.wait_for_timeout(300)
            pg.fill('.sheet [aria-label="Buscar ejercicio"]', 'gesto sprint'); pg.wait_for_timeout(300)
            pg.locator('.sheet .item').first.click(); pg.wait_for_timeout(400)
            ok('Cambiar ejercicio en la sesión', 'Gesto sprint isquios con slider' in pg.locator('.bloque-c').inner_text())
            pg.locator('.tilde').nth(4).click(); pg.wait_for_timeout(350)
            ok('El tilde marca todo el bloque', pg.locator('.bloque.listo').count() == 1 and '6 de 37 series' in texto(pg, '.topbar'))
            ok('Sin cronómetro en modo por bloque', pg.locator('.timer').count() == 0)
            pg.click('text=+ Agregar ejercicios adicionales'); pg.wait_for_timeout(400)
            ok('Selector: "Listo" en la cabecera', pg.locator('.sheet-h >> text=Listo').count() == 1)
            ok('Selector agrupado por categoría', pg.locator('.sheet h2.cat').count() >= 10)
            pg.click('.sheet [aria-label="Filtrar ejercicios"]'); pg.wait_for_timeout(200)
            pg.locator('.sheet .chip', has_text='Isquios').click(); pg.wait_for_timeout(300)
            ok('Filtro por categoría', pg.locator('.sheet h2.cat').count() == 1 and pg.locator('.sheet .item').count() == 9, str(pg.locator('.sheet .item').count()))
            captura(pg, 'B4-selector')
            pg.locator('.sheet .item', has_text='CURL NÓRDICO').click(); pg.wait_for_timeout(200)
            pg.click('.sheet-h >> text=Listo'); pg.wait_for_timeout(400)
            ok('Bloque de ejercicios adicionales', 'Ejercicios adicionales' in texto(pg) and pg.locator('.bloque').count() == 7)
            campo = pg.locator('.ej', has_text='CURL NÓRDICO').locator('input').first
            campo.fill(''); campo.blur(); pg.wait_for_timeout(200)
            pg.locator('.tilde').nth(6).click(); pg.wait_for_timeout(300)
            ok('No se puede tildar con una serie sin datos', pg.locator('.toast').count() == 1 and pg.locator('.bloque.listo').count() == 1)
            campo.fill('6'); campo.blur(); pg.wait_for_timeout(200)
            pg.locator('.tilde').nth(6).click(); pg.wait_for_timeout(300)
            pg.click('.topbar >> text=Terminar'); pg.wait_for_timeout(300)
            pg.click('[aria-label="Volver"]'); pg.wait_for_timeout(400)
            ok('Volver de otra pantalla conserva el bloque abierto', pg.locator('.bloque-c').count() == 1 and 'CURL NÓRDICO' in pg.locator('.bloque-c').inner_text())
            pg.click('.topbar >> text=Terminar'); pg.wait_for_timeout(300)
            ok('Cierre avisa las series sin marcar', 'sin marcar' in texto(pg))
            ok('"Actualizar el plan" viene desmarcado', pg.locator('.card.row').get_attribute('aria-pressed') == 'false')
            pg.click('.card.row'); pg.wait_for_timeout(150)          # caso exigente: actualizar el plan
            pg.locator('.chips .chip', has_text='7').first.click()
            captura(pg, 'B5-cierre')
            pg.click('text=Guardar sesión'); pg.wait_for_timeout(700)
            t = texto(pg)
            ok('Hoy: sesión hecha y la rotación avanza al Día 2', 'HECHO HOY' in t.upper() and 'Día 2 · Tracción + brazos' in t and '4 de 4' in t)
            ok('Tras guardar no quedan pasos viejos para el botón atrás', pg.evaluate('history.state') is None, str(pg.evaluate('history.state')))
            desp, _ = backup(pg)
            ses = [s for s in desp['sessions'] if s['origen'] == 'app'][0]
            logs = [l for l in desp['setLogs'] if l['session_id'] == ses['id']]
            ok('Se guardan solo las series tildadas (7)', len(logs) == 7 and all(l['hecha'] for l in logs), str(len(logs)))
            ok('Wellness y esfuerzo guardados', ses['wellness'] == {'sueno': 4, 'dolor': 4, 'cansancio': 3, 'estres': 4, 'energia': 4} and ses['srpe'] == 7)
            ok('La sesión guardó el ejercicio cambiado', {nombres[l['exercise_id']] for l in logs} == {'Press plano', 'Gesto sprint isquios con slider', 'CURL NÓRDICO'})
            b5a, b5d = dia1(antes)['bloques'][4]['ejercicios'], dia1(desp)['bloques'][4]['ejercicios']
            ok('El plan conserva sus ejercicios y bloques', [e['exercise_id'] for e in b5a] == [e['exercise_id'] for e in b5d] and len(dia1(desp)['bloques']) == 6)
            ok('"Actualizar el plan" solo cambió el peso editado (80 → 82,5)', b5d[0]['series'][0]['peso_g'] == 82500 and b5d[1]['series'] == b5a[1]['series'])
            ctx.close()

            # ------------------------------------------------------------ C
            print('\nC. Sesión con tilde por ejercicio y sesión libre')
            ctx, pg = abrir()
            pg.click('[aria-label="Ajustes"]'); pg.click('text=Por ejercicio'); pg.wait_for_timeout(200)
            pg.click('[aria-label="Volver"]'); pg.wait_for_timeout(250)
            empezar(pg)
            ok('Sin tilde en los bloques', pg.locator('.bloque-h .tilde').count() == 0)
            abrir_bloque(pg, 3)
            ok('Un tilde por ejercicio', pg.locator('.ej .tilde').count() == 2)
            pg.locator('.ej .tilde').first.click(); pg.wait_for_timeout(400)
            ok('Tildar un ejercicio arranca el descanso', pg.locator('.timer').count() == 1 and '3 de 37' in texto(pg, '.topbar'))
            captura(pg, 'C1-por-ejercicio')
            pg.evaluate("() => { window.__tonos = 0; const p = AudioContext.prototype.createOscillator; AudioContext.prototype.createOscillator = function () { window.__tonos++; return p.call(this) } }")
            for _ in range(12):
                if '¡A la siguiente!' in pg.inner_text('.timer'): break
                pg.click('.timer >> text=−30'); pg.wait_for_timeout(350)
            ok('Al terminar el descanso avisa y suena', '¡A la siguiente!' in pg.inner_text('.timer') and pg.evaluate('window.__tonos') == 3, pg.evaluate('window.__tonos'))
            pg.click('[aria-label="Cerrar descanso"]'); pg.click('.topbar >> text=Terminar'); pg.wait_for_timeout(300)
            pg.click('text=Descartar sesión'); pg.wait_for_timeout(300)
            ok('Diálogo propio de confirmación', pg.locator('.dialog').count() == 1)
            pg.click('.dialog button.danger'); pg.wait_for_timeout(500)
            ok('Sesión descartada: la rotación no avanza', 'Día 1 · Búlgara + press' in texto(pg))
            pg.click('text=Elegir otro día'); pg.wait_for_timeout(300)
            ok('Elegir día: lista los 6 del plan', pg.locator('.sheet .item').count() == 6)
            pg.click('text=Sesión libre, sin plan'); pg.wait_for_timeout(300); pg.click('text=Saltear y empezar'); pg.wait_for_timeout(600)
            ok('Sesión libre arranca vacía', 'Sesión vacía' in texto(pg))
            pg.go_back(); pg.wait_for_timeout(400)
            ok('Botón atrás del navegador vuelve a Hoy', 'Sesión en curso' in texto(pg))
            ctx.close()

            # ------------------------------------------------------------ D
            print('\nD. Otras actividades')
            ctx, pg = abrir()
            pg.click('text=+ Registrar otra actividad'); pg.wait_for_timeout(300)
            pg.click('.chip >> text=Pádel'); pg.locator('.chips .chip', has_text='6').first.click()
            captura(pg, 'D1-actividad')
            pg.click('text="Guardar"'); pg.wait_for_timeout(400)
            ok('Hoy lista la actividad', 'Pádel' in texto(pg))
            tab(pg, 'Calendario')
            ok('Calendario marca el día como actividad', pg.locator('.cal button.act').count() == 1)
            ok('Panel del día', 'Pádel' in texto(pg) and '60 min' in texto(pg))
            pg.locator('.cal button', has_text='12').first.click(); pg.wait_for_timeout(300)
            pg.click('text=+ Sesión de gym este día'); pg.wait_for_timeout(400)
            ok('Sesión pasada: ofrece los días del plan', pg.locator('.sheet .item').count() == 6)
            pg.locator('.sheet .item').nth(1).click(); pg.wait_for_selector('.bloque'); pg.wait_for_timeout(400)
            ok('Sesión pasada: muestra la fecha en vez del reloj', '12/11/2026' in texto(pg, '.topbar'))
            pg.locator('.tilde').nth(1).click(); pg.wait_for_timeout(350)
            pg.click('.topbar >> text=Terminar'); pg.wait_for_timeout(300)
            ok('Sesión pasada: pide la duración', '¿Cuánto duró?' in texto(pg))
            pg.click('text=Guardar sesión'); pg.wait_for_timeout(700)
            ok('Sesión pasada: como es la más nueva, la rotación avanza al Día 3', 'Día 3 · Cadera 1p + empuje' in texto(pg))
            tab(pg, 'Calendario'); pg.locator('.cal button', has_text='12').first.click(); pg.wait_for_timeout(300)
            ok('Sesión pasada: queda en su día con la duración cargada', 'Día 2 · Tracción + brazos' in texto(pg) and '60 min' in texto(pg))
            ctx.close()

            # ------------------------------------------------------------ E
            print('\nE. Planes: importar, mapear, editar')
            ctx, pg = abrir()
            ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
            tab(pg, 'Planes'); pg.click('text=Importar plan'); pg.wait_for_timeout(300)
            pg.click('text=Copiar pedido para Claude'); pg.wait_for_timeout(400)
            pedido = pg.evaluate('navigator.clipboard.readText()')
            ok('Pedido para Claude: lleva el formato y el catálogo', 'plan-gym/v1' in pedido and '"Press plano"' in pedido and '"Dominadas PRONA"' in pedido and 'Pecho:' in pedido, pedido[:200])
            pg.click('text=Pegar el plan'); pg.wait_for_timeout(200)
            plan_ok = open(os.path.join(FIX, 'plan-ok.json'), encoding='utf-8').read()
            pg.fill('[aria-label="Contenido del plan"]', 'Acá tenés tu plan:\n\n```json\n' + plan_ok + '\n```\n\n¡Éxitos!'); pg.click('text="Leer"'); pg.wait_for_timeout(500)
            ok('Pegar la respuesta del chat, con texto alrededor', 'NO ESTÁN EN LA APP · 2' in texto(pg).upper())
            pg.click('text=Elegir otro archivo'); pg.wait_for_timeout(200)
            pg.set_input_files('input[type=file]', os.path.join(FIX, 'plan-con-errores.json')); pg.wait_for_timeout(400)
            t = texto(pg)
            ok('Archivo con errores: no se importa y dice por qué', 'no se puede importar' in t and 'RIR y RPE a la vez' in t and 'falta el nombre' in t and 'necesita al menos' in t)
            pg.click('text=Elegir otro archivo'); pg.wait_for_timeout(200)
            pg.set_input_files('input[type=file]', os.path.join(FIX, 'plan-ok.json')); pg.wait_for_timeout(500)
            t = texto(pg)
            ok('Detecta 2 ejercicios desconocidos', 'NO ESTÁN EN LA APP · 2' in t.upper())
            ok('Reconoce nombres sin acentos ni mayúsculas', '3 reconocidos' in t)
            ok('Sugiere el parecido', '¿Es «Dominadas PRONA»? Vincular' in t)
            pg.click('text=¿Es «Dominadas PRONA»? Vincular'); pg.wait_for_timeout(200)
            c = pg.locator('.card', has_text='Press banca inclinado smith').first
            c.locator('[aria-label="Nombre del ejercicio nuevo"]').fill('Press inclinado en Smith')
            c.locator('select').select_option('pecho')
            captura(pg, 'E1-mapeo')
            pg.click('text="Importar plan"'); pg.wait_for_timeout(700)
            ok('Plan importado', 'Día A' in texto(pg) and 'Día B' in texto(pg))
            pg.click('text=Día A'); pg.wait_for_timeout(400)
            t = texto(pg)
            ok('El plan usa los nombres del catálogo', 'Press inclinado en Smith' in t and 'Dominadas PRONA' in t and 'Dominadas pronas' not in t)
            card = pg.locator('.card', has_text='Press inclinado en Smith')
            card.locator('[aria-label="Serie 1: RIR"]').fill('2'); card.locator('[aria-label="Serie 1: RIR"]').blur(); pg.wait_for_timeout(300)
            ok('Editor: cargar RIR borra el RPE de esa serie', card.locator('[aria-label="Serie 1: RPE"]').input_value() == '' and card.locator('[aria-label="Serie 2: RPE"]').input_value() == '8')
            card.locator('text=+ Serie').click(); pg.wait_for_timeout(300)
            ok('Editor: agregar serie', card.locator('[aria-label="Serie 4: reps"]').count() == 1)
            captura(pg, 'E2-editor')
            pg.click('text="Listo"'); pg.wait_for_timeout(300); pg.click('[aria-label="Volver"]'); pg.wait_for_timeout(300)
            ok('Dos planes; el importado quedó activo', pg.locator('.main .card').count() == 2 and 'activo' in pg.locator('.main .card').first.inner_text())
            tab(pg, 'Ejercicios')
            ok('El ejercicio creado al importar está en el catálogo', '101 en el catálogo' in texto(pg, '.topbar'))
            ctx.close()

            # ------------------------------------------------------------ F
            print('\nF. Ejercicios: alta, imagen, agrupado')
            ctx, pg = abrir()
            tab(pg, 'Ejercicios')
            ok('Categorías con acento', 'BÍCEPS' in texto(pg).upper() and 'GLÚTEO' in texto(pg).upper())
            ok('Catálogo agrupado y con filtro', pg.locator('h2.cat').count() >= 10 and pg.locator('[aria-label="Filtrar ejercicios"]').count() == 1)
            captura(pg, 'F1-ejercicios')
            pg.click('text=+ Nuevo'); pg.wait_for_timeout(300)
            pg.fill('#en', 'Sentadilla goblet'); pg.select_option('#s-grupo', 'cuadriceps'); pg.select_option('#s-equipo', 'kettlebell')
            pg.set_input_files('#em', os.path.join(FIX, 'imagen.png')); pg.wait_for_timeout(400)
            ok('Vista previa de la imagen al crear', pg.locator('.media img').count() == 1)
            pg.fill('#eu', 'youtube.com/watch?v=abc')
            pg.click('text="Guardar"'); pg.wait_for_timeout(600)
            ok('Ficha con imagen y enlace', 'Sentadilla goblet' in texto(pg) and pg.locator('.media img').count() == 1
               and pg.locator('.media a').get_attribute('href') == 'https://youtube.com/watch?v=abc')
            ok('La imagen carga', pg.evaluate("document.querySelector('.media img').naturalWidth") == 640)
            pg.reload(wait_until='networkidle'); pg.wait_for_selector('.tabbar'); pg.wait_for_timeout(400)
            tab(pg, 'Ejercicios'); pg.fill('[aria-label="Buscar ejercicio"]', 'press plano'); pg.wait_for_timeout(300)
            pg.click('.item >> text=Press plano'); pg.wait_for_timeout(500)
            ok('Ficha: gráfico de peso máximo e historial sin enlaces', pg.locator('.chart').count() == 1 and pg.locator('.main button.item').count() == 0 and '/2026' in texto(pg))
            ok('Ficha: imagen que viene con la app', pg.locator('.media img').count() == 1 and pg.locator('.media-vacio').count() == 0
               and pg.evaluate("document.querySelector('.media img').naturalWidth") == 640 and '.webp' in pg.locator('.media img').get_attribute('src'))
            pg.set_input_files('#fm', os.path.join(FIX, 'imagen.png')); pg.wait_for_timeout(500)
            ok('Ficha: la imagen propia se adjunta ahí mismo y reemplaza a la incluida', pg.locator('.media img').count() == 1
               and pg.locator('.media img').get_attribute('src').startswith('blob:') and 'HISTORIAL' in texto(pg).upper())
            pg.click('[aria-label="Volver"]'); pg.wait_for_timeout(300)
            pg.fill('[aria-label="Buscar ejercicio"]', 'remo neutro'); pg.wait_for_timeout(300); pg.locator('.item').first.click(); pg.wait_for_timeout(500)
            ok('Ficha sin imagen: recuadro para agregar una', pg.locator('.media-vacio').count() == 1 and pg.locator('.media img').count() == 0)
            captura(pg, 'F2-ficha')
            ctx.close()

            # ------------------------------------------------------------ G
            print('\nG. Progreso')
            ctx, pg = abrir()
            tab(pg, 'Progreso')
            ok('Progreso: flecha que indica que la fila se abre y sin recarga al deslizar', pg.locator('.pm').first.locator('svg.chev').count() == 1 and pg.evaluate('getComputedStyle(document.documentElement).overscrollBehaviorY') == 'none')
            ok('6 ejercicios seguidos por defecto', pg.locator('.pm').count() == 6, str(pg.locator('.pm').count()))
            captura(pg, 'G1-progreso')
            pg.locator('.pm', has_text='Press plano').click(); pg.wait_for_timeout(300)
            ok('Gráfico al tocar un ejercicio', pg.locator('.chart').count() == 1)
            antes_t = texto(pg, '.pm-d [role=status]')
            pg.locator('.chart g[style]').first.click(); pg.wait_for_timeout(200)
            ok('Tocar un punto muestra esa sesión', texto(pg, '.pm-d [role=status]') != antes_t)
            pg.click('text=Elegir ejercicios'); pg.wait_for_timeout(300)
            pg.fill('.sheet [aria-label="Buscar ejercicio"]', 'triceps'); pg.wait_for_timeout(300)
            pg.locator('.sheet .item').first.click(); pg.wait_for_timeout(300)
            pg.click('.sheet-h >> text=Listo'); pg.wait_for_timeout(300)
            ok('Agregar un ejercicio al seguimiento', pg.locator('.pm').count() == 7 and 'Triceps - PL' in texto(pg))
            pg.click('text=Elegir ejercicios'); pg.wait_for_timeout(300)
            pg.fill('.sheet [aria-label="Buscar ejercicio"]', 'fondos'); pg.wait_for_timeout(300)
            pg.locator('.sheet .item').first.click(); pg.wait_for_timeout(300)
            pg.click('.sheet-h >> text=Listo'); pg.wait_for_timeout(300)
            fila = pg.locator('.pm', has_text='Fondos').first.inner_text()
            ok('Ejercicio sin peso: se sigue por reps', 'en reps, sin peso' in fila and '12 → 12' in fila, fila)
            ok('Series por grupo muscular siempre visible', pg.locator('.hbar').count() >= 6)
            ok('A igual peso, el progreso se ve en las reps', '+4 reps' in pg.locator('.pm', has_text='Remo 1m PLANCHA ALTA').inner_text())
            ctx.close()

            # ------------------------------------------------------------ H
            print('\nH. Ajustes: tema y copia de seguridad')
            ctx, pg = abrir()
            pg.click('[aria-label="Ajustes"]'); pg.click('text=Oscuro'); pg.wait_for_timeout(300)
            ok('Tema oscuro', pg.evaluate('document.documentElement.dataset.theme') == 'oscuro')
            verde = pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--pri').trim()")
            pg.click('.chip >> text=Violeta'); pg.wait_for_timeout(300)
            violeta = pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--pri').trim()")
            ok('Paleta de colores: cambia el color principal', pg.evaluate('document.documentElement.dataset.paleta') == 'violeta' and violeta == '#a58bff' and verde == '#2fc4a2', f'{verde} {violeta}')
            captura(pg, 'H0-violeta-oscuro')
            pg.click('[aria-label="Volver"]'); pg.wait_for_timeout(200)
            data, ruta = backup(pg)
            ok('Copia: formato y contenido', data['formato'] == 'gym-log-backup/v2' and len(data['sessions']) == 29 and len(data['exercises']) == 100 and len(data['plans']) == 1)
            pg.click('[aria-label="Ajustes"]'); pg.click('text=Empezar de cero'); pg.wait_for_timeout(250)
            pg.click('.dialog button.danger'); pg.wait_for_timeout(500)
            ok('Empezar de cero borra sesiones y planes', '0' in pg.locator('.kv', has_text='Sesiones').inner_text())
            pg.set_input_files('input[type=file]', ruta); pg.wait_for_timeout(300)
            pg.click('.dialog button.danger'); pg.wait_for_timeout(700)
            ok('Restaurar la copia recupera las 29 sesiones', '29' in pg.locator('.kv', has_text='Sesiones').inner_text() and 'Copia restaurada' in texto(pg))
            pg.reload(wait_until='networkidle'); pg.wait_for_selector('.tabbar'); pg.wait_for_timeout(400)
            ok('Tras recargar persisten datos, tema y paleta', pg.evaluate('document.documentElement.dataset.theme') == 'oscuro' and pg.evaluate('document.documentElement.dataset.paleta') == 'violeta' and 'Día 1 · Búlgara + press' in texto(pg))
            ancho = pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
            ok('Sin desborde horizontal', ancho == 0, str(ancho))
            captura(pg, 'H1-oscuro')
            pg.evaluate("""() => new Promise((res, rej) => {
              const r = indexedDB.open('gym-log-v2')
              r.onerror = () => rej(r.error)
              r.onsuccess = () => {
                const d = r.result, tx = d.transaction('sessions', 'readwrite')
                for (let i = 0; i < 4; i++) tx.objectStore('sessions').add({ fecha: '2026-11-1' + i, inicio: 0, fin: 1, estado: 'completada', plan_id: null,
                  plan_day_id: null, nombre: 'Prueba', wellness: null, wellness_prom: null, srpe: null, notas: null, origen: 'app', dur_min: 30 })
                tx.oncomplete = () => { d.close(); res(true) }
                tx.onerror = () => rej(tx.error)
              }
            })""")
            pg.reload(wait_until='networkidle'); pg.wait_for_selector('.tabbar'); pg.wait_for_timeout(400)
            ok('Recordatorio tras 4 sesiones sin copia', 'Hace 4 sesiones que no hacés una copia' in texto(pg))
            captura(pg, 'H2-recordatorio')
            with pg.expect_download():
                pg.click('text=Hacer copia ahora')
            pg.wait_for_timeout(500)
            ok('Hacer la copia apaga el recordatorio', pg.locator('.banner').count() == 0)
            pg.click('[aria-label="Ajustes"]'); pg.wait_for_timeout(300)
            ok('Ajustes muestra la fecha de la última copia', '14/11/2026' in pg.locator('.kv', has_text='Última copia').inner_text())
            ctx.close()
            navegador.close()
    finally:
        srv.terminate()

    fallas = [n for n, c in resultados if not c]
    print(f'\n{len(resultados) - len(fallas)} de {len(resultados)} verificaciones correctas · {len(errores)} errores de consola')
    for e in errores[:10]:
        print('  consola:', e[:300])
    if fallas or errores:
        print('FALLARON:', *fallas, sep='\n  - ')
        sys.exit(1)

if __name__ == '__main__':
    main()
