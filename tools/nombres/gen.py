"""Arma privado/nombres-ejercicios.xlsx: nombre actual, nombre sugerido, otros nombres y la última vez que se hizo
cada ejercicio. Va en privado/ (fuera del repositorio) porque lleva fechas del historial personal.

Uso:  python tools/nombres/gen.py .        (requiere openpyxl)
"""
import json, os, sys
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

# slug: (nombre sugerido, [otros nombres], comentario)
N = {
 # ---------------- movilidad
 'flexo-extension-cadera-bd': ('Flexo-extensión de cadera con banda', ['Movilidad de cadera con banda', 'Flexión y extensión de cadera con banda', 'Banded hip flexion extension'], 'No vi el video: es la descripción literal del nombre.'),
 'psoas-dinamico': ('Estiramiento dinámico de psoas', ['Psoas dinámico', 'Estiramiento dinámico de flexores de cadera', 'Dynamic hip flexor stretch', 'Estiramiento de psoas'], ''),
 'aductores-dinamico': ('Estiramiento dinámico de aductores', ['Aductores dinámico', 'Movilidad de aductores', 'Dynamic adductor stretch', 'Estiramiento de aductores'], ''),
 'isquiotibiales-rd': ('Liberación de isquiotibiales con rodillo', ['Rodillo en isquiotibiales', 'Foam roller isquiotibiales', 'Masaje de isquios con rodillo', 'Hamstring foam roll', 'Hamstring SMR'], ''),
 'isquiotibiales-en-columna': ('Estiramiento de isquiotibiales con la pierna apoyada en una columna', ['Estiramiento de isquiotibiales en pared', 'Estiramiento de isquios acostado', 'Hamstring wall stretch', 'Supine hamstring stretch'], 'DUDA: interpreto "en columna" como la pierna apoyada contra una columna. Confirmar.'),
 'spiderman-rotacion-dt': ('Zancada Spiderman con rotación torácica', ['Spiderman con rotación', 'Estiramiento del mundo', "World's greatest stretch", 'Spiderman lunge with rotation', 'Zancada con rotación de tronco'], ''),
 'spiderman-rotacion': ('Zancada Spiderman con rotación', ['Spiderman rotación', 'Zancada con rotación'], 'Parece el mismo ejercicio que "Spiderman ROTACIÓN DT". ¿Se unifican?'),
 'carpas-dinamico': ('Carpa dinámica', ['Carpas dinámico', 'Pike dinámico', 'Dynamic pike', 'Perro boca abajo dinámico'], 'DUDA: no sé con certeza cómo es el movimiento.'),
 'carpa-2p': ('Carpa a dos piernas (estiramiento de cadena posterior)', ['Carpa', 'Pike stretch', 'Flexión de tronco al frente', 'Estiramiento de cadena posterior', 'Forward fold'], 'DUDA: no sé con certeza cómo es el movimiento.'),
 'buda-asistido-dc': ('Sentadilla profunda sostenida con disco', ['Buda asistido con disco', 'Sentadilla profunda asistida', 'Deep squat hold', 'Goblet squat hold', 'Movilidad en sentadilla profunda'], 'DUDA: interpreto "Buda" como sentadilla profunda sostenida, con el disco de contrapeso. Confirmar.'),
 'buda-rotacion-tronco-asistido': ('Sentadilla profunda con rotación de tronco', ['Buda con rotación de tronco', 'Deep squat con rotación torácica', 'Squat to thoracic rotation'], 'DUDA: misma interpretación de "Buda" que el anterior.'),
 'rotacion-tronco-pared-t': ('Rotación de tronco contra la pared', ['Rotación torácica en pared', 'Movilidad torácica en pared', 'Wall thoracic rotation', 'Rotación de tronco pared T'], 'DUDA: no sé qué significa la "T" (¿brazos en T?).'),
 'bretzel': ('Estiramiento Bretzel', ['Brettzel', 'Brettzel stretch', 'Pretzel stretch', 'Estiramiento pretzel'], 'Es un nombre propio conocido; lo dejaría casi igual.'),
 'caderas-y-piramidal': ('Estiramiento de cadera y piramidal', ['Estiramiento de piramidal', 'Piriformis stretch', 'Figura 4', 'Figure four stretch', 'Estiramiento de glúteo'], ''),
 'cadera-con-glide-lateral-cuadrupedia': ('Movilidad de cadera en cuadrupedia con deslizamiento lateral', ['Cadera con glide lateral', 'Quadruped hip lateral glide', 'Rock back lateral en cuadrupedia'], ''),
 # ---------------- core y activación
 'elevaciones-de-cadera-caminata-i-v': ('Puente de glúteo con marcha', ['Elevaciones de cadera con caminata', 'Puente de glúteo con marcha de piernas', 'Glute bridge march', 'Marching glute bridge'], 'La sigla I/V sigue sin resolver.'),
 'elevaciones-de-cadera-1p-mb': ('Puente de glúteo a una pierna con minibanda', ['Elevación de cadera a una pierna', 'Puente de glúteo unilateral', 'Single leg glute bridge', 'Banded single leg glute bridge'], ''),
 'puente-lateral-cambio': ('Plancha lateral cambiando de lado', ['Puente lateral con cambio', 'Plancha lateral alternada', 'Side plank alternado', 'Side plank switch'], 'DUDA: interpreto "cambio" como cambiar de lado.'),
 'puente-lateral-inclinado-con-apertura': ('Plancha lateral inclinada con apertura de pierna', ['Puente lateral inclinado con apertura', 'Side plank inclinado con elevación de pierna', 'Incline side plank with hip abduction'], 'DUDA: no sé si la "apertura" es de pierna o de brazo.'),
 'puente-isquio-con-cambio': ('Puente de isquiotibiales alternando piernas', ['Puente isquio con cambio', 'Puente de isquios alternado', 'Alternating hamstring bridge', 'Hamstring bridge'], 'DUDA: interpreto "cambio" como alternar la pierna de apoyo.'),
 'puente-de-cadera-cambio': ('Puente de glúteo alternando piernas', ['Puente de cadera con cambio', 'Puente de glúteo alternado', 'Alternating single leg glute bridge'], 'DUDA: interpreto "cambio" como alternar la pierna de apoyo.'),
 'giros-oh-en-tandem': ('Giros con kettlebell sobre la cabeza, en posición tándem', ['Giros overhead en tándem', 'Overhead rotations en tándem', 'Giros OH'], 'DUDA: no sé con certeza cómo es el movimiento.'),
 'cuadrupedia-con-patada': ('Patada de glúteo en cuadrupedia', ['Cuadrupedia con patada', 'Patada de burro', 'Donkey kick', 'Glute kickback', 'Extensión de cadera en cuadrupedia'], ''),
 'antiflexion-lateral-con-barra': ('Antiflexión lateral con barra', ['Sostén lateral con barra', 'Suitcase hold con barra', 'Antiflexión lateral'], 'DUDA: no sé cómo se sostiene la barra. Dejé el nombre casi igual.'),
 'anti-flexion-lateral-cambio-de-pie-bd': ('Antiflexión lateral con banda, cambiando de pie', ['Antiflexión lateral con banda', 'Banded lateral anti-flexion', 'Anti flexión lateral cambio de pie'], 'DUDA: no sé con certeza cómo es el movimiento.'),
 'plancha-construyo': ('Plancha frontal con disco', ['Plancha con lastre', 'Plancha con disco en la espalda', 'Weighted plank', 'Plancha construyo'], 'DUDA: "CONSTRUYO" sin resolver. Confirmar cómo es.'),
 'plancha-copenhague-1-2-con': ('Plancha Copenhague corta (apoyo en la rodilla)', ['Plancha Copenhague', 'Copenhagen plank', 'Plancha de aductores', 'Short lever Copenhagen plank', 'Copenhague'], 'DUDA: "1/2 CON" sin resolver; interpreto la versión corta.'),
 'plancha-alta-carrera': ('Escaladores (plancha alta llevando rodillas al pecho)', ['Plancha alta con carrera', 'Escalador', 'Mountain climbers', 'Mountain climber', 'Plancha con rodillas al pecho'], 'DUDA: interpreto "carrera" como escaladores.'),
 'plancha-lateral-giro': ('Plancha lateral con giro de tronco', ['Plancha lateral con rotación', 'Side plank con rotación', 'Side plank rotation', 'Thread the needle'], ''),
 'abdominal-con-aductores': ('Abdominal apretando con los aductores', ['Abdominal con aductores', 'Crunch con aductores', 'Crunch apretando pelota entre las rodillas', 'Adductor squeeze crunch'], 'DUDA: no sé con qué se aprieta (pelota, aro…).'),
 'descenso-piernas-rectas-con-control-abdomen': ('Descenso de piernas rectas, acostado', ['Bajada de piernas rectas', 'Elevación de piernas acostado', 'Leg lowering', 'Lying leg raise', 'Leg raises'], ''),
 'caminata-de-camarera-1m-kb': ('Caminata del camarero con kettlebell (un brazo arriba)', ['Caminata de camarera', 'Caminata de mozo', 'Waiter walk', 'Waiter carry', 'Caminata con kettlebell sobre la cabeza', 'Overhead carry a un brazo'], ''),
 'hollow': ('Hollow (posición hueca sostenida)', ['Hollow hold', 'Hollow body', 'Hollow body hold', 'Posición hueca', 'Banana'], ''),
 'bear-crawl-dinamico': ('Caminata de oso', ['Bear crawl', 'Gateo de oso', 'Bear walk', 'Desplazamiento en cuadrupedia'], ''),
 'desliz-barra-en-puntas': ('Rueda abdominal con barra, en puntas de pie', ['Desliz de barra', 'Rollout con barra', 'Barbell rollout', 'Ab rollout con barra', 'Rueda abdominal de pie'], 'DUDA: interpreto que es la rueda abdominal hecha con la barra.'),
 # ---------------- potencia y pliometría
 'thrusters-kb': ('Thruster con kettlebell (sentadilla + press)', ['Thrusters', 'Thruster con pesa rusa', 'Kettlebell thruster', 'Sentadilla con press de hombros', 'Squat to press'], ''),
 'swing-cadera-ra-kb': ('Swing con kettlebell y banda elástica', ['Swing con kettlebell', 'Swing con pesa rusa', 'Kettlebell swing', 'Balanceo con kettlebell', 'Banded kettlebell swing', 'Swing ruso'], ''),
 'swing-thruster': ('Swing + thruster con kettlebell', ['Swing y thruster', 'Complejo swing thruster', 'Kettlebell swing to thruster'], ''),
 'sentadilla-salto-kb': ('Sentadilla con salto con kettlebell', ['Sentadilla salto', 'Salto con carga', 'Jump squat', 'Squat jump', 'Weighted jump squat', 'Sentadilla con salto'], ''),
 'sentadilla-split-salto-cambio-kb': ('Zancada con salto alternado con kettlebell', ['Estocada con salto y cambio', 'Tijeras con salto', 'Split jump', 'Jumping lunge', 'Split squat jump', 'Scissor jump'], ''),
 '2do-tiempo-split-br': ('Envión en tijera con barra (split jerk)', ['Segundo tiempo en split', 'Segundo tiempo', 'Split jerk', 'Jerk en tijera', 'Envión'], ''),
 'burpee': ('Burpee', ['Burpees', 'Burpi'], 'Ya es claro.'),
 '1p-a-otro-cc-diagonal': ('Salto en diagonal de una pierna a la otra', ['Saltos de patinador en diagonal', 'Skater jump', 'Diagonal bounds', 'Saltos alternados en diagonal'], 'La sigla CC sigue sin resolver.'),
 '1p-ccm-vertical-al-cajon-cj': ('Salto al cajón a una pierna', ['Salto vertical a una pierna al cajón', 'Box jump a una pierna', 'Single leg box jump', 'Salto al cajón unilateral'], ''),
 '2p-ba-ccm-vertical': ('Salto vertical a dos piernas con contramovimiento', ['Salto vertical', 'Salto con contramovimiento', 'CMJ', 'Countermovement jump', 'Vertical jump'], 'La sigla BA sigue sin resolver.'),
 'triple-extension-lm': ('Triple extensión en landmine', ['Landmine triple extension', 'Extensión explosiva en landmine', 'Triple extensión con barra anclada'], ''),
 'caida-lm': ('Caída y recepción en landmine', ['Caída en landmine', 'Landmine drop', 'Drop catch en landmine'], 'DUDA: no sé con certeza cómo es el movimiento.'),
 'reactivos-verticales-laterales': ('Saltos reactivos verticales y laterales', ['Reactivos verticales y laterales', 'Pogo jumps', 'Pogos', 'Rebotes de tobillo', 'Reactive hops'], ''),
 'reactivos-laterales': ('Saltos reactivos laterales', ['Reactivos laterales', 'Pogo jumps laterales', 'Lateral pogo hops', 'Rebotes laterales'], ''),
 'rebote-y-freno': ('Rebote y frenado (salto con aterrizaje controlado)', ['Rebote y freno', 'Salto con recepción', 'Aterrizaje y freno', 'Drop and stick', 'Snap down'], 'DUDA: no sé con certeza cómo es el movimiento.'),
 'laterales-con-banda': ('Desplazamientos laterales con banda', ['Laterales con banda', 'Caminata lateral con banda', 'Pasos laterales con minibanda', 'Lateral band walk', 'Monster walk lateral'], 'DUDA: está cargado como pliometría; puede ser con saltos y no caminando.'),
 # ---------------- piernas
 'sentadilla-br': ('Sentadilla con barra', ['Sentadilla', 'Sentadilla trasera', 'Sentadilla libre', 'Back squat', 'Barbell squat', 'Squat'], ''),
 'sentadilla-bulgara-ra-br': ('Sentadilla búlgara con barra y banda elástica', ['Sentadilla búlgara', 'Búlgara', 'Zancada búlgara', 'Bulgarian split squat', 'Rear foot elevated split squat', 'Split squat con pie elevado'], ''),
 'sentadilla-al-cajon-ra-br': ('Sentadilla al cajón con barra y banda elástica', ['Sentadilla al cajón', 'Sentadilla a banco', 'Box squat', 'Box squat con bandas'], ''),
 'estocada-atras-br': ('Estocada hacia atrás con barra', ['Estocada atrás', 'Zancada atrás', 'Zancada inversa', 'Reverse lunge', 'Barbell reverse lunge', 'Estocada inversa'], ''),
 'empuje-de-cadera-br': ('Hip thrust con barra', ['Empuje de cadera', 'Empuje de cadera con barra', 'Hip thrust', 'Barbell hip thrust', 'Elevación de cadera con barra'], ''),
 'empuje-de-cadera-1p-br': ('Hip thrust a una pierna con barra', ['Empuje de cadera a una pierna', 'Hip thrust unilateral', 'Single leg hip thrust', 'Empuje de cadera unilateral'], ''),
 'peso-muerto-br': ('Peso muerto con barra', ['Peso muerto', 'Peso muerto convencional', 'Deadlift', 'Barbell deadlift', 'Conventional deadlift', 'Despegue'], ''),
 'peso-muerto-1p-kb': ('Peso muerto a una pierna con kettlebell', ['Peso muerto a una pierna', 'Peso muerto unilateral', 'Single leg deadlift', 'Single leg RDL', 'Peso muerto rumano a una pierna'], ''),
 'caminata-de-gemelo-mc': ('Caminata en puntas de pie con mancuernas', ['Caminata de gemelo', 'Caminata de gemelos', 'Caminata de puntillas con carga', 'Tiptoe walk', 'Farmer walk en puntas'], ''),
 'curl-nordico': ('Curl nórdico de isquiotibiales', ['Curl nórdico', 'Nórdicos', 'Nordic curl', 'Nordic hamstring curl', 'Nordic hamstring'], ''),
 'curl-isquio-1p-exc-mb': ('Curl de isquiotibiales excéntrico a una pierna con banda', ['Curl de isquios con banda', 'Curl femoral unilateral con banda', 'Banded single leg hamstring curl'], ''),
 'curl-isquios-1p-exc-fb': ('Curl de isquiotibiales excéntrico a una pierna en fitball', ['Curl femoral en pelota a una pierna', 'Single leg swiss ball leg curl', 'Single leg stability ball hamstring curl'], ''),
 'curl-isquios-fb': ('Curl de isquiotibiales en fitball', ['Curl de isquios en pelota', 'Curl femoral en pelota suiza', 'Swiss ball leg curl', 'Stability ball hamstring curl', 'Ball leg curl'], ''),
 'patadas-de-talon-fb': ('Patadas de talón en fitball', ['Taloneo en fitball', 'Patadas de talón en pelota', 'Heel kicks en fitball'], 'DUDA: no sé con certeza cómo es el movimiento.'),
 'isquiotibiales-en-polea': ('Curl de isquiotibiales en polea', ['Isquiotibiales en polea', 'Curl femoral en polea', 'Cable hamstring curl', 'Standing cable leg curl'], 'DUDA: interpreto que es un curl de pie en polea baja.'),
 'excentrico-carrera-isquios-polea': ('Excéntrico de isquiotibiales en gesto de carrera, con polea', ['Excéntrico de isquios en polea', 'Isquios en gesto de sprint con polea', 'Cable hamstring sprint eccentric'], ''),
 'gesto-sprint-isquios-con-slider': ('Curl de isquiotibiales con deslizadores, en gesto de sprint', ['Gesto de sprint con slider', 'Curl de isquios con deslizadores', 'Slider hamstring curl', 'Slider leg curl', 'Hamstring slides'], ''),
 'camilla-isquiosurales-1p-mq': ('Curl femoral acostado a una pierna, en máquina', ['Camilla de isquiotibiales', 'Camilla femoral', 'Camilla de isquiosurales', 'Lying leg curl', 'Single leg lying leg curl', 'Curl femoral tumbado', 'Leg curl'], ''),
 # ---------------- pecho y tríceps
 'press-plano': ('Press de banca con barra', ['Press plano', 'Press de banca', 'Press banca', 'Press de banco', 'Press de pecho', 'Bench press', 'Barbell bench press', 'Chest press'], '"Chest press" suele ser en máquina; lo sumé porque lo diste de ejemplo.'),
 'press-inclinado-con-mancuernas': ('Press inclinado con mancuernas', ['Press de banca inclinado con mancuernas', 'Press superior con mancuernas', 'Incline dumbbell press', 'Incline dumbbell bench press'], 'Ya es claro.'),
 'aperturas-mq': ('Aperturas de pecho en máquina', ['Aperturas en máquina', 'Mariposa', 'Contractora de pecho', 'Pec deck', 'Peck deck', 'Butterfly', 'Machine fly', 'Chest fly'], ''),
 'push-up-dc': ('Flexiones de brazos con disco en la espalda', ['Flexiones con lastre', 'Lagartijas con disco', 'Push up con disco', 'Weighted push up', 'Flexiones lastradas'], ''),
 'fondos': ('Fondos en paralelas', ['Fondos', 'Dips', 'Fondos de tríceps', 'Fondos de pecho', 'Parallel bar dips', 'Chest dips'], ''),
 'fondos-asistidos-mq': ('Fondos en paralelas asistidos, en máquina', ['Fondos asistidos', 'Dips asistidos', 'Assisted dips', 'Machine assisted dip'], ''),
 # ---------------- hombro
 'press-militar-br': ('Press militar con barra, de pie', ['Press militar', 'Press de hombros con barra', 'Press sobre la cabeza', 'Overhead press', 'OHP', 'Military press', 'Standing barbell press'], ''),
 'press-hombro-mq': ('Press de hombros en máquina', ['Press hombro en máquina', 'Press militar en máquina', 'Machine shoulder press', 'Shoulder press machine'], ''),
 'press-hombro-ba-kb': ('Press de hombros con dos kettlebells, de pie', ['Press de hombros con pesas rusas', 'Double kettlebell press', 'Kettlebell overhead press', 'Two arm kettlebell military press'], 'La sigla BA sigue sin resolver. Según el video: dos brazos, de pie.'),
 'press-hombro-rr-kb': ('Press de hombros con kettlebell desde el pecho, con rotación', ['Press de hombro con kettlebell', 'Kettlebell press con rotación', 'Kettlebell shoulder press'], 'DUDA: la sigla RR sigue sin resolver.'),
 'press-hombro-1m-rr-kb': ('Press de hombro a un brazo con kettlebell, con rotación', ['Press unilateral con kettlebell', 'Press a un brazo con pesa rusa', 'Single arm kettlebell press', 'One arm kettlebell press'], 'DUDA: la sigla RR sigue sin resolver.'),
 'press-hombro-1m-pdb-kb': ('Press de hombro a un brazo con kettlebell, con una rodilla en el piso', ['Press semiarrodillado con kettlebell', 'Half kneeling kettlebell press', 'Press unilateral de rodillas'], 'DUDA: la sigla PDB sigue sin resolver; parecía ser con la rodilla en el piso.'),
 'press-en-landmine': ('Press en landmine', ['Landmine press', 'Press con barra anclada', 'Press en mina', 'Single arm landmine press'], 'Ya es claro si se conoce el landmine.'),
 # ---------------- espalda
 'dominadas-prona': ('Dominadas con agarre prono', ['Dominadas', 'Dominadas pronas', 'Dominadas prona', 'Pull up', 'Pull ups', 'Pullups', 'Barra fija'], ''),
 'dominadas-palmar': ('Dominadas con agarre supino', ['Dominadas supinas', 'Dominadas palmar', 'Dominadas con palmas hacia uno', 'Chin up', 'Chin ups'], ''),
 'dorsalera-palmar-mq': ('Jalón al pecho con agarre supino', ['Dorsalera supina', 'Dorsalera palmar', 'Polea al pecho con agarre supino', 'Lat pulldown supino', 'Underhand lat pulldown', 'Reverse grip pulldown'], ''),
 'remo-neutro-mq': ('Remo en máquina con agarre neutro', ['Remo neutro', 'Remo sentado en máquina', 'Machine row', 'Seated row machine', 'Remo bajo con agarre neutro'], ''),
 'remo-1m-plancha-alta-kb': ('Remo a un brazo en plancha alta con kettlebell', ['Remo renegado', 'Renegade row', 'Remo en plancha', 'Plank row', 'Remo renegado con pesa rusa'], ''),
 'remo-1m-cd-kb': ('Remo a un brazo con kettlebell, de pie inclinado y sin apoyo', ['Remo a un brazo con kettlebell', 'Remo unilateral con pesa rusa', 'One arm kettlebell row', 'Single arm bent over row'], 'La sigla CD sigue sin resolver.'),
 'remo-al-menton-br': ('Remo al mentón con barra', ['Remo al mentón', 'Remo vertical', 'Remo al cuello', 'Upright row', 'Barbell upright row'], ''),
 'remo-invertido-puente-br': ('Remo invertido en barra, con la cadera en puente', ['Remo invertido', 'Remo australiano', 'Dominada australiana', 'Inverted row', 'Australian pull up', 'Body row'], ''),
 'remo-pendley-prono': ('Remo Pendlay con barra, agarre prono', ['Remo Pendlay', 'Remo Pendley', 'Pendlay row', 'Remo con barra desde el piso', 'Remo con barra inclinado', 'Bent over row', 'Barbell row'], 'El nombre correcto es "Pendlay"; en la app está escrito "Pendley".'),
 'remo-tandem-en-puntas': ('Remo en posición tándem, en puntas de pie', ['Remo en tándem', 'Remo tándem en puntas', 'Tandem stance row'], 'DUDA: no sé con certeza cómo es el movimiento.'),
 'y-bd': ('Elevación en Y con banda', ['Y con banda', 'Elevaciones en Y', 'Y raise', 'Band Y raise'], ''),
 # ---------------- brazos y hombro lateral
 'biceps-br': ('Curl de bíceps con barra', ['Bíceps con barra', 'Curl con barra', 'Curl de bíceps', 'Barbell curl', 'Barbell biceps curl'], ''),
 'biceps-mc': ('Curl de bíceps con mancuernas', ['Bíceps con mancuernas', 'Curl con mancuernas', 'Dumbbell curl', 'Dumbbell bicep curl'], ''),
 'biceps-alterno-mc': ('Curl de bíceps alternado con mancuernas', ['Bíceps alterno', 'Curl alterno', 'Curl alternado', 'Alternating dumbbell curl', 'Alternate bicep curl'], ''),
 'biceps-hombro-mc': ('Curl de bíceps + press de hombros con mancuernas', ['Bíceps y hombro', 'Curl y press', 'Curl con press', 'Curl to press', 'Bicep curl to shoulder press'], ''),
 'triceps-pl': ('Extensión de tríceps en polea', ['Tríceps en polea', 'Jalón de tríceps', 'Tríceps con soga', 'Triceps pushdown', 'Pushdown', 'Cable pushdown'], ''),
 'vuelo-combinado-alterno': ('Vuelos frontal y lateral alternados con mancuernas', ['Vuelo combinado alterno', 'Vuelos combinados', 'Elevaciones frontales y laterales alternadas'], 'DUDA: no sé con certeza cómo es la combinación.'),
 'vuelo-frontal-lateral': ('Vuelos frontales + laterales con mancuernas', ['Vuelo frontal y lateral', 'Elevaciones frontales y laterales', 'Front raise to lateral raise', 'Lateral to front raise'], ''),
}

