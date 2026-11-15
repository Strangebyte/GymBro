# GymBro

App de entrenamiento personal: planes por día, registro de series, wellness, otras actividades, calendario
y progreso. Funciona en el navegador y se instala en Android como app. Los datos quedan en el dispositivo.

## Empezar

```bash
npm install
npm run dev
```

Para compilar y probar:

```bash
npm run build
pip install playwright && playwright install chromium   # una sola vez
npm run test:e2e
```

## Créditos

Las imágenes de ejercicios incluidas vienen de [Free Exercise DB](https://github.com/yuhonas/free-exercise-db),
de dominio público.

## Documentación

| Archivo | Para qué |
|---|---|
| `CLAUDE.md` | Contexto, reglas y trampas para trabajar el proyecto con Claude Code |
| `PROJECT_STATUS.md` | Qué está hecho, qué falta, limitaciones conocidas |
| `docs/DECISIONES.md` | Decisiones tomadas y sus razones |
| `docs/DEPLOY.md` | Cómo publicarla en un hosting propio |
| `docs/formato-plan-gym.md` | Formato del archivo de plan importable |
| `data/` | Catálogo y plan actual en JSON (para pedirle planes nuevos a Claude) |
