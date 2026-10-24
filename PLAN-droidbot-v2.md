# Hermes DroidBot v2: plan para pasar de “consola con piel de chat” a producto

> Documento de dirección para el agente codificador.
> Repo: https://github.com/gabogabucho/hermes-droidbot
> Backend: Hermes Agent oficial (NousResearch/hermes-agent), instalado localmente en `%LOCALAPPDATA%\hermes\hermes-agent`. **Todo lo que dice “verificado” se comprobó en ese código fuente.**
> Referencia visual: GrokBot Android (8 capturas del usuario, resumidas en §3). La idea es **sentirse** como producto final, **no copiarlo**.

---

## 1. Objetivo

Los pilares, por prioridad:

1. **Chats individuales** con historial, streaming, aprobaciones y eventos entre bots.
2. **Grupos** donde varios bots interactúan entre sí y con el usuario.
3. **Conectar aplicaciones**: un catálogo unificado de **todo** lo que Hermes puede enchufar. No es solo mensajería: también tools, MCP, skills y plugins.
4. **Bóveda de credenciales y “Tomar el control”**.
5. Perfil del bot: rutinas, biblioteca, trabajo en curso, computadora y notificaciones.

**Principio rector: NO reinventar.** Hermes ya resuelve casi todo en el backend o en la app de escritorio. DroidBot es un **cliente móvil** de esas capacidades.

---

## 2. Estado actual de DroidBot (verificado)

Stack: React 19, Vite 8, PWA (`vite-plugin-pwa`), nanostores y react-router 7. Es chico (~20 archivos).

| Área | Hoy | Problema |
|---|---|---|
| Transporte | WS `/api/console` (`src/lib/console.ts`) | Emula la CLI. La respuesta llega en frames `output` de texto plano. No hay sesiones, ni streaming por token, ni eventos estructurados. |
| Chat | `src/store/chat.ts` | `connectChat()` hace `messages.set([])`: **se pierde el historial** cada vez que entrás. `store/sessions.ts` existe pero no se usa. No hay markdown. La key de los mensajes es el índice. |
| Conectores | `ConnectorsPage.tsx` | Solo hace start/stop del gateway por perfil. |
| Credenciales, grupos, rutinas, archivos | — | No existen. |
| Navegación | Tabs abajo (Bots / Conectores / Ajustes) con iconos de caracteres (`◉ ⇄ ⚙`) | No se parece a un producto. |
| README | — | Sigue siendo la plantilla de Vite. |

---

## 3. Referencia visual: qué muestra GrokBot y con qué lo resuelve Hermes

