# Formato de plan importable — `plan-gym/v1`

Es el archivo que acepta **Planes → Importar plan** en GymBro, y el mismo que genera **Exportar a archivo**. Para pedirle un plan a Claude desde la app: **Planes → Importar plan → Copiar pedido para Claude**, que copia este formato y el catálogo de quien la usa. Desde la PC: «armame un plan en formato plan-gym/v1» y pasale este documento junto con `data/catalogo-ejercicios.json`.

## Estructura

```json
{
 "formato": "plan-gym/v1",
 "plan": { "nombre": "Mesociclo C", "objetivo": "Fuerza en bisagra" },
 "dias": [
  { "nombre": "Día 1 · Cadera + tracción",
    "bloques": [
     { "orden": 1, "ejercicios": [
        { "ejercicio": "Psoas DINÁMICO", "series": [ {"reps": 10}, {"reps": 10} ] } ] },
     { "orden": 4, "ejercicios": [
        { "ejercicio": "Empuje de cadera - BR", "notas": "Subir si sale fácil",
          "series": [ {"reps": 6, "peso_kg": 130, "rpe": 8},
                      {"reps": 5, "peso_kg": 140, "rpe": 9},
                      {"reps": 4, "peso_kg": 150, "rpe": 10} ] },
        { "ejercicio": "Dominadas PRONA", "series": 3, "reps": 7, "peso_kg": 20, "rir": 2 },
        { "ejercicio": "Remo NEUTRO - MQ",
          "series": [ {"reps": 12, "rpe": 6}, {"reps": 12, "rpe": 8}, {"al_fallo": true, "rpe": 10} ] },
        { "ejercicio": "Hollow", "series": [ {"seg": 45}, {"seg": 45} ] } ] }
    ] }
 ]
}
```

## Reglas

| Regla | Detalle |
|---|---|
| Jerarquía | plan → días → bloques → ejercicios → series |
| Variables por serie | `reps`, `seg` (tiempo en segundos), `peso_kg`, `rir`, `rpe`, `al_fallo` |
| Mínimo por serie | Al menos una variable. Una serie vacía hace fallar la importación |
| RIR y RPE | Excluyentes: nunca los dos en la misma serie |
| RIR | Repeticiones en reserva. 0 = al fallo; más alto = más lejos del fallo |
| RPE | Esfuerzo percibido de 1 a 10. 10 = fallo |
| Peso con lastre | En dominadas, fondos y similares, `peso_kg` es el lastre agregado |
| Atajo | Si todas las series son iguales: `"series": 3` y los valores al lado (`"reps": 7, "peso_kg": 20, "rir": 2`) |
| Nombre del ejercicio | Se compara sin mayúsculas ni acentos contra nombre, descripción y otros nombres del catálogo |
| `grupo` (opcional) | Solo para ejercicios que no están en el catálogo: su músculo principal (`pecho`, `dorsal`, `biceps`, `gluteo`, `cuadriceps`, `isquios`, `core`…). Queda preelegido al crearlo |
| Ejercicio desconocido | La app pregunta: crearlo (con nombre editable) o vincularlo a uno existente. Si se vincula, el nombre del archivo queda guardado como «otro nombre» y la próxima vez se reconoce solo |
| Rotación | Los días rotan en el orden del archivo. No llevan fechas |

## Convenciones del programa actual

- Sesiones de 5 a 7 bloques: 1 movilidad, 2 core, 3 potencia y pliometría, 4-5 fuerza principal, 6-7 accesorios.
- Usar los nombres exactos de `data/catalogo-ejercicios.json` evita el paso de mapeo.
- RIR en trabajo con peso corporal o lastre; RPE en el resto. Movilidad y core suelen ir solo con reps o tiempo.
