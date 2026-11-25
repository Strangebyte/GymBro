"""Convierte la revisión de nombres del dueño (privado/nombres-ejercicios.xlsx) en tools/seed/catalogo-cambios.json,
que es lo que usan el generador de datos iniciales y la app para actualizar el catálogo.

Uso:  python tools/nombres/aplicar.py        (requiere openpyxl; el Excel solo existe en la PC del dueño)

Qué sale en catalogo-cambios.json:
  ejercicios  slug -> nombre nuevo, otros nombres (alias) y, si cambió, equipamiento o patrón
  fusiones    slug que desaparece -> slug que lo absorbe (eran el mismo ejercicio)
  archivar    ejercicios que quedan ocultos sin borrarse
  eliminar    ejercicios que el dueño pidió borrar del todo: se van con sus series registradas y salen de los planes
  borrar      ejercicios sin uso que se eliminan
  nuevos      ejercicios clásicos que no estaban en el catálogo (con la carpeta de su foto en Free Exercise DB)
  grupos, patrones   clave vieja -> clave nueva (revisión 3: grupos y patrones unificados). Tienen que coincidir con
                     GRUPO_NUEVO y PATRON_NUEVO de src/db.ts, que es lo que convierte los datos ya guardados
Cada vez que cambie el resultado hay que subir "rev": la app aplica los cambios una sola vez por revisión.
"""
import json, os, re, unicodedata
from openpyxl import load_workbook

RAIZ = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
REV = 10