def main(raiz):
    cat = json.load(open(f'{raiz}/src/seed.json', encoding='utf-8'))['exercises']
    faltan = [e['slug'] for e in cat if e['slug'] not in N]
    sobran = [s for s in N if s not in {e['slug'] for e in cat}]
    assert not faltan and not sobran, (faltan, sobran)

    def categoria(e):   # igual que categoria() en src/lib.ts
        if not e['vol'] or e['patron'] == 'movilidad': return 'Movilidad'
        if e['patron'] == 'pliometria': return 'Potencia y pliometría'
        if e['grupo'] == 'core' or e['patron'].startswith('core'): return 'Core'
        if e['grupo'] == 'full_body': return 'Cuerpo completo'
        acentos = {'biceps': 'Bíceps', 'triceps': 'Tríceps', 'gluteo': 'Glúteo', 'cuadriceps': 'Cuádriceps'}
        return acentos.get(e['grupo'], e['grupo'].replace('_', ' ').capitalize())

    # Última sesión en la que aparece cada ejercicio (del historial personal, si está en esta PC).
    ultima = {}
    ruta_hist = f'{raiz}/src/seed-historial.json'
    if os.path.exists(ruta_hist):
        for ses in json.load(open(ruta_hist, encoding='utf-8')):
            for fila in ses['sets']:
                if fila[0] not in ultima or ses['fecha'] >= ultima[fila[0]][0]: ultima[fila[0]] = (ses['fecha'], ses['nombre'])
    plan = json.load(open(f'{raiz}/src/seed.json', encoding='utf-8'))['plan']
    en_plan = {}
    for d in plan['dias']:
        for b in d['bloques']:
            for x in b['ejercicios']: en_plan.setdefault(x['slug'], []).append(f"{d['nombre'].split(' · ')[0]}, bloque {b['orden']}")
    def donde(slug):
        partes = []
        if slug in ultima:
            f, nombre = ultima[slug]
            partes.append(f'{f[8:10]}/{f[5:7]}/{f[0:4]} — {nombre}')
        else:
            partes.append('Sin registros en el historial')
        if slug in en_plan: partes.append('Plan actual: ' + '; '.join(en_plan[slug]))
        return chr(10).join(partes)

    wb = Workbook(); ws = wb.active; ws.title = 'Ejercicios'
    fuente = Font(name='Arial', size=10); negrita = Font(name='Arial', size=10, bold=True)
    borde = Border(bottom=Side(style='thin', color='D9D9D9'))
    ws['A1'] = 'GymBro — nombres de los ejercicios'; ws['A1'].font = Font(name='Arial', size=14, bold=True)
    ws['A2'] = ('Cómo usarlo: las columnas amarillas son para que las edites. En "Nombre sugerido" dejá el nombre que querés que se vea en la app; '
                'en "Otros nombres" van los nombres con los que se tiene que reconocer el ejercicio al importar un plan, separados por punto y coma. '
                'Las filas marcadas con DUDA son las que no pude interpretar con certeza; la última columna dice cuándo lo hiciste por última vez y en qué día del plan actual está, para ubicarlo. No cambies la columna "Nombre actual": es la que identifica al ejercicio.')
    ws['A2'].font = fuente; ws['A2'].alignment = Alignment(wrap_text=True, vertical='top'); ws.merge_cells('A2:F2'); ws.row_dimensions[2].height = 58
    cab = ['Nombre actual', 'Nombre sugerido', 'Otros nombres (separados por punto y coma)', 'Comentario', 'Categoría', 'Última vez que lo hice']
    for c, t in enumerate(cab, 1):
        x = ws.cell(row=4, column=c, value=t); x.font = Font(name='Arial', size=10, bold=True, color='FFFFFF')
        x.fill = PatternFill('solid', start_color='1F2933'); x.alignment = Alignment(vertical='center', wrap_text=True)
    ws.row_dimensions[4].height = 30
    amarillo = PatternFill('solid', start_color='FFF9D6'); duda = PatternFill('solid', start_color='FDE9D9')
    for i, e in enumerate(cat):
        sug, otros, com = N[e['slug']]
        fila = 5 + i
        valores = [e['nombre'], sug, '; '.join(otros), com, categoria(e), donde(e['slug'])]
        for c, v in enumerate(valores, 1):
            x = ws.cell(row=fila, column=c, value=v); x.font = negrita if c == 2 else fuente
            x.alignment = Alignment(wrap_text=True, vertical='top'); x.border = borde
            if c in (2, 3): x.fill = amarillo
            if c == 4 and com.startswith('DUDA'): x.fill = duda
    for c, w in enumerate([38, 46, 70, 52, 22, 46], 1): ws.column_dimensions[get_column_letter(c)].width = w
    ws.freeze_panes = 'B5'; ws.auto_filter.ref = f'A4:F{4 + len(cat)}'
    os.makedirs(f'{raiz}/privado', exist_ok=True)
    salida = f'{raiz}/privado/nombres-ejercicios.xlsx'; wb.save(salida)
    dudas = sum(1 for s in N.values() if s[2].startswith('DUDA'))
    print(f'{len(cat)} ejercicios · {dudas} con DUDA · {salida}')

if __name__ == '__main__':
    main(sys.argv[1])