| # | Pantalla GrokBot | Qué tiene | Equivalente en Hermes (verificado) |
|---|---|---|---|
| 1 | **Inicio** | Arriba, el bot principal destacado (avatar grande con estrella). Abajo, una **lista única** que mezcla chats con bots y grupos, ordenada por actividad. Cada fila muestra la vista previa del último mensaje, con variantes como “Mensaje de X:” o “Le escribió a Pancho:”, la hora (“Ayer”) y un punto azul si no está leído. Al pie, un buscador y un botón de grilla; arriba a la derecha, `+`; arriba a la izquierda, el avatar del usuario, que abre Ajustes. **No hay tabs.** | Perfiles: `/api/profiles` y `/api/profiles/active` (el principal). Sesiones: `/api/profiles/sessions/sidebar` y `/api/sessions/search`. Salas de grupo: `ui_meta` (§4.3). |
| 2 | **Chat de grupo** | Un header tipo píldora con avatares apilados (`+2`) y el nombre del grupo. Cada mensaje lleva el **nombre del bot arriba** y el **avatar abajo a la izquierda**, con `@menciones` y rutas en monoespaciado. Composer “Escríbele a {grupo}” con `+` y micrófono. | Lógica de grupos (§4.3). |
| 3 | **Chat individual** | Burbujas del usuario en verde a la derecha y del bot en gris, sin avatar. **Eventos en línea** entre bots: “Escribió a [avatar] Agentes AI Implementación”, “Mensaje de [avatar] Agentes AI Ventas”, “Escribió a [avatares] 2 Bots”. Botón “ir al final” y botón de **modo voz**. | Mensajes entre bots: herramienta `message_agent` y relay `bot_relay.*` (`gateway/relay/*`). Voz: `/api/audio/transcribe`, `/api/audio/speak(-stream)`. |
| 4 | **Ajustes** | Cuenta; Uso; Suscripción; **Bóveda** (“inicios de sesión, tarjetas y contactos”); **Conectar aplicaciones**; sección Bot: **Auto-review** (exigir aprobación para acciones riesgosas de shell, MCP y computadora), reglas personalizadas, zona horaria, ordenador del bot y dispositivos. | Uso: `/api/analytics/usage`. Bóveda: `/api/env` y `/api/credentials/pool` (§4.4). Aprobaciones: config (`/api/config`, `/api/config/schema`; **el agente debe ubicar la clave exacta en el schema**). Suscripción: no aplica (Hermes es self-hosted). |
| 5 | **Conectar aplicaciones** | Píldora “7 conectados”, buscador “aplicaciones **y habilidades**”, chips de categoría (Todos, Android, Productividad, Comunicación…), secciones (“Para ti”, “Plugins del equipo”, “Destacados”) y un botón Conectar/Conectado por fila. | **Catálogo unificado**, ver §4.5. |
| 6 | **Perfil del bot** | Avatar, Editar, y la lista: **Programando** (“0 trabajando”), **Rutinas** (“3 activadas”), **Biblioteca**, **Computadora** (“Inactivo”). Toggle de **Notificaciones** (“cuando este bot termine o te esté esperando”). | Editar: `/api/profiles/{name}` (`/soul`, `/description`, `/model`) y avatar con `profiles.set_asset`. Programando: `/api/plugins/kanban/workers/active`. Rutinas: `/api/cron/jobs*` y `/api/webhooks*`. Biblioteca: `/api/files*`. Computadora: §4.6. Notificaciones: §4.7. |
| 7 | **Rutinas** | Lista con toggles y **horario en lenguaje humano** (“De lunes a viernes alrededor de las 7:00”, “Cada lunes a las 8:31 · Pausada”, “Cuando se activa un webhook”). | `GET /api/cron/jobs`, `/pause` y `/resume`, `/trigger`, `/runs`. Disparadores por webhook: `/api/webhooks` y `/{name}/enabled`. Plantillas: `/api/cron/blueprints`. |
| 8 | **Computadora** | **Vista en vivo** del escritorio del bot y un botón **“Tomar el control”**. | **No existe en Hermes.** Ver §4.6. |

### Lenguaje visual a adoptar (inspirado, no copiado)
- Fondo oscuro casi negro, superficies apenas más claras y radios grandes (de 20 a 28 px) en tarjetas, píldoras y burbujas.
- Botones circulares flotantes de vidrio oscuro (atrás, `…`, `+`) y un header en píldora flotante.
- **Avatares de bot como “criaturas” de color** con ojos. DroidBot ya tiene `BotAvatar` con `mood`: evolucionarlo con forma y color por bot, persistidos en el perfil. El escritorio ya guarda avatares (`profiles.set_asset`; ver `plugins/hermes-bots/avatar*.ts`). **Hay que reusar ese dato para que el bot se vea igual en las dos apps.**
- Un acento por bot (su color) y verde para las burbujas del usuario y los toggles activos.
- **Identidad propia:** elegir otra paleta, otra forma de avatar y otra tipografía. Hay que inspirarse en la estructura, no clonar el arte.

---

## 4. Lo que Hermes ya ofrece (verificado)

### 4.1 Transporte: JSON-RPC sobre `/api/ws`
- `hermes_cli/web_server.py` (`@app.websocket("/api/ws")`) y `tui_gateway/ws.py`. Es **JSON-RPC delimitado por newline**, el mismo protocolo que la TUI, la app de escritorio e iOS. Al conectar, el servidor emite `gateway.ready`.
- Auth: `?ticket=` de `POST /api/auth/ws-ticket` (un solo uso, ~30 s). **Es el mismo mecanismo que DroidBot ya usa.** En cada reconexión hay que pedir un ticket nuevo.
- Los eventos `*.delta` (por ejemplo `message.delta`) llegan agrupados en lotes.
- Métodos mínimos: `session.create`, `session.resume`, `prompt.submit`, `session.interrupt`, `approval.respond`, `clarify.respond`, `profiles.configure`, `profiles.set_asset`, `file.attach`, `image.attach_bytes`, `pdf.attach`.
- Contrato real: `tui_gateway/server.py` (`dispatch`) y `tui_gateway/methods_*.py`. **Leelo de ahí, no lo adivines.**