def norm(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()
def slugify(s): return norm(s).replace(' ', '-')

# ---------------------------------------------------------------- decisiones del dueño (15-11-2026)
# Nombre final de cada ejercicio que él cambió, con la ortografía corregida (acentos, "glide", mayúsculas).
FINAL = {
    'cadera-con-glide-lateral-cuadrupedia': 'Movilidad de cadera en cuadrupedia con glide lateral',
    'desliz-barra-en-puntas': 'Deslizamiento de barra en puntas de pie',
    'press-hombro-1m-rr-kb': 'Press hombro a un brazo con KB',
    '1p-a-otro-cc-diagonal': 'Salto en diagonal hacia delante de una pierna a la otra',
    'remo-1m-plancha-alta-kb': 'Remo a un brazo en plancha alta con KB',
    'biceps-alterno-mc': 'Bíceps alterno con manc.',
    'biceps-hombro-mc': 'Bíceps + press hombro con manc.',
    'sentadilla-salto-kb': 'Sentadilla con salto con KB',
    'rotacion-tronco-pared-t': 'Rotación torácica en pared',
    'plancha-construyo': 'Plancha construyo',               # el dueño pidió volver a este nombre (18-11-2026)
    'peso-muerto-1p-kb': 'Peso muerto a una pierna con kettlebell',
    'caida-lm': 'Caída a estocadas con landmine',
    'dorsalera-palmar-mq': 'Polea al pecho con agarre supino',
    'elevaciones-de-cadera-1p-mb': 'Elevación de cadera a un pie sobre pelota',
    'biceps-br': 'Bíceps con barra',
    'abdominal-con-aductores': 'Abdominal apretando pelota con los aductores',
    'press-hombro-ba-kb': 'Press hombro con KB',
    'remo-1m-cd-kb': 'Remo a un brazo con apoyo en banco',
    'press-en-landmine': 'Press hombro en landmine',
    'elevaciones-de-cadera-caminata-i-v': 'Elevación de cadera con caminata',
    'puente-lateral-cambio': 'Puente lateral inclinado con técnica de carrera con cambio de pie de apoyo',
    'giros-oh-en-tandem': 'Giros con disco sobre la cabeza en posición tándem',
    'sentadilla-bulgara-ra-br': 'Sentadilla búlgara',        # "nunca hice este ejercicio con banda elástica"
    'press-hombro-rr-kb': 'Press de hombro arrodillado con KB',
    'plancha-copenhague-1-2-con': 'Plancha Copenhague',       # es la plancha completa, apoyando el tobillo
    'curl-isquio-1p-exc-mb': 'Curl de isquiotibiales excéntrico a una pierna sobre pelota',
    'laterales-con-banda': 'Saltos laterales con una mano agarrando banda elástica',
    '2do-tiempo-split-br': '2do tiempo split con barra',
    '2p-ba-ccm-vertical': 'Salto en vertical desde media estocada a media estocada',
    'hollow': 'Hollow',
    'bear-crawl-dinamico': 'Cuadrupedia toco hombro con brazo contrario',
    'camilla-isquiosurales-1p-mq': 'Camilla isquiotibiales a una pierna',
}
# "Es el mismo ejercicio que…": el de la izquierda desaparece y su historial pasa al de la derecha.
FUSIONES = {
    'antiflexion-lateral-con-barra': 'desliz-barra-en-puntas',
    'carpas-dinamico': 'carpa-2p',
    'curl-isquios-1p-exc-fb': 'curl-isquio-1p-exc-mb',
    'curl-isquios-fb': 'curl-isquio-1p-exc-mb',
}
ARCHIVAR = []
# (25-11-2026) Rebote y freno se había borrado del todo (16-11); el entrenador lo sigue usando y el dueño pidió volver a
# agregarlo. Las apps que ya lo borraron lo vuelven a recibir como ejercicio nuevo.
ELIMINAR = []
# Otros nombres que se suman a los de un ejercicio del entrenador (variantes de nombre que aparecieron después).
ALIAS_EXTRA = {'sentadilla-split-salto-cambio-kb': ['Sentadilla SPLIT SALTO CC - KB', 'Zancada con salto CC']}
BORRAR = ['remo-tandem-en-puntas']       # "Eliminalo", sin registros
# Cambios de equipamiento o patrón que se desprenden de sus correcciones.
OTROS = {
    'elevaciones-de-cadera-1p-mb': {'equipo': 'fitball'},
    'curl-isquio-1p-exc-mb': {'equipo': 'fitball'},
    'giros-oh-en-tandem': {'equipo': 'disco'},
    'remo-1m-cd-kb': {'equipo': 'mancuernas'},
    'bear-crawl-dinamico': {'patron': 'core_antirotacion'},
}
# Donde su corrección cambió qué ejercicio es, o donde un ejercicio nuevo se queda con los nombres genéricos,
# la lista de otros nombres se reemplaza por esta.
ALIAS = {
    'desliz-barra-en-puntas': ['Desliz de barra', 'Deslizamiento de barra'],
    'elevaciones-de-cadera-1p-mb': ['Puente de glúteo a una pierna sobre pelota', 'Elevación de cadera a una pierna en fitball', 'Puente a una pierna en fitball', 'Single leg glute bridge on ball'],
    'plancha-construyo': ['Plancha construyo con disco', 'Plancha sube y baja con disco', 'Plancha de codos a manos', 'Plancha comando', 'Plank up down', 'Up down plank', 'Commando plank'],
    'plancha-copenhague-1-2-con': ['Copenhague', 'Plancha de aductores', 'Copenhagen plank', 'Copenhagen adductor plank'],
    'puente-lateral-cambio': ['Puente lateral con cambio', 'Plancha lateral inclinada con técnica de carrera'],
    'giros-oh-en-tandem': ['Giros overhead en tándem', 'Giros OH', 'Giros con disco sobre la cabeza'],
    'caida-lm': ['Caída en landmine', 'Landmine drop lunge'],
    'press-hombro-rr-kb': ['Press de hombro de rodillas con kettlebell', 'Press arrodillado con pesa rusa', 'Kneeling kettlebell press', 'Tall kneeling kettlebell press'],
    'curl-isquio-1p-exc-mb': ['Curl de isquiotibiales en fitball', 'Curl de isquios en pelota', 'Curl femoral en pelota suiza', 'Curl femoral en pelota a una pierna', 'Swiss ball leg curl', 'Stability ball hamstring curl', 'Ball leg curl', 'Single leg swiss ball leg curl'],
    'laterales-con-banda': ['Saltos laterales con banda', 'Saltos laterales con banda elástica'],
    '2p-ba-ccm-vertical': ['Salto vertical en media estocada', 'Salto en estocada vertical'],
    'bear-crawl-dinamico': ['Toques de hombro en cuadrupedia', 'Cuadrupedia con toque de hombro', 'Shoulder taps en cuadrupedia', 'Bear shoulder taps'],
    'remo-1m-cd-kb': ['Remo a un brazo con mancuerna', 'Remo con mancuerna', 'Remo unilateral con mancuerna', 'Remo a un brazo con kettlebell', 'Remo a una mano', 'One arm dumbbell row', 'Single arm dumbbell row', 'Dumbbell row'],
    'swing-cadera-ra-kb': ['Swing con banda elástica', 'Swing de cadera con banda', 'Banded kettlebell swing'],
    'remo-pendley-prono': ['Remo Pendlay', 'Remo Pendley', 'Pendlay row', 'Remo con barra desde el piso'],
    'camilla-isquiosurales-1p-mq': ['Camilla de isquiotibiales a una pierna', 'Camilla de isquiosurales a una pierna', 'Camilla femoral a una pierna', 'Curl femoral acostado a una pierna', 'Single leg lying leg curl'],
}

# ---------------------------------------------------------------- grupos y patrones unificados (16-11-2026)
GRUPOS = {
    'dorsal': 'espalda', 'trapecio': 'espalda',
    'hombro_anterior': 'hombros', 'hombro_lateral': 'hombros', 'hombro_posterior': 'hombros',
    'isquios': 'isquiotibiales', 'aductores': 'aductores_abductores', 'gemelo': 'gemelos', 'full_body': 'cuerpo_completo',
    'movilidad_cadera': 'movilidad', 'movilidad_dorsal': 'movilidad', 'movilidad_isquios': 'movilidad',
    'movilidad_posterior': 'movilidad', 'movilidad_aductores': 'movilidad',
}
PATRONES = {
    'core_antiextension': 'core', 'core_antiflexion_lateral': 'core', 'core_antirotacion': 'core', 'core_rotacion': 'core',
    'locomocion': 'acarreo',
}

# ---------------------------------------------------------------- dos pesas (18-11-2026)
# Ejercicios que se hacen con dos mancuernas o dos kettlebells: el peso que se anota es el de una sola ("kg c/u").
# Los de una sola pesa (goblet, swing, remos y press a un brazo, pullover…) quedan afuera. Los dudosos los confirmó el
# dueño el 18-11-2026: thrusters, press arrodillado y las dos sentadillas con salto son con dos pesas.
DOS_PESAS = [
    'caminata-de-gemelo-mc', 'press-inclinado-con-mancuernas', 'biceps-mc', 'biceps-alterno-mc', 'biceps-hombro-mc',
    'vuelo-combinado-alterno', 'vuelo-frontal-lateral', 'press-hombro-ba-kb', 'press-hombro-rr-kb', 'thrusters-kb',
    'sentadilla-salto-kb', 'sentadilla-split-salto-cambio-kb',
]

# (18-11-2026) Se había agregado una corrección que dividía por dos algunos pesos sumados del historial; el dueño pidió
# revertirla: los ajusta él a mano.
DOS_PESAS_NUEVOS = [
    'Press de banca con mancuernas', 'Press declinado con mancuernas', 'Aperturas con mancuernas',
    'Encogimientos de hombros con mancuernas', 'Press de hombros con mancuernas', 'Press Arnold', 'Vuelos laterales con mancuernas',
    'Vuelos frontales con mancuernas', 'Vuelos posteriores con mancuernas', 'Curl martillo con mancuernas', 'Estocadas con mancuernas',
    'Caminata del granjero', 'Curl de muñeca con mancuernas', 'Devil press con mancuernas',
]

# ---------------------------------------------------------------- músculos secundarios de los ejercicios agregados (20-11-2026)
# Cada uno suma esa fracción de serie en "Series por grupo muscular" (mismo criterio que los del entrenador: 0,3 a 0,5).
SEC_NUEVOS = {
    'Press de banca inclinado con barra': {'triceps': .5, 'hombros': .5},
    'Press de banca declinado con barra': {'triceps': .5, 'hombros': .3},
    'Press de banca con mancuernas': {'triceps': .5, 'hombros': .3},
    'Press declinado con mancuernas': {'triceps': .5, 'hombros': .3},
    'Press de pecho en máquina': {'triceps': .5, 'hombros': .3},
    'Aperturas con mancuernas': {'hombros': .3},
    'Cruce de poleas': {'hombros': .3},
    'Flexiones de brazos': {'triceps': .5, 'hombros': .3, 'core': .3},
    'Pullover con mancuerna': {'espalda': .5, 'triceps': .3},
    'Jalón al pecho con agarre prono': {'biceps': .5, 'hombros': .3},
    'Remo con barra inclinado': {'biceps': .5, 'hombros': .3, 'lumbares': .3},
    'Remo sentado en polea': {'biceps': .5, 'hombros': .3},
    'Remo en barra T': {'biceps': .5, 'hombros': .3, 'lumbares': .3},
    'Face pull': {'espalda': .5},
    'Encogimientos de hombros con mancuernas': {'antebrazos': .3},
    'Hiperextensiones lumbares': {'gluteo': .5, 'isquiotibiales': .5},
    'Dominadas asistidas': {'biceps': .5},
    'Press de hombros con mancuernas': {'triceps': .5},
    'Press Arnold': {'triceps': .5},
    'Vuelos posteriores con mancuernas': {'espalda': .3},
    'Posteriores en máquina': {'espalda': .3},
    'Curl martillo con mancuernas': {'antebrazos': .5},
    'Press de banca con agarre cerrado': {'pecho': .5, 'hombros': .3},
    'Fondos en banco': {'pecho': .3, 'hombros': .3},
    'Prensa de piernas': {'gluteo': .5, 'isquiotibiales': .3},
    'Sentadilla frontal con barra': {'gluteo': .5, 'core': .3},
    'Sentadilla goblet': {'gluteo': .5, 'core': .3},
    'Sentadilla hack': {'gluteo': .5},
    'Sentadilla con peso corporal': {'gluteo': .5},
    'Estocadas con mancuernas': {'gluteo': .5, 'isquiotibiales': .3},
    'Estocadas caminando': {'gluteo': .5, 'isquiotibiales': .3},
    'Subida al cajón con mancuernas': {'gluteo': .5},
    'Peso muerto rumano con barra': {'gluteo': .5, 'lumbares': .3},
    'Peso muerto sumo con barra': {'cuadriceps': .5, 'isquiotibiales': .5, 'aductores_abductores': .3},
    'Buenos días con barra': {'gluteo': .5, 'lumbares': .5},
    'Puente de glúteo': {'isquiotibiales': .3},
    'Swing con kettlebell': {'isquiotibiales': .5, 'core': .3},
    'Patada de glúteo en polea': {'isquiotibiales': .3},
    'Salto al cajón': {'gluteo': .5, 'gemelos': .3},
    'Caminata del granjero': {'antebrazos': .5, 'espalda': .3, 'core': .3},
}

# ---------------------------------------------------------------- ejercicios clásicos que faltaban
def N(nombre, grupo, equipo, patron, alias, imagen=None, **kw):
    e = {'slug': slugify(nombre), 'nombre': nombre, 'legible': None, 'grupo': grupo, 'sec': [], 'equipo': equipo, 'patron': patron,
         'unilateral': False, 'lastre': False, 'mide': 'reps', 'vol': True, 'inc': None, 'archivo': False, 'notas': None,
         'alias': alias, 'imagen': imagen}
    e.update(kw)
    return e

NUEVOS = [
    # pecho
    N('Press de banca inclinado con barra', 'pecho', 'barra', 'empuje_horizontal', ['Press inclinado con barra', 'Press banca inclinado', 'Press superior con barra', 'Incline bench press', 'Incline barbell press'], 'Barbell_Incline_Bench_Press_-_Medium_Grip'),
    N('Press de banca declinado con barra', 'pecho', 'barra', 'empuje_horizontal', ['Press declinado con barra', 'Press declinado', 'Press banca declinado', 'Decline bench press', 'Decline barbell press'], 'Decline_Barbell_Bench_Press'),
    N('Press de banca con mancuernas', 'pecho', 'mancuernas', 'empuje_horizontal', ['Press plano con mancuernas', 'Press de pecho con mancuernas', 'Dumbbell bench press', 'Dumbbell press'], 'Dumbbell_Bench_Press'),
    N('Press declinado con mancuernas', 'pecho', 'mancuernas', 'empuje_horizontal', ['Press de pecho declinado con mancuernas', 'Press de banca declinado con mancuernas', 'Decline dumbbell press', 'Decline dumbbell bench press'], 'Decline_Dumbbell_Bench_Press'),
    N('Press de pecho en máquina', 'pecho', 'maquina', 'empuje_horizontal', ['Press en máquina', 'Press de pecho sentado', 'Machine chest press', 'Chest press machine', 'Machine bench press'], 'Leverage_Chest_Press'),
    N('Aperturas con mancuernas', 'pecho', 'mancuernas', 'aislamiento', ['Aperturas en banco plano', 'Vuelos de pecho', 'Dumbbell fly', 'Dumbbell flyes', 'Flyes'], 'Dumbbell_Flyes'),
    N('Cruce de poleas', 'pecho', 'polea', 'aislamiento', ['Cruces en polea', 'Aperturas en polea', 'Crossover', 'Cable crossover', 'Cable fly'], 'Cable_Crossover'),
    N('Flexiones de brazos', 'pecho', 'peso_corporal', 'empuje_horizontal', ['Flexiones', 'Lagartijas', 'Push up', 'Push ups', 'Pushups'], 'Pushups'),
    N('Pullover con mancuerna', 'pecho', 'mancuernas', 'aislamiento', ['Pullover', 'Pull over', 'Dumbbell pullover'], 'Bent-Arm_Dumbbell_Pullover'),
    # espalda
    N('Jalón al pecho con agarre prono', 'dorsal', 'polea', 'traccion_vertical', ['Jalón al pecho', 'Polea al pecho', 'Polea alta al pecho', 'Dorsalera', 'Lat pulldown', 'Wide grip lat pulldown'], 'Wide-Grip_Lat_Pulldown'),
    N('Remo con barra inclinado', 'dorsal', 'barra', 'traccion_horizontal', ['Remo con barra', 'Remo inclinado con barra', 'Bent over row', 'Bent over barbell row', 'Barbell row'], 'Bent_Over_Barbell_Row'),
    N('Remo sentado en polea', 'dorsal', 'polea', 'traccion_horizontal', ['Remo bajo', 'Remo en polea baja', 'Remo sentado', 'Seated cable row', 'Seated row', 'Low row'], 'Seated_Cable_Rows'),
    N('Remo en barra T', 'dorsal', 'barra', 'traccion_horizontal', ['Remo T', 'Remo en punta', 'T-bar row', 'T bar row'], 'T-Bar_Row_with_Handle'),
    N('Face pull', 'hombro_posterior', 'polea', 'traccion_horizontal', ['Face pulls', 'Jalón a la cara', 'Tirón a la cara'], 'Face_Pull'),
    N('Encogimientos de hombros con mancuernas', 'trapecio', 'mancuernas', 'aislamiento', ['Encogimientos', 'Encogimiento de trapecio', 'Trapecio con mancuernas', 'Shrugs', 'Dumbbell shrug'], 'Dumbbell_Shrug'),
    N('Hiperextensiones lumbares', 'lumbares', 'banco', 'bisagra', ['Hiperextensiones', 'Extensiones lumbares', 'Lumbares en banco', 'Back extension', 'Hyperextension', 'Banco romano'], 'Hyperextensions_Back_Extensions'),
    N('Dominadas asistidas', 'dorsal', 'maquina', 'traccion_vertical', ['Dominadas asistidas en máquina', 'Dominadas con asistencia', 'Assisted pull up', 'Assisted pull ups']),
    # hombros
    N('Press de hombros con mancuernas', 'hombro_anterior', 'mancuernas', 'empuje_vertical', ['Press militar con mancuernas', 'Press de hombro sentado con mancuernas', 'Dumbbell shoulder press', 'Shoulder press'], 'Dumbbell_Shoulder_Press'),
    N('Press Arnold', 'hombro_anterior', 'mancuernas', 'empuje_vertical', ['Press Arnold con mancuernas', 'Arnold press'], 'Arnold_Dumbbell_Press'),
    N('Vuelos laterales con mancuernas', 'hombro_lateral', 'mancuernas', 'aislamiento', ['Vuelos laterales', 'Elevaciones laterales', 'Laterales con mancuernas', 'Lateral raise', 'Side lateral raise'], 'Side_Lateral_Raise'),
    N('Vuelos frontales con mancuernas', 'hombro_anterior', 'mancuernas', 'aislamiento', ['Vuelos frontales', 'Vuelo frontal', 'Elevaciones frontales', 'Front raise', 'Front dumbbell raise'], 'Front_Dumbbell_Raise'),
    N('Vuelos posteriores con mancuernas', 'hombro_posterior', 'mancuernas', 'aislamiento', ['Vuelos posteriores', 'Pájaros', 'Posteriores con mancuernas', 'Reverse fly', 'Rear delt fly', 'Bent over lateral raise'], 'Seated_Bent-Over_Rear_Delt_Raise'),
    N('Posteriores en máquina', 'hombro_posterior', 'maquina', 'aislamiento', ['Pájaros en máquina', 'Contractora invertida', 'Reverse pec deck', 'Reverse machine fly'], 'Reverse_Machine_Flyes'),
    # brazos
    N('Curl martillo con mancuernas', 'biceps', 'mancuernas', 'aislamiento', ['Curl martillo', 'Martillo', 'Hammer curl', 'Hammer curls'], 'Hammer_Curls'),
    N('Curl de bíceps en banco Scott', 'biceps', 'barra', 'aislamiento', ['Curl Scott', 'Banco Scott', 'Curl predicador', 'Preacher curl'], 'Preacher_Curl'),
    N('Curl de bíceps en polea', 'biceps', 'polea', 'aislamiento', ['Bíceps en polea', 'Curl en polea baja', 'Cable curl', 'Cable biceps curl'], 'Standing_Biceps_Cable_Curl'),
    N('Press francés con barra', 'triceps', 'barra', 'aislamiento', ['Press francés', 'Rompecráneos', 'Extensión de tríceps acostado', 'Skull crusher', 'Skullcrusher', 'Lying triceps extension'], 'EZ-Bar_Skullcrusher'),
    N('Extensión de tríceps sobre la cabeza con mancuerna', 'triceps', 'mancuernas', 'aislamiento', ['Tríceps trasnuca', 'Extensión trasnuca', 'Copa de tríceps', 'Overhead triceps extension', 'Overhead dumbbell extension'], 'Standing_Dumbbell_Triceps_Extension'),
    N('Patada de tríceps con mancuerna', 'triceps', 'mancuernas', 'aislamiento', ['Patada de tríceps', 'Kickback de tríceps', 'Triceps kickback', 'Tricep kickback'], 'Tricep_Dumbbell_Kickback', unilateral=True),
    N('Press de banca con agarre cerrado', 'triceps', 'barra', 'empuje_horizontal', ['Press cerrado', 'Press de banca agarre estrecho', 'Close grip bench press'], 'Close-Grip_Barbell_Bench_Press'),
    N('Fondos en banco', 'triceps', 'peso_corporal', 'empuje_vertical', ['Fondos entre bancos', 'Fondos de tríceps en banco', 'Bench dips', 'Bench dip'], 'Bench_Dips'),
    # piernas
    N('Camilla de cuádriceps', 'cuadriceps', 'maquina', 'aislamiento', ['Extensión de cuádriceps', 'Extensiones de piernas', 'Sillón de cuádriceps', 'Leg extension', 'Leg extensions'], 'Leg_Extensions'),
    N('Prensa de piernas', 'cuadriceps', 'maquina', 'sentadilla', ['Prensa', 'Prensa 45', 'Prensa inclinada', 'Leg press'], 'Leg_Press'),
    N('Sentadilla frontal con barra', 'cuadriceps', 'barra', 'sentadilla', ['Sentadilla frontal', 'Sentadilla delantera', 'Front squat'], 'Front_Barbell_Squat'),
    N('Sentadilla goblet', 'cuadriceps', 'kettlebell', 'sentadilla', ['Sentadilla copa', 'Sentadilla con mancuerna al pecho', 'Sentadilla goblet con kettlebell', 'Goblet squat'], 'Goblet_Squat'),
    N('Sentadilla hack', 'cuadriceps', 'maquina', 'sentadilla', ['Sentadilla hack en máquina', 'Hack squat'], 'Hack_Squat'),
    N('Sentadilla con peso corporal', 'cuadriceps', 'peso_corporal', 'sentadilla', ['Sentadilla sin peso', 'Sentadilla al aire', 'Air squat', 'Bodyweight squat'], 'Bodyweight_Squat'),
    N('Estocadas con mancuernas', 'cuadriceps', 'mancuernas', 'zancada', ['Estocadas', 'Zancadas', 'Zancadas con mancuernas', 'Estocada adelante', 'Lunges', 'Dumbbell lunge'], 'Dumbbell_Lunges', unilateral=True),
    N('Estocadas caminando', 'cuadriceps', 'peso_corporal', 'zancada', ['Zancadas caminando', 'Estocadas en caminata', 'Walking lunge', 'Walking lunges'], 'Bodyweight_Walking_Lunge', unilateral=True),
    N('Subida al cajón con mancuernas', 'cuadriceps', 'cajon', 'zancada', ['Subida al cajón', 'Subidas al cajón', 'Subida al banco', 'Step up', 'Step ups'], 'Dumbbell_Step_Ups', unilateral=True),
    N('Peso muerto rumano con barra', 'isquios', 'barra', 'bisagra', ['Peso muerto rumano', 'Rumano', 'Peso muerto piernas semirrígidas', 'Romanian deadlift', 'RDL'], 'Romanian_Deadlift'),
    N('Peso muerto sumo con barra', 'gluteo', 'barra', 'bisagra', ['Peso muerto sumo', 'Sumo deadlift'], 'Sumo_Deadlift'),
    N('Buenos días con barra', 'isquios', 'barra', 'bisagra', ['Buenos días', 'Good morning', 'Good mornings'], 'Good_Morning'),
    N('Camilla de isquiotibiales acostado', 'isquios', 'maquina', 'aislamiento', ['Camilla isquiosurales - MQ', 'Camilla de isquiotibiales', 'Camilla femoral', 'Curl femoral acostado', 'Curl femoral tumbado', 'Lying leg curl', 'Leg curl'], 'Lying_Leg_Curls'),
    N('Camilla de isquiotibiales sentado', 'isquios', 'maquina', 'aislamiento', ['Curl femoral sentado', 'Sillón de isquiotibiales', 'Isquios sentado en máquina', 'Seated leg curl'], 'Seated_Leg_Curl'),
    N('Puente de glúteo', 'gluteo', 'peso_corporal', 'bisagra', ['Puente de glúteos', 'Elevación de cadera', 'Glute bridge', 'Hip bridge'], 'Butt_Lift_Bridge'),
    N('Swing con kettlebell', 'gluteo', 'kettlebell', 'bisagra', ['Swing con pesa rusa', 'Swing de cadera con kettlebell', 'Balanceo con kettlebell', 'Swing ruso', 'Kettlebell swing', 'Swing']),
    N('Patada de glúteo en polea', 'gluteo', 'polea', 'aislamiento', ['Patada trasera en polea', 'Glute kickback en polea', 'Cable kickback', 'Cable glute kickback'], 'One-Legged_Cable_Kickback', unilateral=True),
    N('Abductores en máquina', 'aductores', 'maquina', 'aislamiento', ['Abducción de cadera en máquina', 'Máquina de abductores', 'Abducción', 'Hip abduction', 'Abductor machine'], 'Thigh_Abductor'),
    N('Aductores en máquina', 'aductores', 'maquina', 'aislamiento', ['Aducción de cadera en máquina', 'Máquina de aductores', 'Aducción', 'Hip adduction', 'Adductor machine'], 'Thigh_Adductor'),
    N('Gemelos de pie en máquina', 'gemelo', 'maquina', 'aislamiento', ['Gemelos en máquina', 'Gemelos parado', 'Elevación de talones de pie', 'Pantorrillas de pie', 'Standing calf raise', 'Calf raise'], 'Standing_Calf_Raises'),
    N('Gemelos sentado en máquina', 'gemelo', 'maquina', 'aislamiento', ['Gemelos sentado', 'Sóleo en máquina', 'Elevación de talones sentado', 'Seated calf raise'], 'Seated_Calf_Raise'),
    N('Gemelos en prensa', 'gemelo', 'maquina', 'aislamiento', ['Gemelos en prensa de piernas', 'Calf press', 'Leg press calf raise'], 'Calf_Press_On_The_Leg_Press_Machine'),
    # core
    N('Plancha frontal', 'core', 'peso_corporal', 'core_antiextension', ['Plancha', 'Plancha abdominal', 'Plancha de antebrazos', 'Plank', 'Front plank'], 'Plank', mide='seg'),
    N('Plancha lateral', 'core', 'peso_corporal', 'core_antiflexion_lateral', ['Puente lateral', 'Plancha de costado', 'Side plank', 'Side bridge'], 'Side_Bridge', mide='seg', unilateral=True),
    N('Abdominales crunch', 'core', 'peso_corporal', 'core_antiextension', ['Abdominales', 'Abdominales cortos', 'Crunch', 'Crunches'], 'Crunches'),
    N('Elevación de piernas colgado', 'core', 'peso_corporal', 'core_antiextension', ['Elevación de piernas en barra', 'Elevaciones de piernas colgado', 'Rodillas al pecho colgado', 'Hanging leg raise', 'Hanging knee raise'], 'Hanging_Leg_Raise'),
    N('Rueda abdominal', 'core', 'otro', 'core_antiextension', ['Rueda', 'Ab wheel', 'Ab roller', 'Ab wheel rollout', 'Rollout'], 'Ab_Roller'),
    N('Giros rusos', 'core', 'peso_corporal', 'core_rotacion', ['Giro ruso', 'Twist ruso', 'Russian twist', 'Russian twists'], 'Russian_Twist'),
    # potencia y acarreos
    N('Salto al cajón', 'cuadriceps', 'cajon', 'pliometria', ['2P CCM Vertical AL CAJÓN - CJ', 'Salto al cajón a dos piernas con contramovimiento', 'Saltos al cajón', 'Salto al cajón a dos piernas', 'Box jump', 'Box jumps'], 'Front_Box_Jump'),
    N('Caminata del granjero', 'full_body', 'mancuernas', 'locomocion', ['Paseo del granjero', 'Caminata de granjero', 'Farmer walk', 'Farmer carry', "Farmer's walk"], 'Farmers_Walk'),
    # antebrazos (18-11-2026: el grupo no tenía ejercicios)
    N('Curl de muñeca con barra', 'antebrazos', 'barra', 'aislamiento', ['Curl de muñeca', 'Flexión de muñeca con barra', 'Flexiones de muñeca', 'Wrist curl', 'Barbell wrist curl'], 'Palms-Up_Barbell_Wrist_Curl_Over_A_Bench'),
    N('Curl de muñeca con mancuernas', 'antebrazos', 'mancuernas', 'aislamiento', ['Flexión de muñeca con mancuernas', 'Dumbbell wrist curl'], 'Seated_Dumbbell_Palms-Up_Wrist_Curl'),
    N('Extensión de muñeca con barra', 'antebrazos', 'barra', 'aislamiento', ['Extensión de muñeca', 'Curl de muñeca invertido', 'Curl de muñeca prono', 'Reverse wrist curl', 'Wrist extension'], 'Palms-Down_Wrist_Curl_Over_A_Bench'),
    N('Curl invertido con barra', 'antebrazos', 'barra', 'aislamiento', ['Curl invertido', 'Curl prono con barra', 'Curl de bíceps invertido', 'Reverse curl', 'Reverse barbell curl'], 'Reverse_Barbell_Curl', sec=[{'grupo': 'biceps', 'factor': 0.5}]),
    N('Rodillo de muñeca', 'antebrazos', 'otro', 'aislamiento', ['Enrollador de muñeca', 'Rodillo de antebrazos', 'Wrist roller'], 'Wrist_Roller'),
    N('Pinza de discos', 'antebrazos', 'disco', 'aislamiento', ['Agarre de discos', 'Sostener discos con pinza', 'Plate pinch', 'Pinch grip'], 'Plate_Pinch', mide='seg'),
    # ejercicios nuevos del entrenador (planes del 13-11 al 28-11; 25-11-2026). El nombre del entrenador queda como alias.
    N('Sentadilla búlgara frontal con barra', 'cuadriceps', 'barra', 'zancada', ['Sentadilla búlgara FRONTAL - BR', 'Búlgara frontal', 'Front rack bulgarian split squat'], unilateral=True, sec=[{'grupo': 'gluteo', 'factor': 0.5}]),
    N('Sentadilla frontal al cajón', 'cuadriceps', 'barra', 'sentadilla', ['Sentadilla frontal AL CAJÓN', 'Front box squat'], sec=[{'grupo': 'gluteo', 'factor': 0.5}, {'grupo': 'core', 'factor': 0.3}]),
    N('Camilla de cuádriceps a una pierna', 'cuadriceps', 'maquina', 'aislamiento', ['Sillón Cuádriceps 1P', 'Sillón de cuádriceps a una pierna', 'Single leg extension'], unilateral=True),
    N('Estocada lateral con kettlebell', 'cuadriceps', 'kettlebell', 'zancada', ['Estocada lateral - KB', 'Estocada lateral', 'Zancada lateral', 'Lateral lunge'], unilateral=True, sec=[{'grupo': 'gluteo', 'factor': 0.5}, {'grupo': 'aductores_abductores', 'factor': 0.5}]),
    N('Drop jump a dos piernas', 'cuadriceps', 'cajon', 'pliometria', ['DJ 2P Vertical', 'Salto en profundidad', 'Drop jump', 'Depth jump'], sec=[{'grupo': 'gluteo', 'factor': 0.3}, {'grupo': 'gemelos', 'factor': 0.3}]),
    N('Subida al cajón con salto', 'cuadriceps', 'cajon', 'pliometria', ['Subidas al Podio SALTO', 'Subida al podio con salto', 'Step up jump', 'Jumping step up'], unilateral=True, sec=[{'grupo': 'gluteo', 'factor': 0.5}]),
    N('Antirrotación en landmine', 'core', 'landmine', 'core', ['Antirotacion LM', 'Antirrotación LM', 'Landmine antirotation', 'Landmine rainbow']),
    N('Plancha alta dinámica cruzada', 'core', 'peso_corporal', 'core', ['Plancha alta DINÁMICA CRUZADA', 'Plancha alta cruzada']),
    N('Rotación externa de hombro en bisagra', 'hombros', 'otro', 'aislamiento', ['RE Hombro BISAGRA - PS', 'RE Hombro bisagra', 'Rotación externa de hombro']),
    # movimientos de CrossFit (25-11-2026). Sin fotos donde el banco las tiene con el logo de la marca de fondo.
    N('Cargada de potencia', 'cuerpo_completo', 'barra', 'pliometria', ['Power clean', 'Cargada', 'Clean de potencia']),
    N('Cargada con sentadilla', 'cuerpo_completo', 'barra', 'pliometria', ['Squat clean', 'Cargada completa', 'Full clean', 'Clean']),
    N('Cargada colgada', 'cuerpo_completo', 'barra', 'pliometria', ['Hang clean', 'Hang power clean', 'Cargada desde colgado'], 'Hang_Clean'),
    N('Arranque de potencia', 'cuerpo_completo', 'barra', 'pliometria', ['Power snatch', 'Arranque'], 'Power_Snatch'),
    N('Arranque con sentadilla', 'cuerpo_completo', 'barra', 'pliometria', ['Squat snatch', 'Snatch', 'Arranque completo']),
    N('Arranque colgado', 'cuerpo_completo', 'barra', 'pliometria', ['Hang snatch', 'Hang power snatch', 'Arranque desde colgado'], 'Hang_Snatch'),
    N('Cargada y envión', 'cuerpo_completo', 'barra', 'pliometria', ['Clean and jerk', 'Clean & jerk', 'Dos tiempos'], 'Clean_and_Jerk'),
    N('Push press con barra', 'hombros', 'barra', 'empuje_vertical', ['Push press', 'Press con impulso', 'Press de empuje'], 'Push_Press', sec=[{'grupo': 'triceps', 'factor': 0.5}, {'grupo': 'cuadriceps', 'factor': 0.3}]),
    N('Push jerk con barra', 'hombros', 'barra', 'empuje_vertical', ['Push jerk', 'Power jerk', 'Envión de empuje'], sec=[{'grupo': 'triceps', 'factor': 0.5}, {'grupo': 'cuadriceps', 'factor': 0.3}]),
    N('Sentadilla overhead con barra', 'cuadriceps', 'barra', 'sentadilla', ['Overhead squat', 'OHS', 'Sentadilla con barra sobre la cabeza'], 'Overhead_Squat', sec=[{'grupo': 'hombros', 'factor': 0.3}, {'grupo': 'core', 'factor': 0.3}]),
    N('Thruster con barra', 'cuadriceps', 'barra', 'sentadilla', ['Barbell thruster', 'Thrusters con barra'], sec=[{'grupo': 'hombros', 'factor': 0.5}, {'grupo': 'gluteo', 'factor': 0.5}]),
    N('Tirón alto de sumo con barra', 'cuerpo_completo', 'barra', 'bisagra', ['Sumo deadlift high pull', 'SDHP', 'Peso muerto sumo con tirón alto']),
    N('Dominadas kipping', 'espalda', 'peso_corporal', 'traccion_vertical', ['Kipping pull-up', 'Kipping pull ups', 'Dominadas con kipping'], sec=[{'grupo': 'biceps', 'factor': 0.5}]),
    N('Dominadas pecho a la barra', 'espalda', 'peso_corporal', 'traccion_vertical', ['Chest to bar', 'C2B', 'Chest-to-bar pull-up'], sec=[{'grupo': 'biceps', 'factor': 0.5}]),
    N('Pies a la barra', 'core', 'peso_corporal', 'core', ['Toes to bar', 'T2B', 'Toes-to-bar']),
    N('Rodillas a los codos', 'core', 'peso_corporal', 'core', ['Knees to elbows', 'K2E', 'Knees-to-elbows']),
    N('Muscle-up en anillas', 'espalda', 'trx', 'traccion_vertical', ['Muscle up', 'Ring muscle up', 'Muscle-up'], sec=[{'grupo': 'triceps', 'factor': 0.5}, {'grupo': 'pecho', 'factor': 0.3}]),
    N('Muscle-up en barra', 'espalda', 'peso_corporal', 'traccion_vertical', ['Bar muscle up', 'Bar muscle-up'], sec=[{'grupo': 'triceps', 'factor': 0.5}, {'grupo': 'pecho', 'factor': 0.3}]),
    N('Flexiones de brazos en vertical', 'hombros', 'peso_corporal', 'empuje_vertical', ['Handstand push-up', 'HSPU', 'Flexiones en vertical', 'Flexiones de pino'], 'Handstand_Push-Ups', sec=[{'grupo': 'triceps', 'factor': 0.5}]),
    N('Caminata en vertical', 'hombros', 'peso_corporal', 'acarreo', ['Handstand walk', 'Caminar en pino', 'Caminata de manos'], mide='ambos'),
    N('Caminata en la pared', 'hombros', 'peso_corporal', 'acarreo', ['Wall walk', 'Wall walks'], sec=[{'grupo': 'core', 'factor': 0.5}]),
    N('Fondos en anillas', 'triceps', 'trx', 'empuje_vertical', ['Ring dips', 'Ring dip'], 'Ring_Dips', sec=[{'grupo': 'pecho', 'factor': 0.5}, {'grupo': 'hombros', 'factor': 0.3}]),
    N('Subida de soga', 'espalda', 'soga', 'traccion_vertical', ['Rope climb', 'Trepa de soga', 'Trepar la soga'], 'Rope_Climb', sec=[{'grupo': 'biceps', 'factor': 0.5}, {'grupo': 'antebrazos', 'factor': 0.5}]),
    N('Sentadilla pistol', 'cuadriceps', 'peso_corporal', 'sentadilla', ['Pistol squat', 'Pistol', 'Sentadilla a una pierna'], unilateral=True, sec=[{'grupo': 'gluteo', 'factor': 0.5}]),
    N('Burpee con salto al cajón', 'cuerpo_completo', 'cajon', 'pliometria', ['Burpee box jump over', 'Burpee box jump', 'BBJO']),
    N('Abdominales en GHD', 'core', 'maquina', 'core', ['GHD sit-up', 'GHD sit up', 'Abdominales en banco GHD']),
    N('Abdominales completos (sit-up)', 'core', 'peso_corporal', 'core', ['Sit up', 'Sit-up', 'Sit-ups', 'Abdominales sit-up', 'AbMat sit-up'], 'Sit-Up'),
    N('Sostén en L', 'core', 'peso_corporal', 'core', ['L-sit', 'L sit', 'Escuadra'], mide='seg'),
    N('Remo en anillas', 'espalda', 'trx', 'traccion_horizontal', ['Ring row', 'Ring rows', 'Remo en TRX', 'TRX row'], 'Inverted_Row_with_Straps', sec=[{'grupo': 'biceps', 'factor': 0.5}]),
    N('Swing americano con kettlebell', 'gluteo', 'kettlebell', 'bisagra', ['American swing', 'American kettlebell swing', 'Swing americano'], sec=[{'grupo': 'isquiotibiales', 'factor': 0.5}, {'grupo': 'hombros', 'factor': 0.3}]),
    N('Arranque con mancuerna', 'cuerpo_completo', 'mancuernas', 'pliometria', ['Dumbbell snatch', 'DB snatch', 'Snatch con mancuerna'], unilateral=True),
    N('Devil press con mancuernas', 'cuerpo_completo', 'mancuernas', 'pliometria', ['Devil press', "Devil's press"]),
    N('Levantada turca con kettlebell', 'cuerpo_completo', 'kettlebell', 'core', ['Turkish get-up', 'TGU', 'Levantada turca'], 'Kettlebell_Turkish_Get-Up_Squat_style', unilateral=True),
    N('Wall ball', 'cuadriceps', 'balon_medicinal', 'sentadilla', ['Wall balls', 'Lanzamiento de balón a la pared', 'Wall ball shot'], sec=[{'grupo': 'gluteo', 'factor': 0.5}, {'grupo': 'hombros', 'factor': 0.3}]),
    N('Lanzamiento de balón al piso', 'cuerpo_completo', 'balon_medicinal', 'pliometria', ['Slam ball', 'Ball slam', 'Med ball slam']),
    N('Saltar la soga', 'gemelos', 'soga', 'pliometria', ['Single unders', 'Salto a la soga', 'Jump rope', 'Soga'], 'Rope_Jumping', mide='ambos'),
    N('Dobles con soga', 'gemelos', 'soga', 'pliometria', ['Double unders', 'DU', 'Doble salto con soga'], mide='ambos'),
    N('Remo ergómetro', 'cuerpo_completo', 'maquina', 'acarreo', ['Rowing', 'Máquina de remo', 'Remoergómetro', 'Concept2 row'], 'Rowing_Stationary', mide='seg', notas='Se registra por tiempo. Si hacés metros o calorías, anotalos en las notas.'),
    N('Bicicleta de aire', 'cuerpo_completo', 'maquina', 'acarreo', ['Assault bike', 'Air bike', 'Echo bike', 'Bike erg'], mide='seg', notas='Se registra por tiempo. Si hacés metros o calorías, anotalos en las notas.'),
    N('Esquí ergómetro', 'cuerpo_completo', 'maquina', 'acarreo', ['SkiErg', 'Ski erg', 'Esquí'], mide='seg', notas='Se registra por tiempo. Si hacés metros o calorías, anotalos en las notas.'),
    N('Empuje de trineo', 'cuadriceps', 'otro', 'acarreo', ['Sled push', 'Prowler', 'Empuje de prowler'], 'Sled_Push', mide='ambos', sec=[{'grupo': 'gluteo', 'factor': 0.5}]),
    N('Arrastre de trineo', 'cuerpo_completo', 'otro', 'acarreo', ['Sled drag', 'Sled pull', 'Arrastre de prowler'], mide='ambos'),
]


def main():
    ws = load_workbook(os.path.join(RAIZ, 'privado', 'nombres-ejercicios.xlsx'))['Ejercicios']
    cab = [c.value for c in ws[4]]
    col = {t: i + 1 for i, t in enumerate(cab)}
    # Se lee el catálogo original (antes de estos cambios) para emparejar por nombre actual.
    base = json.load(open(os.path.join(RAIZ, 'tools', 'seed', 'catalogo-original.json'), encoding='utf-8'))
    slug_de = {e['nombre']: e['slug'] for e in base}
    filas = {}
    for r in range(5, ws.max_row + 1):
        actual = ws.cell(row=r, column=col['Nombre actual']).value
        if not actual: continue
        filas[slug_de[actual]] = {
            'actual': actual,
            'sugerido': (ws.cell(row=r, column=col['Nombre sugerido']).value or '').strip(),
            'otros': [a.strip() for a in (ws.cell(row=r, column=col['Otros nombres (separados por punto y coma)']).value or '').split(';') if a.strip()],
        }
    assert len(filas) == len(base) == 100, (len(filas), len(base))

    fuera = set(FUSIONES) | set(BORRAR) | set(ELIMINAR)
    ejercicios = {}
    for slug, f in filas.items():
        if slug in fuera: continue
        nombre = FINAL.get(slug, f['sugerido'])
        alias = list(ALIAS.get(slug, f['otros'])) + ALIAS_EXTRA.get(slug, [])
        if f['sugerido'] != nombre and slug not in ALIAS: alias.append(f['sugerido'])
        alias.append(f['actual'])                      # el nombre viejo siempre se sigue reconociendo
        for de, a in FUSIONES.items():                 # y también los nombres de los que absorbió
            if a == slug: alias += [filas[de]['actual'], filas[de]['sugerido']]
        ejercicios[slug] = {'nombre': nombre, 'alias': alias, 'dos_pesas': slug in DOS_PESAS, **OTROS.get(slug, {})}
    nuevos = [dict(n, dos_pesas=n['nombre'] in DOS_PESAS_NUEVOS,
                   sec=[{'grupo': g, 'factor': f} for g, f in SEC_NUEVOS[n['nombre']].items()] if n['nombre'] in SEC_NUEVOS else n['sec']) for n in NUEVOS]
    assert set(SEC_NUEVOS) <= {n['nombre'] for n in NUEVOS}, 'SEC_NUEVOS nombra un ejercicio que no existe'
    assert set(DOS_PESAS_NUEVOS) <= {n['nombre'] for n in NUEVOS} and set(DOS_PESAS) <= set(filas), 'DOS_PESAS nombra un ejercicio que no existe'

    # Ningún nombre ni alias puede apuntar a dos ejercicios distintos; un alias igual al nombre propio sobra.
    visto = {}
    for slug, nombre, alias in [(s, e['nombre'], e['alias']) for s, e in ejercicios.items()] + [(n['slug'], n['nombre'], n['alias']) for n in nuevos]:
        propios, limpios = {norm(nombre)}, []
        assert visto.setdefault(norm(nombre), slug) == slug, f'nombre repetido: {nombre} ({slug} y {visto[norm(nombre)]})'
        for a in alias:
            k = norm(a)
            if k in propios: continue
            assert visto.setdefault(k, slug) == slug, f'"{a}" está en {slug} y en {visto[k]}'
            propios.add(k); limpios.append(a)
        alias[:] = limpios
    assert not (set(ejercicios) & {n['slug'] for n in nuevos}), 'un ejercicio nuevo repite el slug de uno existente'

    salida = {'rev': REV, 'ejercicios': ejercicios, 'fusiones': FUSIONES, 'archivar': ARCHIVAR, 'borrar': BORRAR, 'eliminar': ELIMINAR, 'nuevos': nuevos,
              'grupos': GRUPOS, 'patrones': PATRONES}
    ruta = os.path.join(RAIZ, 'tools', 'seed', 'catalogo-cambios.json')
    json.dump(salida, open(ruta, 'w', encoding='utf-8', newline='\n'), ensure_ascii=False, indent=1)
    print(f'{len(ejercicios)} renombrados · {len(FUSIONES)} fusionados · {len(ARCHIVAR)} archivados · {len(BORRAR) + len(ELIMINAR)} borrados · {len(nuevos)} nuevos → {len(ejercicios) + len(nuevos)} en total')

if __name__ == '__main__':
    main()
