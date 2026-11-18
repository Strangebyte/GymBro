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
            ok('Detalle de sesión importada', 'Peso muerto con barra' in t and 'importada' in t and 'RPE 8' in t)
            pg.click('.topbar >> text=Editar'); pg.wait_for_timeout(400)
            campo = pg.locator('.ej', has_text='Peso muerto con barra').first.locator('input').nth(1)
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
            ok('Etiquetas del bloque en su encabezado', 'Movilidad' in pg.locator('.bloque').first.inner_text())
            ok('Encabezado de bloque sin contador de series', 'series' not in pg.locator('.bloque').first.inner_text())
            ok('37 series del plan', 'de 37 series' in texto(pg, '.topbar'))
            captura(pg, 'B2-sesion')
            abrir_bloque(pg, 4); abrir_bloque(pg, 5)
            pg.wait_for_timeout(700)
            dist = pg.evaluate("document.querySelector('[data-bloque=\"5\"]').getBoundingClientRect().top - document.querySelector('.topbar').getBoundingClientRect().bottom")
            ok('Al abrir otro bloque, la pantalla lo deja arriba, debajo de la barra', 0 <= dist <= 20, str(dist))
            ok('Abrir un bloque cierra el anterior', pg.locator('.bloque-c').count() == 1 and 'Press de banca con barra' in pg.locator('.bloque-c').inner_text())
            ej = pg.locator('.ej', has_text='Press de banca con barra')
            ok('Series precargadas con el plan y editables a mano', ej.locator('input').nth(0).input_value() == '8' and ej.locator('input').nth(1).input_value() == '80')
            ok('Sesión: botón para ver la imagen incluida', ej.locator('[aria-label^="Ver video o imagen"]').count() == 1)
            gem = pg.locator('.ej', has_text='Caminata en puntas de pie')
            ok('Dos pesas: la tabla dice «kg c/u» solo en los ejercicios con dos mancuernas', 'KG C/U' in gem.inner_text().upper() and 'kg c/u' in gem.inner_text() and 'C/U' not in ej.inner_text().upper())
            ok('Sin controles de RIR/RPE/fallo en la sesión', pg.locator('.bloque-c .chip').count() == 0)
            ok('Última vez: fecha corta y texto completo, sin cortar', 'Últ. vez (10/11):' in ej.inner_text() and ej.locator('.truncate').count() == 0)
            campo = ej.locator('input').nth(1); campo.fill('82,5'); campo.blur(); pg.wait_for_timeout(250)
            ej.locator('[aria-label="Historial de Press de banca con barra"]').click(); pg.wait_for_timeout(450)
            ok('Historial en una hoja, sin enlaces', pg.locator('.sheet .item').count() >= 5 and pg.locator('.sheet button.item').count() == 0)
            ok('Con la hoja abierta el fondo no se desplaza', pg.evaluate('getComputedStyle(document.body).overflow') == 'hidden')
            captura(pg, 'B3-historial')
            pg.go_back(); pg.wait_for_timeout(400)
            ok('El botón atrás cierra la hoja, no la sesión', pg.locator('.sheet').count() == 0 and 'de 37 series' in texto(pg, '.topbar'))
            ok('Al cerrar el historial sigue el mismo bloque abierto', pg.locator('.bloque-c').count() == 1 and 'Press de banca con barra' in pg.locator('.bloque-c').inner_text())
            pg.locator('.ej', has_text='Caminata en puntas de pie').locator('text=Cambiar ejercicio').click(); pg.wait_for_timeout(300)
            pg.fill('.sheet [aria-label="Buscar ejercicio"]', 'gesto de sprint con slider'); pg.wait_for_timeout(300)
            pg.locator('.sheet .item').first.click(); pg.wait_for_timeout(400)
            ok('Cambiar ejercicio en la sesión', 'Curl de isquiotibiales con deslizadores, en gesto de sprint' in pg.locator('.bloque-c').inner_text())
            pg.locator('.tilde').nth(4).click(); pg.wait_for_timeout(350)
            ok('El tilde marca todo el bloque', pg.locator('.bloque.listo').count() == 1 and '6 de 37 series' in texto(pg, '.topbar'))
            ok('Sin cronómetro en modo por bloque', pg.locator('.timer').count() == 0)
            pg.click('text=+ Agregar ejercicios adicionales'); pg.wait_for_timeout(400)
            ok('Selector: "Listo" en la cabecera', pg.locator('.sheet-h >> text=Listo').count() == 1)
            ok('Selector agrupado por categoría', pg.locator('.sheet h2.cat').count() >= 10)
            pg.click('.sheet [aria-label="Filtrar ejercicios"]'); pg.wait_for_timeout(200)
            pg.locator('.sheet .chip', has_text='Isquiotibiales').click(); pg.wait_for_timeout(300)
            ok('Filtro por categoría', pg.locator('.sheet h2.cat').count() == 1 and pg.locator('.sheet .item').count() == 13, str(pg.locator('.sheet .item').count()))
            captura(pg, 'B4-selector')
            pg.locator('.sheet .item', has_text='Curl nórdico de isquiotibiales').click(); pg.wait_for_timeout(200)
            pg.click('.sheet-h >> text=Listo'); pg.wait_for_timeout(400)
            ok('Bloque de ejercicios adicionales', 'Ejercicios adicionales' in texto(pg) and pg.locator('.bloque').count() == 7)
            campo = pg.locator('.ej', has_text='Curl nórdico de isquiotibiales').locator('input').first
            campo.fill(''); campo.blur(); pg.wait_for_timeout(200)
            pg.locator('.tilde').nth(6).click(); pg.wait_for_timeout(300)
            ok('No se puede tildar con una serie sin datos', pg.locator('.toast').count() == 1 and pg.locator('.bloque.listo').count() == 1)
            campo.fill('6'); campo.blur(); pg.wait_for_timeout(200)
            pg.locator('.tilde').nth(6).click(); pg.wait_for_timeout(300)
            pg.click('.topbar >> text=Terminar'); pg.wait_for_timeout(300)
            pg.click('[aria-label="Volver"]'); pg.wait_for_timeout(400)
            ok('Volver de otra pantalla conserva el bloque abierto', pg.locator('.bloque-c').count() == 1 and 'Curl nórdico de isquiotibiales' in pg.locator('.bloque-c').inner_text())
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
            ok('La sesión guardó el ejercicio cambiado', {nombres[l['exercise_id']] for l in logs} == {'Press de banca con barra', 'Curl de isquiotibiales con deslizadores, en gesto de sprint', 'Curl nórdico de isquiotibiales'})
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
            ok('Importar: primero pregunta si ya tenés un plan o querés que una IA lo arme', 'Ya tengo un plan' in texto(pg) and 'Quiero que una IA me arme un plan' in texto(pg) and pg.locator('text=Elegir archivo').count() == 0)
            pg.click('text=Ya tengo un plan'); pg.wait_for_timeout(300)
            pg.click('text=Copiar pedido para la IA'); pg.wait_for_timeout(400)
            pedido = pg.evaluate('navigator.clipboard.readText()')
            ok('Ya tengo un plan: archivo .json o pedido para que una IA lo pase sin cambiarlo', pg.locator('text=Elegir archivo').count() == 1 and 'sin cambiarlo' in pedido and '"Press de banca con barra"' in pedido and 'plan-gym/v1' in pedido, pedido[:200])
            pg.click('text=Elegir otra opción'); pg.wait_for_timeout(200); pg.click('text=Quiero que una IA me arme un plan'); pg.wait_for_timeout(300)
            pg.click('text=Copiar pedido para la IA'); pg.wait_for_timeout(400)
            pedido = pg.evaluate('navigator.clipboard.readText()')
            ok('Pedido para armar un plan: lleva el formato y el catálogo', 'armes un plan' in pedido and pg.locator('text=Elegir archivo').count() == 1 and 'plan-gym/v1' in pedido and '"Press de banca con barra"' in pedido and '"Dominadas PRONA"' in pedido and 'Pecho:' in pedido, pedido[:200])
            pg.click('text=Pegar el plan'); pg.wait_for_timeout(200)
            plan_ok = open(os.path.join(FIX, 'plan-ok.json'), encoding='utf-8').read()
            pg.fill('[aria-label="Contenido del plan"]', 'Acá tenés tu plan:\n\n```json\n' + plan_ok + '\n```\n\n¡Éxitos!'); pg.click('text="Leer"'); pg.wait_for_timeout(500)
            ok('Pegar la respuesta del chat, con texto alrededor', 'NO ESTÁN EN LA APP · 2' in texto(pg).upper())
            pg.click('text=Elegir otro archivo'); pg.wait_for_timeout(200)
            pg.click('text=Pegar el plan'); pg.wait_for_timeout(200)
            pg.fill('[aria-label="Contenido del plan"]', '{"formato":"plan-gym/v1","dias":[{"nombre":"D","bloques":[{"ejercicios":[{"ejercicio":"Curl araña","grupo":"Bíceps","series":3,"reps":12},{"ejercicio":"PRESS PLANO.","series":3,"reps":8}]}]}]}')
            pg.click('text="Leer"'); pg.wait_for_timeout(500)
            ok('Ejercicio nuevo: toma el músculo que trae el archivo', pg.locator('.card', has_text='Curl araña').first.locator('select').input_value() == 'biceps' and 'NO ESTÁN EN LA APP · 1' in texto(pg).upper())
            pg.click('text=Elegir otro archivo'); pg.wait_for_timeout(200)
            pg.set_input_files('input[type=file]', os.path.join(FIX, 'plan-con-errores.json')); pg.wait_for_timeout(400)
            t = texto(pg)
            ok('Archivo con errores: no se importa y dice por qué', 'no se puede importar' in t and 'RIR y RPE a la vez' in t and 'falta el nombre' in t and 'necesita al menos' in t)
            pg.click('text=Elegir otro archivo'); pg.wait_for_timeout(200)
            pg.set_input_files('input[type=file]', os.path.join(FIX, 'plan-ok.json')); pg.wait_for_timeout(500)
            t = texto(pg)
            ok('Detecta 2 ejercicios desconocidos', 'NO ESTÁN EN LA APP · 2' in t.upper())
            ok('Reconoce nombres sin acentos ni mayúsculas', '3 reconocidos' in t)
            ok('Sugiere el parecido', '¿Es «Dominadas con agarre prono»? Vincular' in t)
            pg.click('text=¿Es «Dominadas con agarre prono»? Vincular'); pg.wait_for_timeout(200)
            c = pg.locator('.card', has_text='Press banca inclinado smith').first
            c.locator('[aria-label="Nombre del ejercicio nuevo"]').fill('Press inclinado en Smith')
            c.locator('select').select_option('pecho')
            c.locator('text=Crear nuevo').click(); pg.wait_for_timeout(200)
            ok('Mapeo: tocar "Crear nuevo" no borra el nombre ya editado', c.locator('[aria-label="Nombre del ejercicio nuevo"]').input_value() == 'Press inclinado en Smith' and c.locator('select').input_value() == 'pecho')
            c.locator('text=Vincular a existente').click(); pg.wait_for_timeout(300)
            pg.fill('.sheet [aria-label="Buscar ejercicio"]', 'ejercicio inventado'); pg.wait_for_timeout(300)
            ok('Mapeo: el selector de vincular no crea ejercicios', pg.locator('.sheet >> text=Crear «').count() == 0)
            pg.fill('.sheet [aria-label="Buscar ejercicio"]', 'press inclinado'); pg.wait_for_timeout(300); pg.locator('.sheet .item').first.click(); pg.wait_for_timeout(400)
            c.locator('text=Crear nuevo').click(); pg.wait_for_timeout(200)
            ok('Mapeo: de vincular a crear recupera lo escrito', c.locator('[aria-label="Nombre del ejercicio nuevo"]').input_value() == 'Press inclinado en Smith')
            captura(pg, 'E1-mapeo')
            pg.click('text="Importar plan"'); pg.wait_for_timeout(700)
            ok('Plan importado', 'Día A' in texto(pg) and 'Día B' in texto(pg))
            pg.click('text=Día A'); pg.wait_for_timeout(400)
            t = texto(pg)
            ok('Editor: el bloque cerrado muestra grupos y equipamiento, como en la sesión', 'Pecho · Espalda · Core' in pg.locator('.bloque').nth(1).inner_text() and 'Press inclinado en Smith' not in t)
            ok('Editor de día: bloques colapsados, con los ejercicios a la vista en el encabezado', pg.locator('.bloque').count() == 2 and pg.locator('.ed-serie').count() == 0)
            pg.locator('.bloque-h button.row').nth(0).click(); pg.wait_for_timeout(250); pg.locator('.bloque-h button.row').nth(1).click(); pg.wait_for_timeout(300)
            ok('Editor de día: abrir un bloque cierra el otro', pg.locator('.bloque-c').count() == 1 and pg.locator('.ej').count() == 3 and 'Hollow' in pg.locator('.bloque-c').inner_text())
            t = pg.locator('.bloque-c').inner_text()
            ok('El plan usa los nombres del catálogo', 'Press inclinado en Smith' in t and 'Dominadas con agarre prono' in t and 'Dominadas agarre prono' not in t)
            card = pg.locator('.ej', has_text='Press inclinado en Smith')
            card.locator('[aria-label="Serie 1: RIR"]').fill('2'); card.locator('[aria-label="Serie 1: RIR"]').blur(); pg.wait_for_timeout(300)
            ok('Editor: cargar RIR borra el RPE de esa serie', card.locator('[aria-label="Serie 1: RPE"]').input_value() == '' and card.locator('[aria-label="Serie 2: RPE"]').input_value() == '8')
            card.locator('text=+ Serie').click(); pg.wait_for_timeout(300)
            ok('Editor: agregar serie', card.locator('[aria-label="Serie 4: reps"]').count() == 1)
            captura(pg, 'E2-editor')
            abrir2 = lambda: (pg.click('text=Día A'), pg.wait_for_timeout(400), pg.locator('.bloque-h button.row').nth(1).click(), pg.wait_for_timeout(300))
            ok('Editor: botón Guardar arriba a la derecha y ya no hay "Listo"', pg.locator('.topbar >> text=Guardar').count() == 1 and pg.locator('text="Listo"').count() == 0)
            pg.click('[aria-label="Volver"]'); pg.wait_for_timeout(300)
            ok('Salir con cambios sin guardar: pregunta qué hacer', pg.locator('.dialog').count() == 1 and '¿Guardar los cambios?' in pg.inner_text('.dialog') and 'Salir sin guardar' in pg.inner_text('.dialog'))
            pg.click('.dialog >> text=Seguir editando'); pg.wait_for_timeout(300)
            ok('"Seguir editando" deja todo como estaba', pg.locator('.dialog').count() == 0 and card.locator('[aria-label="Serie 4: reps"]').count() == 1)
            pg.go_back(); pg.wait_for_timeout(400)
            ok('El botón atrás del teléfono también pregunta', pg.locator('.dialog').count() == 1)
            pg.click('.dialog >> text=Salir sin guardar'); pg.wait_for_timeout(400)
            abrir2()
            card = pg.locator('.ej', has_text='Press inclinado en Smith')
            ok('"Salir sin guardar" descarta los cambios', card.locator('[aria-label="Serie 4: reps"]').count() == 0 and card.locator('[aria-label="Serie 1: RIR"]').input_value() == '' and card.locator('[aria-label="Serie 1: RPE"]').input_value() == '8')
            card.locator('[aria-label="Serie 1: RIR"]').fill('2'); card.locator('text=+ Serie').click(); pg.wait_for_timeout(300)
            pg.fill('#dn', 'Día A editado')
            pg.click('.topbar >> text=Guardar'); pg.wait_for_timeout(500)
            ok('"Guardar" vuelve al plan con el día renombrado', 'Día A editado' in texto(pg) and 'Exportar a archivo' in texto(pg))
            pg.click('text=Día A editado'); pg.wait_for_timeout(400); pg.locator('.bloque-h button.row').nth(1).click(); pg.wait_for_timeout(300)
            card = pg.locator('.ej', has_text='Press inclinado en Smith')
            ok('"Guardar" conserva los cambios', card.locator('[aria-label="Serie 4: reps"]').count() == 1 and card.locator('[aria-label="Serie 1: RIR"]').input_value() == '2')
            pg.click('[aria-label="Volver"]'); pg.wait_for_timeout(300)
            ok('Sin cambios, salir no pregunta nada', pg.locator('.dialog').count() == 0 and 'Exportar a archivo' in texto(pg))
            pg.click('[aria-label="Volver"]'); pg.wait_for_timeout(300)
            ok('Dos planes; el importado quedó activo', pg.locator('.main .card').count() == 2 and 'activo' in pg.locator('.main .card').first.inner_text())
            tab(pg, 'Ejercicios')
            ok('El ejercicio creado al importar está en el catálogo', '156 en el catálogo' in texto(pg, '.topbar'))
            ctx.close()

            # ------------------------------------------------------------ F
            print('\nF. Ejercicios: alta, imagen, agrupado')
            ctx, pg = abrir()
            tab(pg, 'Ejercicios')
            ok('Grupos unificados en el catálogo', 'HOMBROS' in texto(pg).upper() and 'ESPALDA' in texto(pg).upper() and 'DORSAL' not in texto(pg).upper() and 'HOMBRO ANTERIOR' not in texto(pg).upper())
            ok('Categorías con acento', 'BÍCEPS' in texto(pg).upper() and 'GLÚTEO' in texto(pg).upper())
            ok('Catálogo agrupado y con filtro', pg.locator('h2.cat').count() >= 10 and pg.locator('[aria-label="Filtrar ejercicios"]').count() == 1)
            captura(pg, 'F1-ejercicios')
            pg.click('text=+ Nuevo'); pg.wait_for_timeout(300)
            pg.fill('#en', 'Sentadilla zercher'); pg.select_option('#s-grupo', 'cuadriceps'); pg.select_option('#s-equipo', 'kettlebell')
            pg.set_input_files('#em', os.path.join(FIX, 'imagen.png')); pg.wait_for_timeout(400)
            ok('Vista previa de la imagen al crear', pg.locator('.media img').count() == 1)
            pg.fill('#eu', 'youtube.com/watch?v=abc')
            pg.click('text="Guardar"'); pg.wait_for_timeout(600)
            ok('Ficha con imagen y enlace', 'Sentadilla zercher' in texto(pg) and pg.locator('.media img').count() == 1
               and pg.locator('.media a').get_attribute('href') == 'https://youtube.com/watch?v=abc')
            ok('La imagen carga', pg.evaluate("document.querySelector('.media img').naturalWidth") == 640)
            pg.reload(wait_until='networkidle'); pg.wait_for_selector('.tabbar'); pg.wait_for_timeout(400)
            tab(pg, 'Ejercicios'); pg.fill('[aria-label="Buscar ejercicio"]', 'press de banca con barra'); pg.wait_for_timeout(300)
            pg.click('.item >> text=Press de banca con barra'); pg.wait_for_timeout(500)
            ok('Ficha: gráfico de peso máximo e historial sin enlaces', pg.locator('.chart').count() == 1 and pg.locator('.main button.item').count() == 0 and '/2026' in texto(pg))
            pg.wait_for_function("document.querySelector('.media img')?.naturalWidth > 0", timeout=5000)   # esperar a que cargue
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
            tab(pg, 'Progreso'); pg.wait_for_selector('.pm', timeout=8000)   # calcula sobre todo el historial: puede tardar
            ok('Progreso: flecha que indica que la fila se abre y sin recarga al deslizar', pg.locator('.pm').first.locator('svg.chev').count() == 1 and pg.evaluate('getComputedStyle(document.documentElement).overscrollBehaviorY') == 'none')
            ok('6 ejercicios seguidos por defecto', pg.locator('.pm').count() == 6, str(pg.locator('.pm').count()))
            captura(pg, 'G1-progreso')
            pg.locator('.pm', has_text='Press de banca con barra').click(); pg.wait_for_timeout(300)
            ok('Gráfico al tocar un ejercicio', pg.locator('.chart').count() == 1)
            antes_t = texto(pg, '.pm-d [role=status]')
            pg.locator('.chart g[style]').first.click(); pg.wait_for_timeout(200)
            ok('Tocar un punto muestra esa sesión', texto(pg, '.pm-d [role=status]') != antes_t)
            pg.click('text=Elegir ejercicios'); pg.wait_for_timeout(300)
            pg.fill('.sheet [aria-label="Buscar ejercicio"]', 'extension de triceps en polea'); pg.wait_for_timeout(300)
            pg.locator('.sheet .item').first.click(); pg.wait_for_timeout(300)
            pg.click('.sheet-h >> text=Listo'); pg.wait_for_timeout(300)
            ok('Agregar un ejercicio al seguimiento', pg.locator('.pm').count() == 7 and 'Extensión de tríceps en polea' in texto(pg))
            pg.click('text=Elegir ejercicios'); pg.wait_for_timeout(300)
            pg.fill('.sheet [aria-label="Buscar ejercicio"]', 'fondos en paralelas'); pg.wait_for_timeout(300)
            pg.locator('.sheet .item').first.click(); pg.wait_for_timeout(300)
            pg.click('.sheet-h >> text=Listo'); pg.wait_for_timeout(300)
            fila = pg.locator('.pm', has_text='Fondos en paralelas').first.inner_text()
            ok('Ejercicio sin peso: se sigue por reps', 'en reps, sin peso' in fila and '12 → 12' in fila, fila)
            ok('Series por grupo muscular siempre visible', pg.locator('.hbar').count() >= 6)
            ok('A igual peso, el progreso se ve en las reps', '+4 reps' in pg.locator('.pm', has_text='Remo a un brazo en plancha alta con KB').inner_text())
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
            ok('Copia: formato y contenido', data['formato'] == 'gym-log-backup/v2' and len(data['sessions']) == 29 and len(data['exercises']) == 155 and len(data['plans']) == 1)
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
            # ------------------------------------------------------------ I
            print('\nI. Actualización del catálogo sobre datos viejos')
            vieja = os.path.join(RAIZ, 'privado', 'gym-log-historial.json')     # copia hecha con el catálogo original (100 ejercicios)
            antes = json.load(open(vieja, encoding='utf-8'))
            ctx, pg = abrir()
            pg.click('[aria-label="Ajustes"]'); pg.wait_for_timeout(200)
            pg.set_input_files('input[type=file]', vieja); pg.wait_for_timeout(300)
            pg.click('.dialog button.danger'); pg.wait_for_timeout(1500)
            pg.click('[aria-label="Volver"]'); pg.wait_for_timeout(200)
            desp, _ = backup(pg)
            ids = {e['id'] for e in desp['exercises']}
            porSlug = {e['slug']: e for e in desp['exercises']}
            ok('Catálogo viejo → nuevo: 155 ejercicios y la revisión anotada', len(desp['exercises']) == 155 and [m['value'] for m in desp['meta'] if m['key'] == 'catalogo'] == [6], str(len(desp['exercises'])))
            viejo = {e['slug']: e['id'] for e in antes['exercises']}
            n_borradas = sum(1 for l in antes['setLogs'] if l['exercise_id'] == viejo['rebote-y-freno'])
            ok('Solo se pierden las series del ejercicio que el dueño pidió borrar del todo', len(antes['setLogs']) == 1087 and n_borradas == 3 and len(desp['setLogs']) == 1087 - n_borradas and len(desp['sessions']) == 29, f"{len(desp['setLogs'])} {n_borradas}")
            ok('Ninguna serie ni plan apunta a un ejercicio inexistente', all(l['exercise_id'] in ids for l in desp['setLogs'])
               and all(x['exercise_id'] in ids for d in desp['planDays'] for b in d['bloques'] for x in b['ejercicios']))
            n_antes = sum(1 for l in antes['setLogs'] if l['exercise_id'] in (viejo['carpas-dinamico'], viejo['carpa-2p']))
            n_desp = sum(1 for l in desp['setLogs'] if l['exercise_id'] == porSlug['carpa-2p']['id'])
            ok('Ejercicios fusionados: el historial pasa al que queda', 'carpas-dinamico' not in porSlug and n_antes == n_desp > 0, f'{n_antes} {n_desp}')
            ok('Nombres nuevos, el viejo queda como alias, y los clásicos agregados', porSlug['press-plano']['nombre'] == 'Press de banca con barra'
               and 'Press plano' in porSlug['press-plano']['alias'] and 'camilla-de-cuadriceps' in porSlug and porSlug['press-plano']['id'] == viejo['press-plano'])
            pesos = lambda d, slug: sorted({l['peso_g'] for l in d['setLogs'] if l['exercise_id'] == {e['slug']: e['id'] for e in d['exercises']}[slug] and l['peso_g']})
            ok('Los pesos del historial quedan como estaban (sin dividir)', pesos(antes, 'biceps-mc') == pesos(desp, 'biceps-mc') == [40000] and pesos(desp, 'caminata-de-gemelo-mc') == [52000, 56000], str(pesos(desp, 'caminata-de-gemelo-mc')))
            ok('Dos pesas marcado en los ejercicios ya guardados', porSlug['biceps-mc'].get('dos_pesas') is True and not porSlug['sentadilla-goblet'].get('dos_pesas') and porSlug['press-arnold'].get('dos_pesas') is True and porSlug['sentadilla-salto-kb'].get('dos_pesas') is True)
            ok('Sin archivados de fábrica; los dos ejercicios retirados ya no están', not [e for e in desp['exercises'] if e['archivo']] and 'remo-tandem-en-puntas' not in porSlug and 'rebote-y-freno' not in porSlug)
            viejos = {'dorsal', 'trapecio', 'hombro_anterior', 'hombro_lateral', 'hombro_posterior', 'isquios', 'aductores', 'gemelo', 'full_body', 'movilidad_cadera'}
            ok('Grupos y patrones unificados en los datos ya guardados', not any(e['grupo'] in viejos or e['patron'].startswith('core_') or e['patron'] == 'locomocion' or any(x['grupo'] in viejos for x in e['sec']) for e in desp['exercises'])
               and porSlug['press-militar-br']['grupo'] == 'hombros' and porSlug['dominadas-prona']['grupo'] == 'espalda' and porSlug['hiperextensiones-lumbares']['grupo'] == 'lumbares')
            ctx.close()
            # ------------------------------------------------------------ J
            print('\nJ. Pesos en libras')
            ctx, pg = abrir()
            pg.click('[aria-label="Ajustes"]'); pg.wait_for_timeout(200)
            pg.click('text=Libras (lb)'); pg.wait_for_timeout(300)
            pg.click('[aria-label="Volver"]'); pg.wait_for_timeout(250)
            empezar(pg); abrir_bloque(pg, 5)
            ej = pg.locator('.ej', has_text='Press de banca con barra')
            ok('Libras: la tabla de la sesión dice lb y convierte (80 kg = 176,37 lb)', 'LB' in ej.inner_text().upper() and ej.locator('input').nth(1).input_value() == '176,37'
               and '(10/11): 8r · 176,37 lb' in ej.inner_text(), ej.locator('input').nth(1).input_value())
            ej.locator('input').nth(1).focus(); ej.locator('input').nth(1).blur()          # pasar por el campo sin tocarlo
            campo = ej.locator('input').nth(3); campo.fill('200'); campo.blur(); pg.wait_for_timeout(300)
            pg.click('[aria-label="Volver"]'); pg.wait_for_timeout(300)
            data, _ = backup(pg)
            ses = [s for s in data['sessions'] if s['estado'] == 'en_curso'][0]
            press = {l['serie']: l['peso_g'] for l in data['setLogs'] if l['session_id'] == ses['id'] and l['peso_g'] in (80000, 82500, 90718, 85000)}
            ok('Libras: se guarda en gramos; pasar por un campo sin cambiarlo no altera el peso', press.get(1) == 80000 and press.get(2) == 90718, str(press))
            tab(pg, 'Progreso'); pg.locator('.pm', has_text='Press de banca con barra').click(); pg.wait_for_timeout(300)
            ok('Libras: Progreso muestra libras', 'lb' in pg.locator('.pm', has_text='Press de banca con barra').inner_text() and ' lb' in texto(pg, '.pm-d [role=status]'))
            tab(pg, 'Planes'); pg.click('text=Importar plan'); pg.click('text=Quiero que una IA me arme un plan'); pg.wait_for_timeout(200)
            ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
            pg.click('text=Copiar pedido para la IA'); pg.wait_for_timeout(300)
            ok('Libras: el pedido para la IA pide los pesos convertidos a kilos', 'Yo uso libras' in pg.evaluate('navigator.clipboard.readText()'))
            ctx.close()
            # ------------------------------------------------------------ K
            print('\nK. Técnicas: myo-reps, rest-pause y drop set')
            ctx, pg = abrir()
            tab(pg, 'Planes'); pg.click('text=Importar plan'); pg.click('text=Ya tengo un plan'); pg.click('text=Pegar el plan'); pg.wait_for_timeout(200)
            malo = '{"formato":"plan-gym/v1","dias":[{"nombre":"D","bloques":[{"ejercicios":[{"ejercicio":"Press plano","series":[{"reps":8,"tecnica":"superserie"}]}]}]}]}'
            pg.fill('[aria-label="Contenido del plan"]', malo); pg.click('text="Leer"'); pg.wait_for_timeout(400)
            ok('Archivo con una técnica desconocida: no se importa y dice por qué', 'técnica "superserie" desconocida' in texto(pg))
            pg.click('text=Elegir otro archivo'); pg.wait_for_timeout(200)
            bueno = ('{"formato":"plan-gym/v1","plan":{"nombre":"Plan técnicas"},"dias":[{"nombre":"Día T","bloques":[{"orden":1,"ejercicios":['
                     '{"ejercicio":"Press plano","series":[{"reps":8,"peso_kg":80},{"reps":10,"peso_kg":70,"tecnica":"drop","bajadas":2,"baja_pct":20}]},'
                     '{"ejercicio":"Curl de bíceps con mancuernas","series":[{"reps":15,"peso_kg":10,"tecnica":"myo","mini_series":3,"reps_mini":5}]}]}]}]}')
            pg.fill('[aria-label="Contenido del plan"]', bueno); pg.click('text="Leer"'); pg.wait_for_timeout(400)
            t = texto(pg)
            ok('Importar: lee las técnicas del archivo', 'Drop ×2 −20%' in t and 'Myo 3×5' in t and 'NO ESTÁN EN LA APP' not in t.upper(), t[-300:])
            pg.click('text="Importar plan"'); pg.wait_for_timeout(600)
            pg.click('text=Día T'); pg.wait_for_timeout(500)
            ok('Editor: la serie muestra su técnica', pg.locator('.ed-serie .chip', has_text='Drop').count() == 1 and pg.locator('.ed-serie .chip', has_text='Myo').count() == 1)
            pg.locator('.ej', has_text='Curl de bíceps').locator('[aria-label="Serie 1: fallo y técnica"]').click(); pg.wait_for_timeout(300)
            pg.locator('.sheet .chip', has_text='Rest-pause').click(); pg.wait_for_timeout(200)
            ok('Panel de técnica: explica y pide las pausas', 'Pausas' in texto(pg, '.sheet') and 'descansás 10 a 20 segundos' in texto(pg, '.sheet'))
            pg.click('.sheet-h >> text=Listo'); pg.wait_for_timeout(300)
            ok('Editor: la técnica cambió a rest-pause', pg.locator('.ed-serie .chip', has_text='RP').count() == 1)
            pg.click('.topbar >> text=Guardar'); pg.wait_for_timeout(400); pg.click('[aria-label="Volver"]'); pg.wait_for_timeout(300)
            tab(pg, 'Hoy'); empezar(pg); abrir_bloque(pg, 1)
            press = pg.locator('.ej', has_text='Press de banca con barra'); curl = pg.locator('.ej', has_text='Curl de bíceps')
            ok('Sesión: el objetivo muestra la técnica', 'Drop ×2 −20%' in press.inner_text() and 'RP ×2' in curl.inner_text())
            p1 = press.locator('[aria-label="Press de banca con barra, serie 2, bajada 1: peso"]')
            ok('Drop set: sugiere el peso de cada bajada (70 kg − 20% = 56)', p1.get_attribute('placeholder') == '56')
            p1.fill('55'); press.locator('[aria-label="Press de banca con barra, serie 2, bajada 1: reps"]').fill('8')
            press.locator('[aria-label="Press de banca con barra, serie 2, bajada 2: peso"]').fill('45')
            press.locator('[aria-label="Press de banca con barra, serie 2, bajada 2: reps"]').fill('6')
            curl.locator('[aria-label="Curl de bíceps con mancuernas, serie 1, pausa 1: reps"]').fill('4')
            curl.locator('[aria-label="Curl de bíceps con mancuernas, serie 1, pausa 2: reps"]').fill('3')
            curl.locator('[aria-label="Agregar otra pausa a la serie 1"]').click(); pg.wait_for_timeout(400)
            curl.locator('[aria-label="Curl de bíceps con mancuernas, serie 1, pausa 3: reps"]').fill('2')
            curl.locator('[aria-label="Curl de bíceps con mancuernas, serie 1, pausa 3: reps"]').blur(); pg.wait_for_timeout(400)
            pg.locator('.bloque-h .tilde').first.click(); pg.wait_for_timeout(300)
            pg.click('.topbar >> text=Terminar'); pg.wait_for_timeout(300); pg.click('text=Guardar sesión'); pg.wait_for_timeout(700)
            data, _ = backup(pg)
            ses = [s for s in data['sessions'] if s['origen'] == 'app'][0]
            logs = {(l['orden'], l['serie']): l for l in data['setLogs'] if l['session_id'] == ses['id']}
            ok('Se guardan los tramos y la serie principal queda igual', logs[(1, 2)]['peso_g'] == 70000 and logs[(1, 2)]['tramos'] == [{'reps': 8, 'peso_g': 55000}, {'reps': 6, 'peso_g': 45000}]
               and [t['reps'] for t in logs[(2, 1)]['tramos']] == [4, 3, 2], str([logs[(1, 2)].get('tramos'), logs[(2, 1)].get('tramos')]))
            tab(pg, 'Calendario'); pg.click('.card >> text=Día T'); pg.wait_for_timeout(500)
            t = texto(pg)
            ok('Historial: muestra los tramos', '↓ 55 kg × 8 · 45 kg × 6' in t and '+ 4·3·2' in t, t[-260:])
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