### 4.2 Chats e historial
`GET /api/sessions`, `/api/sessions/{id}/messages`, `/api/sessions/search`, `/api/profiles/sessions/sidebar`, `/api/sessions/{id}/fork` y `/api/sessions/bulk-delete`.

### 4.3 Grupos: hoy viven en el cliente, y Hermes los está llevando al servidor
- **Hoy:** la app de escritorio los orquesta en `apps/desktop/src/plugins/hermes-bots/` (**MIT, Nous Research**):
  - `group-chat.ts`: el store de salas, con persistencia y proyección al `ui_meta` del perfil default (con CAS).
  - `group-rounds.ts`: round-robin **serial**, `@menciones` determinísticas (`@nombre`, `@"dos palabras"`, `@everyone`/`@all`), `(pass)` = silencio, y topes `GROUP_CHAT_MAX_ROUNDS`, `MAX_MESSAGES` y `MAX_CONTINUATIONS`.
  - `group-turns.ts`: cada bot corre en **su propia sesión oculta por grupo** y solo recibe lo nuevo desde su última marca.
  - `group-membership.ts`, `routing.ts` y `relay.ts`.
- **En construcción en el backend:** `gateway/hosted_rooms.py` (log durable de eventos de sala en `state.db`), `hosted_room_driver.py` (lease del driver y máquina de estados de tareas: queued, running, settled…), `hosted_room_discussion/peer/replicas/execution_policy.py` y endpoints `/v1/room-members/*` en el `api_server`. El propio código lo describe como el “future hosted-room driver”. **Todavía no hay una API pública estable para clientes.**
- **Implicancia:** un grupo orquestado en el cliente solo avanza mientras algún cliente lo maneja.

### 4.4 Bóveda
- `GET /api/env?profile=` devuelve por variable `is_set`, `redacted_value`, `is_password`, `category`, `url`, `description` y `tools`. `PUT` y `DELETE` también existen.
- `POST /api/env/reveal` exige un token de sesión del dashboard, tiene rate limit (5 cada 30 s) y deja registro de auditoría. **DroidBot no lo usa.**
- `/api/credentials/pool` maneja varias keys por proveedor, con rotación.
- `/api/providers/oauth/{provider}/start|poll|submit` hace el login OAuth de proveedores de modelos.
- La env de cada toolset se configura con `PUT /api/tools/toolsets/{name}/env`.

### 4.5 Catálogo unificado “Conectar aplicaciones”
Hermes tiene **cinco** familias de conectores. GrokBot las muestra como una sola lista con un buscador y chips de categoría. DroidBot tiene que hacer lo mismo:

| Familia | Qué es | Endpoints (`hermes_cli/web_routers/*` y `web_server.py`) |
|---|---|---|
| **Apps (MCP)** | Gmail, Notion, Drive, etc. vía servidores MCP | `GET /api/mcp/catalog`, `POST /api/mcp/catalog/install`, `GET/POST/PUT /api/mcp/servers`, `/{name}/test`, `/{name}/auth` (OAuth), `/{name}/enabled`, `DELETE /{name}`, `/api/mcp/oauth/flows/{id}` |
| **Herramientas (toolsets)** | Web, navegador, computer use, TTS, terminal… | `GET /api/tools/toolsets`, `PUT /{name}` (on/off), `/{name}/config`, `/env`, `/provider`, `/model(s)`, `/post-setup` |
| **Habilidades (skills)** | Instrucciones empaquetadas | `GET /api/skills`, `PUT /api/skills/toggle`, hub: `/api/skills/hub/search|official|preview|scan|install|uninstall|update` |
| **Plugins** | Extensiones del agente (por ejemplo kanban) | `GET /api/dashboard/plugins`, `/hub`, `/api/dashboard/agent-plugins/install`, `/{name}/enable|disable|update` |
| **Mensajería (canales)** | Telegram, WhatsApp, Discord, Slack, ntfy… | `GET /api/messaging/platforms`, `PUT /{id}`, `POST /{id}/test`, onboarding de Telegram y WhatsApp, `/api/pairing*`, gateway `start|stop|restart` |

UI propuesta: el buscador cubre las cinco familias, los chips filtran por **familia** y por **categoría** (la que traiga cada catálogo), la píldora dice “N conectados”, hay secciones (“Conectados”, “Recomendados”, “Del equipo” para los plugins instalados localmente) y cada fila tiene un botón Conectar/Conectado. La pantalla de detalle es la misma para todas las familias: descripción, campos de configuración (los secretos como `password`), “Probar”, OAuth si aplica, y “Desconectar”.

