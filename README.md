# claude-plugins

Marketplace de plugins de Claude Code.

| Plugin | Descripción |
|---|---|
| [`usage-meter`](plugins/usage-meter) | Consumo de la suscripción (ventanas de 5 horas y semanal) en el pie del prompt. |
| [`session-info`](plugins/session-info) | Proyecto, rama de git, modelo y uso del contexto en una línea sobre el prompt. |

## Instalación

En una sesión de Claude Code:

```text
/plugin marketplace add jmirandasq/claude-plugins
/plugin install usage-meter@jmirandasq
/plugin install session-info@jmirandasq
```

Desde una terminal:

```bash
claude plugin marketplace add jmirandasq/claude-plugins
claude plugin install usage-meter@jmirandasq
claude plugin install session-info@jmirandasq
```

## Desarrollo

Cada plugin vive en su carpeta de `plugins/`, con su manifiesto, su módulo de hooks y sus tests:

```bash
claude plugin validate .
claude plugin validate plugins/<plugin>
claude plugin test plugins/<plugin>
```