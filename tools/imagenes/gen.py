"""Arma las imágenes de ejercicios que vienen con la app.

Fuente: Free Exercise DB (https://github.com/yuhonas/free-exercise-db), de dominio público (Unlicense).
Cada ejercicio trae dos fotos (posición inicial y final): se pegan una arriba de la otra en una sola
imagen, que en la pantalla angosta del teléfono se ve más grande que lado a lado.

Uso:  python tools/imagenes/gen.py        (requiere Pillow y conexión)
Escribe src/ejercicios-img/<slug>.webp. La app las reconoce por el nombre del archivo: tiene que ser el
`slug` del ejercicio en el catálogo. Para sumar una, agregarla a MAPA y volver a correr.
"""
import io, json, os, urllib.request
from PIL import Image

RAIZ = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'
ANCHO = 640   # ancho de cada foto, en píxeles

# slug en el catálogo de GymBro -> carpeta en Free Exercise DB
MAPA = {
    'press-plano': 'Barbell_Bench_Press_-_Medium_Grip',
    'dominadas-prona': 'Pullups',
    'peso-muerto-br': 'Barbell_Deadlift',
    'empuje-de-cadera-br': 'Barbell_Hip_Thrust',
    'fondos': 'Dips_-_Chest_Version',
    'sentadilla-br': 'Barbell_Squat',
    'sentadilla-al-cajon-ra-br': 'Box_Squat_with_Bands',
    'sentadilla-bulgara-ra-br': 'One_Leg_Barbell_Squat',
    'peso-muerto-1p-kb': 'Kettlebell_One-Legged_Deadlift',
    'curl-nordico': 'Floor_Glute-Ham_Raise',
    'press-inclinado-con-mancuernas': 'Incline_Dumbbell_Press',
    'aperturas-mq': 'Butterfly',
    'press-militar-br': 'Standing_Military_Press',
    'press-hombro-mq': 'Machine_Shoulder_Military_Press',
    'press-hombro-ba-kb': 'Two-Arm_Kettlebell_Military_Press',
    'dominadas-palmar': 'Chin-Up',
    'dorsalera-palmar-mq': 'Underhand_Cable_Pulldowns',
    'remo-1m-plancha-alta-kb': 'Alternating_Renegade_Row',
    'remo-1m-cd-kb': 'One-Arm_Dumbbell_Row',
    'remo-al-menton-br': 'Upright_Barbell_Row',
    'biceps-br': 'Barbell_Curl',
    'biceps-mc': 'Dumbbell_Bicep_Curl',
    'biceps-alterno-mc': 'Dumbbell_Alternate_Bicep_Curl',
    'triceps-pl': 'Triceps_Pushdown',
    'thrusters-kb': 'Kettlebell_Thruster',
    'isquiotibiales-rd': 'Hamstring-SMR',
    'cuadrupedia-con-patada': 'Glute_Kickback',
}

# Candidatos que NO se incluyeron porque la foto no coincide del todo o no se sabe cómo lo hace el dueño.
# Para sumar uno, confirmarlo con él y pasarlo a MAPA.
#   press-en-landmine            Single-Arm_Linear_Jammer        (la foto es la versión explosiva)
#   remo-invertido-puente-br     Inverted_Row                    (la foto es con piernas estiradas, no en puente)
#   remo-pendley-prono           Bent_Over_Barbell_Row           (remo inclinado común, no desde el piso)
#   vuelo-frontal-lateral        Side_Laterals_to_Front_Raise
#   2do-tiempo-split-br          Split_Jerk                      (las fotos no muestran el split)
#   plancha-alta-carrera         Mountain_Climbers               (si "carrera" es escalador)
#   swing-cadera-ra-kb           One-Arm_Kettlebell_Swings       (la foto es a una mano y sin banda)
#   push-up-dc                   Pushups                         (sin disco)
#   elevaciones-de-cadera-1p-mb  Single_Leg_Glute_Bridge         (sin banda)
#   camilla-isquiosurales-1p-mq  Lying_Leg_Curls                 (a dos piernas)
#   sentadilla-split-salto-cambio-kb  Split_Jump                 (sin kettlebell)
#   remo-neutro-mq               Leverage_Iso_Row / Seated_Cable_Rows  (no se sabe qué máquina es)

# Los ejercicios clásicos agregados después traen la carpeta de su foto en tools/seed/catalogo-cambios.json.
for _n in json.load(open(os.path.join(RAIZ, 'tools', 'seed', 'catalogo-cambios.json'), encoding='utf-8'))['nuevos']:
    if _n.get('imagen'): MAPA[_n['slug']] = _n['imagen']

def foto(carpeta, n):
    with urllib.request.urlopen(f'{BASE}{carpeta}/{n}.jpg', timeout=30) as r:
        img = Image.open(io.BytesIO(r.read())).convert('RGB')
    return img.resize((ANCHO, round(img.height * ANCHO / img.width)), Image.LANCZOS)

if __name__ == '__main__':
    destino = os.path.join(RAIZ, 'src', 'ejercicios-img')
    os.makedirs(destino, exist_ok=True)
    for viejo in os.listdir(destino):     # las de ejercicios que ya no existen se van
        if viejo.endswith('.webp') and viejo[:-5] not in MAPA: os.remove(os.path.join(destino, viejo))
    for slug, carpeta in MAPA.items():
        ruta = os.path.join(destino, f'{slug}.webp')
        if os.path.exists(ruta): continue   # ya está: no volver a bajarla (borrar el archivo para rehacerla)
        a, b = foto(carpeta, 0), foto(carpeta, 1)
        junta = Image.new('RGB', (ANCHO, a.height + b.height + 6), 'white')
        junta.paste(a, (0, 0)); junta.paste(b, (0, a.height + 6))
        junta.save(ruta, 'WEBP', quality=72, method=6)
        print(f'{slug}: {junta.width}x{junta.height}, {os.path.getsize(ruta) // 1024} KB')