### 4.6 “Tomar el control”: lo que hay y lo que no
- **Hay:** la herramienta `computer_use` (`tools/computer_use/`, vía cua-driver) controla **la computadora donde corre Hermes**, en segundo plano. Además, `/api/tools/computer-use/status` y `/permissions/grant`, el control del navegador (`browser.manage`, `browser.controller.*`) y la configuración del toolset `browser`.
- **No hay:** un endpoint que transmita la pantalla en vivo ni que acepte input remoto del usuario. GrokBot usa una VM en la nube con vista remota. **Hermes no la tiene.**
- Por eso, “tomar el control” en DroidBot se divide en dos niveles:
  1. **Control del agente (sí, en v2):** pausar o detener (`session.interrupt`), responder aprobaciones y preguntas, ver qué herramienta está usando y el estado de computer use (activo o inactivo), y activar o desactivar el toolset.
  2. **Vista y control de la pantalla (fuera de v2, investigación aparte):** opciones con sus costos. (a) Un servidor VNC/noVNC en la máquina de Hermes con un túnel: es infraestructura extra y un riesgo de seguridad alto, porque expone el escritorio. (b) Capturas periódicas si `computer_use` expone alguna: hay que investigarlo en `tools/computer_use/`. (c) Pedirlo upstream en Hermes. **No se implementa sin decisión explícita del usuario.**

### 4.7 Notificaciones
- Hermes **no tiene Web Push** (no hay VAPID ni suscripciones).
- **Sí tiene** el adaptador **ntfy** (`plugins/platforms/ntfy/`) y los gateways de Telegram y WhatsApp. Opción v2: el toggle “Notificaciones” del perfil configura el bot para avisar por ntfy (con la app ntfy en Android) o por el canal de mensajería que ya esté conectado.
- Web Push real requiere un emisor en el backend: queda fuera de v2 sin modificar Hermes.

### 4.8 Otros
Kanban: `/api/plugins/kanban/*`. Archivos: `/api/files*`. Uso: `/api/analytics/usage`. Versión: `/api/version`.

---

## 5. Decisiones de arquitectura

| # | Decisión | Por qué | Alternativa descartada |
|---|---|---|---|
| D1 | **Migrar de `/api/console` a JSON-RPC `/api/ws`** | Es el protocolo de escritorio, TUI e iOS. Trae sesiones, streaming, aprobaciones y es la base de los grupos. | Seguir con console: imposible tener historial y grupos bien hechos. |
| D2 | **Grupos detrás de una interfaz `GroupEngine`**. Implementación v2: `ClientGroupEngine`, que porta `hermes-bots` (MIT; mantener el aviso). Cuando Hermes publique la API de hosted rooms, se agrega `HostedGroupEngine` sin tocar la UI. | Comportamiento idéntico al escritorio hoy, y preparado para el cambio que Hermes ya está haciendo (§4.3). | Reinventar el orquestador, o esperar a que salgan las hosted rooms. |
| D3 | **Lock de “quién maneja la sala”** en el `ui_meta` de la sala, con TTL. Si la maneja otro cliente, DroidBot solo la lee. | Evita turnos duplicados con el escritorio. | Ignorar el problema. |
| D4 | **Bóveda de solo escritura**: se muestra `is_set` y `redacted_value`; se puede reemplazar o borrar; **nunca se llama `/api/env/reveal`**. | El teléfono es el dispositivo más fácil de perder. | Mostrar valores. |
| D5 | **Cero secretos en el almacenamiento del cliente.** En el dispositivo solo se guarda la URL del backend. | Seguridad básica. | — |
| D6 | **Sin tarjetas de pago en la Bóveda.** GrokBot guarda tarjetas; DroidBot no. Solo API keys, tokens y logins de servicio, en la env del perfil. | Riesgo y responsabilidad. Hermes no tiene un almacenamiento seguro para pagos. | Copiar la feature. |
| D7 | **El catálogo unificado (§4.5) es un adaptador en el cliente** que normaliza las cinco familias a un tipo `Connector { id, family, name, description, icon, category, status, configurable, auth }`. | Una sola UI, cinco backends. Es la clave de que se sienta como un producto. | Cinco pantallas distintas. |
| D8 | **Navegación de GrokBot**: una lista única de chats (bots y grupos) como inicio, sin tabs; Ajustes desde el avatar del usuario; `+` para crear bot o grupo; perfil del bot desde el header del chat. | Es lo que hace que se sienta como una app de mensajería, no como un panel. | Mantener las tabs actuales. |
| D9 | Feature folders (`src/features/{chat,groups,connectors,vault,routines,library,bot-profile,kanban}`) con separación container/presentational y un `src/ui/` como sistema de diseño. | El repo va a crecer x5. | Seguir agregando en `pages/`. |

