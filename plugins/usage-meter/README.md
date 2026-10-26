# Usage Meter

Mod de Claude Code que muestra el consumo de la suscripción en el pie del prompt, en la misma línea que el modo de permisos.

```text
⏵⏵ auto mode on                                   5h ━━━━━━──── 58% · 2h 10m
```

## Qué muestra

- Una barra con el porcentaje de uso y el tiempo que falta para que la ventana se reinicie.
- Alterna cada 8 segundos entre la ventana de **5 horas** y la **semanal**.
- Verde por debajo del 75%, amarillo desde 75% y rojo desde 90%.

Claude Code solo informa las ventanas de 5 horas y semanal; no existe una ventana mensual. Con facturación por API key no hay consumo que mostrar, y el pie se queda como está.

## Configuración

| Opción | Por defecto | Descripción |
|---|---|---|
| `hideCycleHint` | Activada | Quita el texto `(shift+tab to cycle)` después del modo de permisos, para dejar espacio a la barra. Se cambia en `/config`. |

## Instalación

```text
/plugin marketplace add jmirandasq/claude-plugins
/plugin install usage-meter@jmirandasq
```

## Cómo funciona

Un único módulo de hooks ([`hooks/register.tsx`](hooks/register.tsx)):

- `session.measure` entrega las ventanas de consumo tras cada respuesta, y `$.session.usage()` la primera lectura al iniciar.
- La última lectura se guarda en `$.store`, así una sesión nueva la muestra antes de su primera respuesta.
- Un hook `ui.render` sobre `SessionMode` añade la barra después de lo que dibuja el motor.
- Un hook `ui.render` sobre `PromptHint` quita `(shift+tab to cycle)` de la línea de ayudas.

## Desarrollo

```bash
claude plugin validate .
claude plugin test .
```