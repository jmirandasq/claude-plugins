# Usage Meter

Mod de Claude Code que muestra el consumo de la suscripción, por defecto en el pie del prompt, en la misma línea que el modo de permisos.

```text
⏵⏵ auto mode on                                   5h ━━━━━━──── 58% · 2h 10m
```

## Qué muestra

- Una barra con el porcentaje de uso y el tiempo que falta para que la ventana se reinicie.
- Alterna cada 8 segundos entre la ventana de **5 horas** y la **semanal**.
- En el color de acento (verde por defecto) por debajo del 75%, amarillo desde 75% y rojo desde 90%.

Claude Code solo informa las ventanas de 5 horas y semanal; no existe una ventana mensual. Con facturación por API key no hay consumo que mostrar, y el pie se queda como está.

## Configuración

| Opción | Por defecto | Descripción |
|---|---|---|
| `accentColor` | `green` | Color de la barra por debajo del 75%: `green` (el verde de marca, `#00A859`), `orange`, `blue`, `purple` o `teal`. Salvo `green`, cada uno sigue el tema de Claude Code. Se cambia en `/config`. |
| `position` | `footer` | Dónde aparece la barra: `above`, `footer` o `hint`. Ver abajo. |
| `hideCycleHint` | Activada | Quita el texto `(shift+tab to cycle)` después del modo de permisos, para dejar espacio a la barra. Se cambia en `/config`. |

### Cambiar el color

1. Abre `/config` en una sesión de Claude Code.
2. Busca la fila **Accent color** del plugin.
3. Elige `green`, `orange`, `blue`, `purple` o `teal`.

El cambio se ve al momento: el plugin se recarga solo con el color nuevo, en la barra de consumo.

### Cambiar la posición

En `/config`, la fila **Position** del plugin:

| Valor | Dónde aparece |
|---|---|
| `above` | En la banda encima del prompt. |
| `footer` | En la línea bajo el prompt, a la derecha, después del modo de permisos. |
| `hint` | Al final de las ayudas bajo el prompt (`? for shortcuts`). |

En las tres posiciones se ve igual, con sus colores. Se adapta al ancho de la terminal: cada pieza es un bloque que nunca se parte, y cuando no cabe pasa entera a la línea siguiente. Con menos de 80 columnas, la barra se acorta a 5 celdas. Si `session-info` y `usage-meter` eligen la misma posición, se muestran los dos.

## Instalación

```text
/plugin marketplace add jmirandasq/claude-plugins
/plugin install usage-meter@jmirandasq
```

## Actualización

```bash
claude plugin marketplace update jmirandasq
claude plugin update usage-meter@jmirandasq
```

Después, `/reload-plugins` en la sesión abierta, o una sesión nueva.

## Cómo funciona

Un único módulo de hooks ([`hooks/register.tsx`](hooks/register.tsx)):

- `session.measure` entrega las ventanas de consumo tras cada respuesta, y `$.session.usage()` la primera lectura al iniciar.
- La última lectura se guarda en `$.store`, así una sesión nueva la muestra antes de su primera respuesta.
- Según `position`, un hook `ui.render` dibuja la barra sobre `AbovePrompt` (la banda), sobre `SessionMode` (después de lo que dibuja el motor) o sobre `PromptHint` (después de la línea de ayudas).
- Un hook `ui.render` sobre `PromptHint` quita `(shift+tab to cycle)` de la línea de ayudas.

## Desarrollo

```bash
claude plugin validate .
claude plugin test .
```