---

## 6. Fases

Cada fase se entrega como **un PR propio**, con commits convencionales y sin atribución de IA.

### Fase 0: Cimientos (bloquea todo lo demás)
- [ ] `src/lib/rpc.ts`: cliente JSON-RPC sobre `/api/ws`, con ticket, reconexión con backoff (ticket nuevo cada vez), correlación por `id`, un bus de eventos tipado y ping cada 15 s.
- [ ] Tipos escritos **desde `tui_gateway/methods_*.py`**.
- [ ] Reemplazar `ConsoleClient`. Borrar `console.ts` al cerrar la Fase 1.
- [ ] Reorganizar el código según D9.
- [ ] Sistema de diseño base en `src/ui/`: tokens (colores, radios, espaciado, tipografía), `IconButton` circular, `Pill`, `ListRow`, `Toggle`, `Sheet`, `Avatar` (criatura con color y forma por bot) e iconos SVG.
- [ ] README real.

**Hecho cuando:** un prompt llega por streaming vía `/api/ws`, la conexión sobrevive a un corte de red, y existen los componentes base.

### Fase 1: Inicio y chats individuales
- [ ] **Inicio** (pantalla 1): el bot principal destacado, una lista unificada de chats ordenada por actividad, la vista previa con prefijos (“Mensaje de…”, “Le escribió a…”), la hora relativa, el indicador de no leído y el buscador al pie (sesiones y bots).
- [ ] Abrir una sesión existente (`session.resume`) o crear una (`session.create`). **El historial persiste.**
- [ ] Streaming, markdown, monoespaciado para rutas y código, y keys estables.
- [ ] **Eventos entre bots en línea** (pantalla 3): renderizar las llamadas a `message_agent` y las respuestas del relay como separadores “Escribió a [avatar] X” y “Mensaje de [avatar] X”. **Antes de dibujar, verificá cómo aparecen en el transcript.**
- [ ] Tarjetas de aprobación (`approval.respond`) y de preguntas (`clarify.respond`), botón detener (`session.interrupt`), adjuntos y botón “ir al final”.
- [ ] Micrófono: dictado con `/api/audio/transcribe`. El modo voz completo (`speak-stream`) es opcional.

**Hecho cuando:** cerrás y abrís la app y la conversación sigue ahí; una aprobación se responde desde el celular; los mensajes entre bots se ven como en la pantalla 3.

### Fase 2: Grupos
- [ ] La interfaz `GroupEngine` y `ClientGroupEngine` (D2). **Arrancar portando los tests del plugin original.**
- [ ] Salas en el `ui_meta` del perfil default, con el formato del escritorio: lo que se crea en una app aparece en la otra.
- [ ] El lock D3.
- [ ] UI (pantalla 2): header con avatares apilados, nombre del bot sobre cada burbuja y avatar al pie, autocompletado de `@mención`, badge de “te necesitan” y botón para detener la ronda. Crear grupo desde el `+`.
- [ ] Aprobaciones y preguntas de los miembros, como tarjetas dentro de la sala.

**Hecho cuando:** un grupo creado en el escritorio se usa desde el celular, y viceversa, sin turnos duplicados.

### Fase 3: Conectar aplicaciones (catálogo unificado)
- [ ] El adaptador `Connector` (D7) sobre las cinco familias de §4.5.
- [ ] Pantalla de catálogo (pantalla 5): buscador, chips, píldora “N conectados”, secciones y botón Conectar/Conectado.
- [ ] Una pantalla de detalle común: configuración dinámica, Probar, OAuth (flujo de **poll**, abriendo el navegador del sistema), activar/desactivar y desconectar.
- [ ] Vinculación guiada de Telegram y WhatsApp (QR o código).
- [ ] Mantener start/stop/restart del gateway en el detalle de cada canal.

**Hecho cuando:** se puede instalar y autenticar un MCP (por ejemplo Notion), activar un toolset, instalar una skill del hub y conectar Telegram, todo desde el celular.

