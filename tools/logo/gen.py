"""Genera el ícono de GymBro: una mancuerna en diagonal con un degradé verde → azul → violeta (las tres
paletas de la app) sobre fondo casi negro.

Uso:  python tools/logo/gen.py        (requiere Pillow: pip install pillow)
Escribe public/icon-192.png y public/icon-512.png. El dibujo queda dentro de la zona segura de los íconos
"maskable" de Android (el círculo central del 80 %), así no se recorta con ninguna forma de ícono.
"""
import os
from PIL import Image, ImageDraw, ImageFilter

RAIZ = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
N = 2048          # se dibuja grande y se achica, para que los bordes queden suaves
C = N // 2

def mezcla(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

def degrade(colores):
    """Imagen N×N con un degradé horizontal que pasa por los colores dados."""
    fila = Image.new('RGB', (N, 1))
    for x in range(N):
        t = min(1, max(0, (x - 300) / (N - 600))) * (len(colores) - 1)
        i = min(int(t), len(colores) - 2)
        fila.putpixel((x, 0), mezcla(colores[i], colores[i + 1], t - i))
    return fila.resize((N, N))

def fondo():
    """Casi negro, apenas más claro en el centro."""
    img = Image.new('RGB', (N, N), (11, 12, 15))
    luz = Image.new('L', (N, N), 0)
    ImageDraw.Draw(luz).ellipse((C - 900, C - 900, C + 900, C + 900), fill=255)
    luz = luz.filter(ImageFilter.GaussianBlur(300))
    return Image.composite(Image.new('RGB', (N, N), (30, 33, 42)), img, luz)

def mancuerna():
    """Máscara de la mancuerna, horizontal y centrada."""
    m = Image.new('L', (N, N), 0)
    d = ImageDraw.Draw(m)
    def pieza(x0, x1, alto, r):
        for s in (-1, 1):
            a, b = sorted((C + s * x0, C + s * x1))
            d.rounded_rectangle((a, C - alto, b, C + alto), radius=r, fill=255)
    d.rounded_rectangle((C - 360, C - 52, C + 360, C + 52), radius=52, fill=255)   # barra
    pieza(300, 462, 340, 62)    # discos grandes
    pieza(500, 632, 232, 58)    # discos chicos
    pieza(640, 706, 62, 40)     # puntas
    return m

def icono():
    forma = mancuerna().rotate(45, resample=Image.BICUBIC)
    color = degrade([(47, 224, 176), (79, 155, 255), (167, 139, 255)]).rotate(45, resample=Image.BICUBIC)
    img = fondo()
    # un halo suave del mismo color detrás, para que resalte sobre el fondo
    halo = forma.filter(ImageFilter.GaussianBlur(70)).point(lambda v: int(v * 0.35))
    img = Image.composite(color, img, halo)
    return Image.composite(color, img, forma)

if __name__ == '__main__':
    base = icono()
    for lado in (512, 192):
        base.resize((lado, lado), Image.LANCZOS).save(os.path.join(RAIZ, 'public', f'icon-{lado}.png'), optimize=True)
    print('íconos escritos en public/')
