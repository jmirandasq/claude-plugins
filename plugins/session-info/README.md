# Session Info

Mod de Claude Code que muestra el proyecto, la rama de git, el modelo y el uso del contexto en una sola línea, en la banda sobre el prompt.

```text
claude-plugins · main · sonnet-5-5 · ━━━━────── 42%
```

## Qué muestra

| Pieza | Descripción |
|---|---|
| Proyecto | Carpeta raíz del proyecto de la sesión, en negrita y verde. |
| Rama | Rama actual de git, en cursiva. En HEAD desacoplado, el commit corto (`@abc1234`). Fuera de un repositorio no se muestra. |
| Modelo | El modelo de la sesión, como lo muestra `/model`, sin el prefijo `claude-` ni la fecha, en el naranja de Claude. |
| Contexto | Barra con el porcentaje de la ventana de contexto en uso. Verde por debajo del 75%, amarillo desde 75% y rojo desde 90%. |

La rama y el modelo se actualizan cada 5 segundos. El contexto se actualiza tras cada respuesta, y no aparece hasta que hay una.

La banda cede el sitio a las encuestas de Claude Code y se puede colapsar con ctrl+x ctrl+a.

## Configuración

Cada pieza se puede apagar en `/config`:

| Opción | Por defecto |
|---|---|
| `showProject` | Activada |
| `showBranch` | Activada |
| `showModel` | Activada |
| `showContext` | Activada |

## Instalación

```text
/plugin marketplace add jmirandasq/claude-plugins
/plugin install session-info@jmirandasq
```

## Desarrollo

```bash
claude plugin validate .
claude plugin test .
```