### Fase 4: Ajustes, Bóveda y control
- [ ] **Ajustes** (pantalla 4), desde el avatar del usuario: cuenta (`/api/auth/me`), uso (`/api/analytics/usage`), Bóveda, Conectar aplicaciones y la sección Bot.
- [ ] **Bóveda** (D4, D5, D6): API keys por bot agrupadas por `category`, con link a la `url` del proveedor para conseguir la key; pool de credenciales; logins de servicio como variables custom.
- [ ] **Auto-review**: un toggle que mapea a la configuración de aprobaciones de Hermes. **Ubicá la clave en `/api/config/schema` antes de implementar.**
- [ ] **Control del agente** (nivel 1 de §4.6): estado de computer use, detener la tarea en curso, activar o desactivar el toolset `computer_use` y `browser`.
- [ ] La vista en vivo y el control de pantalla quedan **fuera** (nivel 2). Dejar el lugar en la UI con “Próximamente” solo si el usuario lo aprueba.

### Fase 5: Perfil del bot
- [ ] Pantalla de perfil (pantalla 6), desde el header del chat: avatar, Editar (nombre, descripción, soul, modelo y avatar; el avatar se guarda con `profiles.set_asset` para que se comparta con el escritorio) y el toggle de notificaciones (§4.7).
- [ ] **Rutinas** (pantalla 7): lista de cron jobs y webhooks con toggles, **horario en lenguaje humano** (convertir cron a texto en español), detalle con ejecuciones (`/runs`), “Ejecutar ahora” (`/trigger`) y crear desde plantillas (`/blueprints`).
- [ ] **Biblioteca**: navegador de `/api/files` con vista previa y descarga.
- [ ] **Programando**: cantidad y lista de workers activos (`/api/plugins/kanban/workers/active`), con enlace al kanban.

### Fase 6: Kanban (opcional)
- [ ] Tablero móvil: columnas con scroll horizontal, crear y mover tareas, asignar a un bot.

### Transversal: pulido de producto
- [ ] Estados vacíos, de carga (skeletons) y de error en todas las pantallas.
- [ ] Safe areas, gestos (deslizar para volver) y transiciones suaves entre la lista y el chat.
- [ ] Manifest de la PWA con nombre e iconos finales.

---

## 7. Reglas para el agente codificador

1. **Leé el contrato real en `%LOCALAPPDATA%\hermes\hermes-agent` antes de llamar cualquier método o endpoint.** No inventes shapes. Las rutas REST están en `hermes_cli/web_server.py` y `hermes_cli/web_routers/*.py`; el RPC, en `tui_gateway/`.
2. **No modifiques Hermes.** Si algo falta, documentalo como hallazgo y consultá.
3. Al portar código de `hermes-bots`, mantené el aviso de licencia MIT de Nous Research.
4. Nada de secretos en el almacenamiento del cliente. Nada de `/api/env/reveal`. Nada de tarjetas.
5. Inspiración en GrokBot sí, clonar su arte no: paleta, forma de avatar y tipografía propias.
6. Un PR por fase, con commits convencionales y **sin “Co-Authored-By” ni atribución de IA**.
7. No hagas build después de cada cambio, salvo que se pida.
8. Si algo de este documento no encaja con el código real, **frená y preguntá**.

---

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| El protocolo `/api/ws` cambia (Hermes es muy activo) | Tipos centralizados, guardar la versión probada (`/api/version`) y avisar si no coincide. |
| Hermes publica las hosted rooms y el port en el cliente queda viejo | Por eso existe D2: se cambia de motor, no la UI. |
| Turnos duplicados entre escritorio y celular | Lock D3. |
| El grupo se frena con la app en segundo plano | Mostrarlo de forma explícita (“en pausa”). Se resuelve con las hosted rooms. |
| OAuth en una PWA | Usar flujos de poll, no callbacks. |
| Expectativa de “tomar el control” igual a GrokBot | Comunicar que la v2 cubre el control del agente, no la pantalla (§4.6). |

---

## 9. Pendiente o a decidir por el usuario

- [ ] ¿Vale la pena investigar la vista y el control de pantalla (§4.6, nivel 2)? Y si sí, ¿con qué opción?
- [ ] Canal de notificaciones: ¿ntfy, Telegram o ambos?
- [ ] Paleta y nombre visual de la app (identidad propia).
