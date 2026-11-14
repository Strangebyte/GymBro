# Publicar la app

`npm run build` genera `dist/`: archivos estáticos que funcionan en cualquier hosting con HTTPS.
`base: './'` en `vite.config.ts` permite servirla desde un subdirectorio.

Fuera de Claude y con HTTPS la app registra un service worker (ver `src/main.tsx`): queda instalable desde
Chrome en Android ("Agregar a pantalla de inicio" / "Instalar app") y funciona sin conexión. Al abrirla pide
almacenamiento persistente para que Android no borre los datos.

> **Nada de este documento está probado todavía.** Son los pasos previstos; el primer deploy es la prueba.

## Opción A — GitHub Pages (recomendada)

El flujo está en `.github/workflows/deploy.yml` y corre en cada push a `main`. La carpeta ya es un
repositorio git con el primer commit hecho (14-11-2026); falta crear el repositorio en GitHub y subirlo.

1. Crear un repositorio en GitHub (público: Pages en repositorios privados requiere plan pago). El historial
   de entrenamiento no se sube: está en `.gitignore`.
2. Subir los cambios con `git push` (el remoto `origin` ya está configurado).
3. En GitHub: **Settings → Pages → Source: GitHub Actions**.
4. El flujo corre en cada push a `main`. La dirección queda en la pestaña Actions, en el paso de deploy.

## Opción B — Subir `dist/` a mano

Netlify, Cloudflare Pages y Vercel aceptan una carpeta estática. Compilar y subir `dist/`.

## Después del primer deploy

- Abrir la dirección en Chrome en el Android e instalarla.
- En Ajustes verificar "Almacenamiento protegido: sí".
- **Los datos no viajan solos.** Lo cargado en la vista previa de Claude vive en otro origen: exportar una
  copia allá (Ajustes → Exportar copia) y restaurarla en la app instalada.
- Probar en el teléfono lo que no se pudo verificar en el simulador: reproducción de video, vibración,
  pantalla siempre encendida durante la sesión, scroll táctil con una hoja abierta.

## Sobre el historial

El repositorio es público y **no incluye el historial del dueño**. La app publicada arranca con el catálogo y el
plan, sin sesiones. Para cargar las 29 sesiones en el teléfono: pasar `privado/gym-log-historial.json` al
teléfono y en la app ir a Ajustes → Restaurar desde una copia.

En la PC del dueño, `npm run build` sí incluye el historial (existe `src/seed-historial.json`); por eso **no hay
que subir `dist/` a mano a ningún lado**: publicar siempre por push, que compila en GitHub sin ese archivo.
