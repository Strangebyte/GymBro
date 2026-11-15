"""Arma las imágenes de ejercicios que vienen con la app.

Fuente: Free Exercise DB (https://github.com/yuhonas/free-exercise-db), de dominio público (Unlicense).
Cada ejercicio trae dos fotos (posición inicial y final): se pegan una arriba de la otra en una sola
imagen, que en la pantalla angosta del teléfono se ve más grande que lado a lado.

Uso:  python tools/imagenes/gen.py        (requiere Pillow y conexión)
Escribe src/ejercicios-img/<slug>.webp. La app las reconoce por el nombre del archivo: tiene que ser el
`slug` del ejercicio en el catálogo. Para sumar una, agregarla a MAPA y volver a correr.
"""
import io, os, urllib.request
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
}

def foto(carpeta, n):
    with urllib.request.urlopen(f'{BASE}{carpeta}/{n}.jpg', timeout=30) as r:
        img = Image.open(io.BytesIO(r.read())).convert('RGB')
    return img.resize((ANCHO, round(img.height * ANCHO / img.width)), Image.LANCZOS)

if __name__ == '__main__':
    destino = os.path.join(RAIZ, 'src', 'ejercicios-img')
    os.makedirs(destino, exist_ok=True)
    for slug, carpeta in MAPA.items():
        a, b = foto(carpeta, 0), foto(carpeta, 1)
        junta = Image.new('RGB', (ANCHO, a.height + b.height + 6), 'white')
        junta.paste(a, (0, 0)); junta.paste(b, (0, a.height + 6))
        ruta = os.path.join(destino, f'{slug}.webp')
        junta.save(ruta, 'WEBP', quality=72, method=6)
        print(f'{slug}: {junta.width}x{junta.height}, {os.path.getsize(ruta) // 1024} KB')
