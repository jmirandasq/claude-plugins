# Session Info

Mod de Claude Code que muestra el proyecto, la rama de git, el modelo y el uso del contexto en una sola línea, por defecto en la banda sobre el prompt.

```text
claude-plugins · main · sonnet-5-5 · ━━━━────── 42%
```

## Qué muestra

| Pieza | Descripción |
|---|---|
| Proyecto | Carpeta raíz del proyecto de la sesión, en negrita y en el color de acento (verde por defecto). |
| Rama | Rama actual de git, en cursiva. En HEAD desacoplado, el commit corto (`@abc1234`). Fuera de un repositorio no se muestra. |
| Modelo | El modelo de la sesión, como lo muestra `/model`, sin el prefijo `claude-` ni la fecha, en el naranja de Claude. |
| Contexto | Barra con el porcentaje de la ventana de contexto en uso. En el color de acento por debajo del 75%, amarillo desde 75% y rojo desde 90%. |

La rama y el modelo se actualizan cada 5 segundos. El contexto se actualiza tras cada respuesta, y no aparece hasta que hay una.

En la banda, el plugin cede el sitio a las encuestas de Claude Code y se puede colapsar con ctrl+x ctrl+a.

## Configuración

Todo se cambia en `/config`. Cada pieza se puede apagar:

| Opción | Por defecto |
|---|---|
| `accentColor` | `green` |
| `position` | `above` |
| `showProject` | Activada |
| `showBranch` | Activada |
| `showModel` | Activada |
| `showContext` | Activada |

`accentColor` es el color del nombre del proyecto y de la barra de contexto por debajo del 75%: `green` (el verde de marca, `#00A859`), `orange`, `blue`, `purple` o `teal`. Salvo `green`, cada uno sigue el tema de Claude Code, así se lee bien en tema claro y oscuro.

### Cambiar el color

1. Abre `/config` en una sesión de Claude Code.
2. Busca la fila **Accent color** del plugin.
3. Elige `green`, `orange`, `blue`, `purple` o `teal`.

El cambio se ve al momento: el plugin se recarga solo con el color nuevo, en el nombre del proyecto y en la barra de contexto.

### Cambiar la posición

En `/config`, la fila **Position** del plugin:

| Valor | Dónde aparece |
|---|---|
| `above` | En la banda encima del prompt. |
| `footer` | En la línea bajo el prompt, a la derecha, después del modo de permisos. |
| `hint` | Al final de las ayudas bajo el prompt (`? for shortcuts`). |
| `status` | En una línea fija bajo el prompt, junto a los avisos de Claude Code. |

En `hint` y `status` se muestra solo texto, sin colores: la barra y el porcentaje se ven igual, pero sin el color de acento ni el amarillo y rojo. Si `session-info` y `usage-meter` eligen la misma posición, se muestran los dos.

## Instalación

```text
/plugin marketplace add jmirandasq/claude-plugins
/plugin install session-info@jmirandasq
```

## Actualización

```bash
claude plugin marketplace update jmirandasq
claude plugin update session-info@jmirandasq
```

Después, `/reload-plugins` en la sesión abierta, o una sesión nueva.

## Desarrollo

```bash
claude plugin validate .
claude plugin test .
```
