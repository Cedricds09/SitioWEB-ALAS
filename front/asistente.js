/* =====================================================
   FASE 5: asistente conversacional ALAS (burbuja flotante).
   Solo se activa en /admin con sesión activa.
   Dos modos: navegación (keywords, sin API) y creación de
   presupuesto por chat (recopila datos y hace POST a
   /api/ai/chat-presupuesto).
   ===================================================== */
(() => {
    if (window.location.pathname !== "/admin") return;

    /* ---------- Estado ---------- */
    const state = {
        abierto: false,
        iniciado: false,      // true tras la primera apertura: el historial vive
                              // en el DOM y persiste mientras dure la sesión.
        modo: null,           // null | 'presupuesto' | 'navegacion'
        paso: null,           // ver fasePresupuesto
        preguntaIdx: 0,
        preguntas: [],
        datos: {
            cliente_nombre: null,
            cliente_telefono: null,
            numero_cliente_existente: null,
            tipo_servicio: null,
            descripcion: null,
            respuestas_adicionales: {},
        },
        sesion: null,
        // Último resultado (consulta de negocio o cliente) para responder
        // preguntas de seguimiento. Expira a los 5 minutos.
        ultimoContexto: { tipo: null, datos: null, timestamp: null },
    };

    const TIPOS = {
        plomeria: "🔧 Plomería",
        electrica: "⚡ Eléctrica",
        gas: "🔥 Gas",
        pintura: "🎨 Pintura",
        soldadura: "⚙️ Soldadura",
        mantenimiento_integral: "🏠 Mantenimiento integral",
    };

    const PREGUNTAS_POR_TIPO = {
        plomeria: [
            { pregunta: "¿Qué material se usará?", opciones: ["Cobre", "PVC", "Fierro negro", "Mixto"] },
            { pregunta: "¿Cuántos metros aproximados?", opciones: ["Menos de 10m", "10-30m", "Más de 30m"] },
            { pregunta: "¿Incluye retiro de tubería vieja?", opciones: ["Sí", "No"] },
        ],
        electrica: [
            { pregunta: "¿Es instalación interior o exterior?", opciones: ["Interior", "Exterior", "Ambas"] },
            { pregunta: "¿Qué calibre de cable?", opciones: ["Cal 12", "Cal 10", "Cal 8", "No sé aún"] },
            { pregunta: "¿Incluye tablero o solo circuitos?", opciones: ["Solo circuitos", "Incluye tablero"] },
        ],
        gas: [
            { pregunta: "¿Cuántos dispositivos o reguladores involucra?", opciones: ["1-3", "4-8", "Más de 8"] },
            { pregunta: "¿Es casa particular o edificio?", opciones: ["Casa particular", "Edificio/departamentos"] },
            { pregunta: "¿Ya tienes diagnóstico o es primera revisión?", opciones: ["Ya hay diagnóstico", "Primera revisión"] },
        ],
        pintura: [
            { pregunta: "¿Cuántos m² aproximados?", opciones: ["Menos de 30m²", "30-100m²", "Más de 100m²"] },
            { pregunta: "¿Cuántas manos de pintura?", opciones: ["1 mano", "2 manos", "3 o más"] },
            { pregunta: "¿Incluye preparación de superficie?", opciones: ["Sí", "No"] },
        ],
        soldadura: [
            { pregunta: "¿Qué material se va a soldar?", opciones: ["Acero", "Aluminio", "Fierro", "Otro"] },
            { pregunta: "¿Es reparación o instalación nueva?", opciones: ["Reparación", "Instalación nueva"] },
        ],
        mantenimiento_integral: [
            { pregunta: "¿Qué sistemas involucra?", opciones: ["Gas y plomería", "Eléctrico", "Varios sistemas"] },
            { pregunta: "¿Es mantenimiento preventivo o correctivo?", opciones: ["Preventivo", "Correctivo"] },
        ],
    };

    /* ---------- Helpers ---------- */
    function esc(s) {
        return String(s == null ? "" : s)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
    }

    function toastGlobal(msg, kind = "success") {
        const t = document.getElementById("toast");
        if (!t) return;
        const m = t.querySelector(".toast-msg");
        if (m) m.textContent = msg;
        t.classList.remove("success", "error");
        t.classList.add("show", kind === "error" ? "error" : "success");
        setTimeout(() => t.classList.remove("show"), 3500);
    }

    /* ---------- DOM (creado al cargar) ---------- */
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

    // Avatar del bot (logo del chatbot ALAS). Se usa en el header, en cada
    // burbuja del bot y como icono del botón flotante (globo).
    // Asistente vive solo en /admin — todos los navegadores aceptan WebP.
    const BOT_AVATAR = "imagenes/logo-chatbot-alas.webp";
    const BTN_ICON = `<img class="asist-btn-icon" src="${BOT_AVATAR}" alt="Asistente" />`;

    const html = `
        <button type="button" class="asist-btn" id="asistBtn" aria-label="Asistente" hidden>${BTN_ICON}</button>
        <div class="asist-panel" id="asistPanel" role="dialog" aria-modal="false" aria-labelledby="asistHeadTitle">
            <header class="asist-head">
                <img class="asist-head-avatar" src="${BOT_AVATAR}" alt="Asistente ALAS" />
                <div class="asist-head-text">
                    <p class="asist-head-title" id="asistHeadTitle">Hola 👋</p>
                    <p class="asist-head-sub">¿En qué te ayudo?</p>
                </div>
            </header>
            <div class="asist-msgs" id="asistMsgs" aria-live="polite"></div>
            <div class="asist-input-bar">
                <input type="text" class="asist-input" id="asistInput" placeholder="Escribe o usa el micrófono..." autocomplete="off" />
                <button type="button" class="asist-mic-btn" id="asistMicBtn" title="Hablar" ${SR ? "" : "hidden"}>🎤</button>
                <button type="button" class="asist-send-btn" id="asistSendBtn" title="Enviar">➤</button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML("beforeend", html);

    const btn = document.getElementById("asistBtn");
    const panel = document.getElementById("asistPanel");
    const headTitle = document.getElementById("asistHeadTitle");
    const msgs = document.getElementById("asistMsgs");
    const input = document.getElementById("asistInput");
    const sendBtn = document.getElementById("asistSendBtn");
    const micBtn = document.getElementById("asistMicBtn");

    /* ---------- Render mensajes ---------- */
    function scrollDown() {
        msgs.scrollTop = msgs.scrollHeight;
    }

    // Avatar circular del bot para anteponer a cada burbuja.
    function botAvatar() {
        const img = document.createElement("img");
        img.className = "asist-avatar";
        img.src = BOT_AVATAR;
        img.alt = "ALAS";
        return img;
    }

    function addBotMsg(text, opciones) {
        const row = document.createElement("div");
        row.className = "asist-msg-row asist-msg-row-bot";
        const div = document.createElement("div");
        div.className = "asist-msg asist-msg-bot";
        div.innerHTML = esc(text).replace(/\n/g, "<br>");
        row.appendChild(botAvatar());
        row.appendChild(div);
        msgs.appendChild(row);

        if (Array.isArray(opciones) && opciones.length) {
            const opts = document.createElement("div");
            opts.className = "asist-options";
            opciones.forEach((opt) => {
                const b = document.createElement("button");
                b.type = "button";
                b.className = "asist-option-btn";
                b.textContent = opt.label;
                b.addEventListener("click", () => {
                    // Deshabilitar TODOS los botones del bloque tras click (no doble-click)
                    opts.querySelectorAll("button").forEach((x) => (x.disabled = true));
                    opt.action && opt.action();
                });
                opts.appendChild(b);
            });
            msgs.appendChild(opts);
        }
        scrollDown();
    }

    function addUserMsg(text) {
        const div = document.createElement("div");
        div.className = "asist-msg asist-msg-user";
        div.textContent = text;
        msgs.appendChild(div);
        scrollDown();
    }

    function addLoadingMsg(texto) {
        const row = document.createElement("div");
        row.className = "asist-msg-row asist-msg-row-bot";
        row.id = "asistLoadingMsg";
        const div = document.createElement("div");
        div.className = "asist-msg asist-msg-bot";
        div.innerHTML = '<span class="asist-spinner"></span> ' + esc(texto || "Generando…");
        row.appendChild(botAvatar());
        row.appendChild(div);
        msgs.appendChild(row);
        scrollDown();
    }

    function removeLoadingMsg() {
        const el = document.getElementById("asistLoadingMsg");
        if (el) el.remove();
    }

    /* ---------- Visibilidad ---------- */
    function mostrarBurbuja() { btn.hidden = false; }
    function ocultarBurbuja() {
        btn.hidden = true;
        cerrar();
    }

    function abrir() {
        state.abierto = true;
        panel.classList.remove("is-minimized");
        panel.classList.add("show");
        btn.textContent = "✕";
        // El historial vive en el DOM: solo se inicializa la primera vez.
        // Reabrir el panel NO borra los mensajes previos.
        if (!state.iniciado) iniciarChat();
        setTimeout(() => input.focus(), 80);
    }

    function cerrar() {
        state.abierto = false;
        panel.classList.remove("show");
        panel.classList.remove("is-minimized");
        btn.innerHTML = BTN_ICON;
    }

    // Mobile: colapsa el panel tras navegar. No lo cierra: el historial y el
    // estado se conservan. La burbuja sigue visible para reabrirlo.
    function minimizar() {
        panel.classList.add("is-minimized");
        btn.innerHTML = BTN_ICON;
    }

    function toggle() {
        // Si está minimizado (mobile), un toque restaura el panel.
        if (panel.classList.contains("is-minimized")) {
            panel.classList.remove("is-minimized");
            btn.textContent = "✕";
            return;
        }
        if (state.abierto) cerrar();
        else abrir();
    }

    /* ---------- Reset / inicio del chat ---------- */
    // Reinicia solo el estado del flujo (no toca el historial de mensajes).
    function resetFlujo() {
        state.modo = null;
        state.paso = null;
        state.preguntaIdx = 0;
        state.preguntas = [];
        state.datos = {
            cliente_nombre: null,
            cliente_telefono: null,
            numero_cliente_existente: null,
            tipo_servicio: null,
            descripcion: null,
            respuestas_adicionales: {},
        };
    }

    // Inicializa el chat: limpia el área y pinta el saludo. Solo se llama
    // una vez por sesión (primera apertura del panel).
    function iniciarChat() {
        resetFlujo();
        msgs.innerHTML = "";
        const nombre = (state.sesion && state.sesion.usuario) || "usuario";
        headTitle.textContent = `Hola ${nombre} 👋`;
        saludo();
        state.iniciado = true;
    }

    // Borra el historial por completo. Se usa al cerrar sesión.
    function limpiarHistorial() {
        resetFlujo();
        msgs.innerHTML = "";
        state.iniciado = false;
        state.ultimoContexto = { tipo: null, datos: null, timestamp: null };
    }

    // Opciones del menú principal, siempre disponibles.
    const MENU_OPCIONES = [
        { label: "📋 Nuevo presupuesto", action: empezarPresupuesto },
        { label: "📊 Estado del negocio", action: menuNegocio },
        { label: "🔧 Ver servicios", action: () => navegar("servicios") },
        { label: "👥 Buscar cliente", action: () => navegar("clientes") },
        { label: "📄 Consultar nota", action: () => navegar("notas") },
    ];

    // Menú principal "sticky": primer hijo de #asistMsgs, queda fijo arriba al
    // hacer scroll y sus botones NO se deshabilitan (reutilizables siempre).
    function renderMenuPrincipal() {
        const menu = document.createElement("div");
        menu.className = "asist-menu";
        menu.id = "asistMenu";
        MENU_OPCIONES.forEach((opt) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "asist-option-btn";
            b.textContent = opt.label;
            b.addEventListener("click", () => { if (opt.action) opt.action(); });
            menu.appendChild(b);
        });
        msgs.appendChild(menu);
    }

    function saludo() {
        renderMenuPrincipal();
        addBotMsg("Elige una opción del menú o escríbeme lo que necesitas.");
    }

    /* ---------- Navegación (sin API) ---------- */
    // Dispara el click sobre un elemento del panel si existe. Devuelve true/false.
    function clickSi(selector) {
        const el = document.querySelector(selector);
        if (el) { el.click(); return true; }
        return false;
    }

    // Cambia de tab del dashboard vía el evento que escucha main.js.
    function cambiarTab(tab) {
        document.dispatchEvent(
            new CustomEvent("alas:cambiar-tab", { detail: { tab } }),
        );
    }

    // Delay entre el mensaje del bot y la navegación: da tiempo a leerlo antes
    // de que el panel se mueva o minimice.
    const NAV_DELAY = 1500;

    function navegar(target) {
        const isMobile = window.innerWidth < 768;
        // Mobile: tras navegar, minimiza el panel para que el usuario vea la
        // sección. En desktop el panel se queda como está. El scroll al panel
        // del tab lo hace activarTab() en main.js.
        const trasNavegar = () => { if (isMobile) minimizar(); };

        if (target === "servicios") {
            addUserMsg("Ver servicios");
            addBotMsg("Te llevo a la lista de servicios.");
            // Primero el mensaje; la navegación ocurre tras el delay.
            setTimeout(() => {
                cambiarTab("active");
                trasNavegar();
            }, NAV_DELAY);
            return;
        }

        if (target === "clientes") {
            addUserMsg("Buscar cliente");
            addBotMsg("Te llevo a la búsqueda de clientes. Escribe nombre, número o teléfono.");
            setTimeout(() => {
                cambiarTab("search");
                trasNavegar();
            }, NAV_DELAY);
            return;
        }

        if (target === "notas") {
            addUserMsg("Consultar nota");
            // El mensaje depende de si existe el filtro "Finalizados" en el DOM.
            const hayFiltro = !!document.querySelector('.filter-btn[data-estado="TERMINADO"]');
            addBotMsg(hayFiltro
                ? 'Te llevo a los servicios finalizados. Cada uno con nota tiene el botón "📄 Ver nota".'
                : 'Te llevo a los servicios. Cambia al filtro "Finalizados" para ver las notas.');
            setTimeout(() => {
                cambiarTab("active");
                clickSi('.filter-btn[data-estado="TERMINADO"]');
                trasNavegar();
            }, NAV_DELAY);
            return;
        }

        // presupuestos / usuarios: scroll directo a la sección.
        addUserMsg(`Ir a ${target}`);
        const map = {
            presupuestos: "presupuestosSection",
            usuarios: "usuariosSection",
        };
        const el = map[target] && document.getElementById(map[target]);
        if (!el) {
            addBotMsg("No encontré esa sección.");
            return;
        }
        addBotMsg(`Te llevo a ${target}.`);
        setTimeout(() => {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
            trasNavegar();
        }, NAV_DELAY);
    }

    /* ---------- Consultas de negocio (datos reales, sin Claude API) ---------- */
    // agenda_hoy va antes que agenda_semana para que "hoy" no quede absorbido
    // por una keyword de "semana" cuando la pregunta es de un solo tipo.
    const KEYWORDS_NEGOCIO = {
        agenda_hoy: ["hoy", "agenda hoy", "qué tengo hoy",
                     "que tengo hoy", "servicios hoy",
                     "tengo hoy", "para hoy", "que tengo agendado",
                     "que tengo manana", "agendado manana"],
        agenda_semana: ["esta semana", "semana", "agenda semana",
                        "qué tengo esta semana", "que tengo esta semana",
                        "servicios semana", "programados"],
        activos: ["activos", "cuántos servicios",
                  "servicios tengo", "cuantos servicios",
                  "que servicios", "qué servicios",
                  "estado del negocio", "estado negocio",
                  "cómo vamos", "como vamos", "resumen",
                  "como va el negocio", "como va", "como voy",
                  "cuanto llevo", "cuanto tengo", "este mes", "del mes"],
        urgentes: ["urgentes", "más urgentes", "mas urgentes",
                   "prioridad", "más antiguos", "mas antiguos",
                   "urgente", "algo urgente", "atrasado", "atrasados",
                   "atrasadas", "esta atrasado", "que esta atrasado"],
        sin_presupuesto: ["sin presupuesto", "falta presupuesto",
                          "no tienen presupuesto", "presupuesto falta",
                          "sin cotizar", "sin cotizacion", "falta cotizar",
                          "les falta presupuesto", "no tienen cotizacion",
                          "no tiene cotizacion", "no tiene presupuesto"],
        sin_cerrar: ["sin cerrar", "no han cerrado", "demorados",
                     "llevan mucho", "no cierran", "sin asignar",
                     "por terminar", "por cobrar", "por cerrar",
                     "faltan por", "me deben", "no han pagado",
                     "sin terminar", "falta terminar", "que falta",
                     "que pendientes", "que esta pendiente"],
        presupuestos_pendientes: ["presupuestos pendientes", "sin respuesta",
                                  "esperando respuesta", "presupuestos enviados",
                                  "mis presupuestos", "presupuestos activos",
                                  "que presupuestos", "qué presupuestos",
                                  "cotizaciones pendientes", "cotizaciones",
                                  "sin contestar", "sin responder",
                                  "no han aprobado", "no han contestado",
                                  "no han respondido", "esperando su presupuesto",
                                  "cuantos presupuestos", "cuantas cotizaciones",
                                  "cuales presupuestos", "cuantos presupuestos faltan",
                                  "presupuestos sin", "que cotizaciones"],
    };

    // Compara tolerante a acentos y mayúsculas: normaliza el texto del usuario
    // y cada keyword, así "cotización" matchea aunque escriban "cotizacion".
    // (normaliza() está declarada más abajo; hoisting de función lo permite.)
    function incluyeAlguna(low, lista) {
        const n = normaliza(low);
        return lista.some((k) => n.includes(normaliza(k)));
    }

    // Keywords que activan el flujo de CREAR un presupuesto. Frases explícitas
    // de creación: no capturan preguntas informativas ("que presupuestos hay",
    // "presupuestos pendientes"), que las maneja detectarConsultasNegocio.
    // Se escriben sin acentos a propósito (la comparación es tolerante) y cubren
    // las variaciones naturales del español mexicano, incluido lenguaje de
    // alguien poco familiarizado con la tecnología.
    const KEYWORDS_NUEVO_PRESUPUESTO = [
        // crear / hacer / armar (+ formas con enclítico -me)
        "nuevo presupuesto", "presupuesto nuevo", "nueva cotizacion",
        "cotizacion nueva", "otra cotizacion", "otro presupuesto",
        "crear presupuesto", "crear un presupuesto", "crear una cotizacion",
        "hacer presupuesto", "hacer un presupuesto", "hacer una cotizacion",
        "hazme un presupuesto", "hazme una cotizacion", "haz un presupuesto",
        "haz una cotizacion", "hagamos un presupuesto", "haga un presupuesto",
        "armar un presupuesto", "armar presupuesto", "arma un presupuesto",
        "armame", "elaborar un presupuesto", "preparar un presupuesto",
        "preparame", "levantar un presupuesto", "levantar presupuesto",
        "generar presupuesto", "generar un presupuesto",
        "sacar un presupuesto", "sacar presupuesto", "sacar una cotizacion",
        "sacame un presupuesto", "echame un presupuesto", "echa un presupuesto",
        "ponme un presupuesto", "dar un presupuesto", "pasar un presupuesto",
        "pasar un costo", "pasarle un costo",
        "registrar un presupuesto", "agregar un presupuesto",
        "meter un presupuesto", "iniciar un presupuesto",
        "empezar un presupuesto", "comenzar un presupuesto",
        "abrir un presupuesto", "abreme un presupuesto", "abrime un presupuesto",
        "dar de alta un presupuesto", "dame de alta un presupuesto",
        "alta de presupuesto",
        // querer / necesitar / pedir
        "quiero un presupuesto", "quiero hacer un presupuesto",
        "quiero hacer una cotizacion", "quiero presupuesto", "quiero cotizar",
        "quiero presupuestar", "quisiera un presupuesto",
        "quisiera hacer un presupuesto", "quisiera cotizar",
        "necesito un presupuesto", "necesito hacer un presupuesto",
        "necesito presupuesto", "necesito una cotizacion", "necesito cotizar",
        "ocupo un presupuesto", "ocupo hacer un presupuesto", "ocupo cotizar",
        "me haces un presupuesto", "me haces una cotizacion",
        "puedes hacer un presupuesto", "podrias hacer un presupuesto",
        "ayudame con un presupuesto", "ayudame a hacer un presupuesto",
        "ayudame a hacer una cotizacion", "ayudame a cotizar",
        // verbo / sustantivo de acción sueltos (señales fuertes de "crear")
        "cotizar", "cotiza", "cotizame", "cotizale", "cotizacion",
        "presupuestar", "presupuesto", "presu", "vamos a cotizar",
        "hay que cotizar", "vamos a hacer un presupuesto", "vamos a sacar",
    ];

    function esNuevoPresupuesto(low) {
        return incluyeAlguna(low, KEYWORDS_NUEVO_PRESUPUESTO);
    }

    // ---- Registro / alta de algo (servicio o cliente) ----
    // Verbos imperativos de "dar de alta / registrar" (anclados a artículo para
    // no confundir con participios informativos: "registrados", "agendado").
    const VERBOS_ALTA = [
        "dar de alta", "dame de alta", "darme de alta", "de alta",
        "registrar", "registrame", "registra un", "registra el", "registra una",
        "registra mi", "agendar", "agendame", "agenda un", "agenda el",
        "agenda una", "agenda mi", "apuntar", "apuntame", "apunta un",
        "apunta una", "apunta el", "anotar", "anotame", "anota un", "anota una",
        "anota el", "levantar un", "levanta un", "levantar una", "meter un",
        "mete un", "meterle", "programar", "programa un", "programa una",
        "agregar", "agrega un", "agrega una", "agregame", "abrir un",
        "abreme un", "abrime un",
    ];
    const NOUNS_SERVICIO = [
        "servicio", "servicios", "trabajo", "trabajos", "chamba", "chambas",
        "visita", "visitas", "obra", "obras", "mantenimiento", "reparacion",
    ];
    const NOUNS_CLIENTE = [
        "cliente", "clientes", "marchante", "marchantes", "persona",
        "señor", "señora", "dueño", "don ",
    ];
    // Frases explícitas de "alta" con adjetivo (nuevo/otro va ANTES del
    // sustantivo: comando), separadas de las consultas informativas
    // ("servicios nuevos", "que servicios tengo").
    const FRASES_REG_SERVICIO = [
        "nuevo servicio", "nuevo trabajo", "nueva chamba", "nueva visita",
        "otro servicio", "otro trabajo", "otra chamba",
    ];
    const FRASES_REG_CLIENTE = [
        "nuevo cliente", "nuevo marchante", "nueva persona", "otro cliente",
    ];

    // Es registro si hay verbo de alta + sustantivo de la sección, o una frase
    // explícita ("nuevo servicio"). Se evalúa ANTES de las consultas de negocio,
    // para que un comando con palabra de tiempo ("dar de alta un servicio para
    // esta semana") no se desvíe a la agenda.
    // Si la frase menciona presupuesto/cotización, NO es un registro de sección
    // sino creación de presupuesto ("levantar un presupuesto de un cliente").
    function mencionaPresupuesto(low) {
        return incluyeAlguna(low, ["presupuesto", "cotizacion", "cotizar", "presupuestar"]);
    }
    function esRegistroServicio(low) {
        if (mencionaPresupuesto(low)) return false;
        return incluyeAlguna(low, FRASES_REG_SERVICIO) ||
            (incluyeAlguna(low, VERBOS_ALTA) && incluyeAlguna(low, NOUNS_SERVICIO));
    }
    function esRegistroCliente(low) {
        if (mencionaPresupuesto(low)) return false;
        return incluyeAlguna(low, FRASES_REG_CLIENTE) ||
            (incluyeAlguna(low, VERBOS_ALTA) && incluyeAlguna(low, NOUNS_CLIENTE));
    }

    // ---- Navegación / consulta de una sección (sustantivos y "ver/lista") ----
    // Se evalúan DESPUÉS de negocio y de crear-presupuesto. NOTAS va antes que
    // SERVICIOS: "ver el reporte de un servicio" es sobre notas, no la lista.
    const KEYWORDS_NAV_NOTAS = [
        "nota", "notas", "reporte", "reportes", "ver nota", "consultar nota",
        "apunte", "apuntes", "observacion", "observaciones",
    ];
    const KEYWORDS_NAV_SERVICIOS = [
        "servicio", "servicios", "trabajo", "trabajos", "chamba", "chambas",
        "visita", "visitas", "reparacion", "reparaciones", "mantenimiento",
        "ver servicios", "lista de servicios", "mis trabajos", "mis chambas",
        "ver trabajos", "ver chambas", "abrir servicios", "ir a servicios",
    ];
    const KEYWORDS_NAV_CLIENTES = [
        "cliente", "clientes", "marchante", "marchantes", "persona", "personas",
        "contacto", "contactos", "buscar cliente", "ver cliente", "buscar a",
        "buscar al", "datos del cliente",
    ];
    const KEYWORDS_NAV_USUARIOS = [
        "usuario", "usuarios", "empleado", "empleados",
    ];

    // Devuelve TODOS los tipos de consulta cuyas keywords aparecen en el texto.
    // Una pregunta mixta ("pendientes de presupuestos o servicios") detecta varios.
    function detectarConsultasNegocio(low) {
        return Object.keys(KEYWORDS_NEGOCIO).filter((tipo) =>
            incluyeAlguna(low, KEYWORDS_NEGOCIO[tipo]),
        );
    }

    // Submenú con las 5 consultas de negocio.
    function menuNegocio() {
        addUserMsg("📊 Estado del negocio");
        addBotMsg("¿Qué quieres consultar?", [
            { label: "📅 Agenda de hoy", action: () => consultarNegocio("agenda_hoy", "Agenda de hoy") },
            { label: "📆 Esta semana", action: () => consultarNegocio("agenda_semana", "Esta semana") },
            { label: "📋 Servicios activos", action: () => consultarNegocio("activos", "Servicios activos") },
            { label: "⚡ Más urgentes", action: () => consultarNegocio("urgentes", "Más urgentes") },
            { label: "📄 Sin presupuesto", action: () => consultarNegocio("sin_presupuesto", "Sin presupuesto") },
            { label: "⏳ Sin cerrar", action: () => consultarNegocio("sin_cerrar", "Sin cerrar") },
            { label: "💼 Presupuestos pendientes", action: () => consultarNegocio("presupuestos_pendientes", "Presupuestos pendientes") },
        ]);
    }

    // Botón de navegación a la sección relevante por tipo de consulta.
    // Se adjunta al final de la respuesta SOLO si trae datos.
    const NAV_POR_TIPO = {
        activos:                 { label: "🔧 Ver servicios",    action: () => navegar("servicios") },
        urgentes:                { label: "🔧 Ver servicios",    action: () => navegar("servicios") },
        sin_cerrar:              { label: "🔧 Ver servicios",    action: () => navegar("servicios") },
        sin_presupuesto:         { label: "📄 Ver presupuestos", action: () => navegar("presupuestos") },
        presupuestos_pendientes: { label: "📄 Ver presupuestos", action: () => navegar("presupuestos") },
        agenda_hoy:              { label: "📅 Ver calendario",   action: navegarACalendario },
        agenda_semana:           { label: "📅 Ver calendario",   action: navegarACalendario },
    };

    // Consulta al backend y muestra la respuesta. `etiqueta` se usa cuando
    // la consulta viene de un botón (para reflejar la elección del usuario).
    async function consultarNegocio(tipo, etiqueta) {
        if (etiqueta) addUserMsg(etiqueta);
        addLoadingMsg("Consultando datos…");
        try {
            const res = await fetch("/api/ai/consulta-negocio", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tipo }),
            });
            const payload = await res.json().catch(() => ({}));
            removeLoadingMsg();
            if (!res.ok || !payload.ok || !payload.data) {
                addBotMsg("No pude consultar los datos. Intenta de nuevo.");
                return;
            }
            const respuesta = payload.data.respuesta || "No pude consultar los datos. Intenta de nuevo.";
            // Botón de navegación a la sección relevante, solo si la respuesta
            // trae datos. Agenda usa el flag `tieneServicios`; el resto se
            // detecta porque las respuestas vacías terminan en "✅".
            const esAgenda = tipo === "agenda_hoy" || tipo === "agenda_semana";
            const tieneDatos = esAgenda
                ? !!payload.data.tieneServicios
                : !respuesta.includes("✅");
            const nav = NAV_POR_TIPO[tipo];
            const opciones = (tieneDatos && nav) ? [nav] : undefined;
            addBotMsg(respuesta, opciones);
            // Memoria de contexto para preguntas de seguimiento (5 min).
            state.ultimoContexto = {
                tipo: "consulta_negocio",
                datos: { tipoConsulta: tipo, respuesta: payload.data.respuesta },
                timestamp: Date.now(),
            };
        } catch (err) {
            removeLoadingMsg();
            console.error("[ASIST] consulta-negocio error:", err);
            addBotMsg("No pude consultar los datos. Intenta de nuevo.");
        }
    }

    // Una sola llamada al backend. Devuelve { tipo, respuesta, tieneDatos }.
    // No pinta nada: lo usa consultarNegocioMultiple para combinar resultados.
    async function fetchConsulta(tipo) {
        try {
            const res = await fetch("/api/ai/consulta-negocio", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tipo }),
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok || !payload.ok || !payload.data) {
                return { tipo, respuesta: null, tieneDatos: false };
            }
            const respuesta = payload.data.respuesta || null;
            const esAgenda = tipo === "agenda_hoy" || tipo === "agenda_semana";
            const tieneDatos = esAgenda
                ? !!payload.data.tieneServicios
                : !!(respuesta && !respuesta.includes("✅"));
            return { tipo, respuesta, tieneDatos };
        } catch (err) {
            console.error("[ASIST] consulta-negocio error:", err);
            return { tipo, respuesta: null, tieneDatos: false };
        }
    }

    // Pregunta mixta: ejecuta varias consultas en paralelo y combina resultados.
    // Cada respuesta es un mensaje; al final un solo bloque de botones de
    // navegación, sin duplicar destino (servicios/presupuestos/calendario).
    async function consultarNegocioMultiple(tipos) {
        addLoadingMsg("Consultando datos…");
        const resultados = await Promise.all(tipos.map(fetchConsulta));
        removeLoadingMsg();

        let huboRespuesta = false;
        resultados.forEach((r) => {
            if (r.respuesta) {
                addBotMsg(r.respuesta);
                huboRespuesta = true;
            }
        });
        if (!huboRespuesta) {
            addBotMsg("No pude consultar los datos. Intenta de nuevo.");
            return;
        }

        const navs = [];
        const vistos = new Set();
        resultados.forEach((r) => {
            if (!r.tieneDatos) return;
            const nav = NAV_POR_TIPO[r.tipo];
            if (nav && !vistos.has(nav.label)) {
                vistos.add(nav.label);
                navs.push(nav);
            }
        });
        if (navs.length) addBotMsg("¿A dónde quieres ir?", navs);

        state.ultimoContexto = {
            tipo: "consulta_negocio",
            datos: {
                tipoConsulta: tipos.join(","),
                respuesta: resultados.map((r) => r.respuesta).filter(Boolean).join("\n\n"),
            },
            timestamp: Date.now(),
        };
    }

    /* ---------- Consulta por cliente específico ---------- */
    function fmtMoney(n) {
        const num = Number(n) || 0;
        return "$" + num.toLocaleString("es-MX", {
            minimumFractionDigits: 2, maximumFractionDigits: 2,
        });
    }
    // Primera línea recortada (los conceptos pueden venir multilínea).
    function recortarTexto(s, max) {
        const t = String(s == null ? "" : s).split(/\r?\n/)[0].trim();
        return t.length > max ? t.slice(0, max - 1) + "…" : t;
    }
    function primerNombre(nombre) {
        const p = String(nombre || "").trim().split(/\s+/).filter(Boolean);
        return p[0] || "";
    }

    // Lleva al detalle de un servicio desde el chat. Mensaje primero,
    // navegación tras NAV_DELAY.
    function navegarAServicio(servicioId) {
        addBotMsg("Te llevo al servicio…");
        setTimeout(() => {
            if (window.innerWidth < 768) minimizar();
            document.dispatchEvent(new CustomEvent("alas:abrir-servicio", {
                detail: { id: servicioId },
            }));
        }, NAV_DELAY);
    }
    // Lleva al tab del calendario semanal (main.js, activarTab('calendar')).
    function navegarACalendario() {
        addBotMsg("Te llevo al calendario…");
        setTimeout(() => {
            if (window.innerWidth < 768) minimizar();
            document.dispatchEvent(
                new CustomEvent("alas:cambiar-tab", { detail: { tab: "calendar" } }),
            );
        }, NAV_DELAY);
    }
    function navegarAPresupuesto(presupuestoId) {
        addBotMsg("Te llevo al presupuesto…");
        setTimeout(() => {
            if (window.innerWidth < 768) minimizar();
            document.dispatchEvent(new CustomEvent("alas:abrir-presupuesto", {
                detail: { presupuesto_id: presupuestoId },
            }));
        }, NAV_DELAY);
    }

    // Pinta la ficha de un cliente: datos + servicios activos + presupuestos.
    function renderClienteCard(data) {
        const nombre = data.nombre_cliente || "Cliente";
        addBotMsg(
            `📋 ${nombre} — ${data.numero_cliente}` +
            (data.telefono ? `\nTel: ${data.telefono}` : ""),
        );

        const activos = data.servicios_activos || [];
        if (activos.length) {
            addBotMsg(`Servicios activos (${activos.length}):`);
            activos.forEach((s) => {
                const icono = s.estado === "PENDIENTE" ? "⚠️" : "🔧";
                addBotMsg(
                    `${icono} ${s.estado} — ${recortarTexto(s.conceptos, 50)} (${s.dias} día${s.dias === 1 ? "" : "s"})`,
                    [{ label: "Ver servicio", action: () => navegarAServicio(s.id) }],
                );
            });
        } else {
            addBotMsg(`✅ ${data.numero_cliente} ${primerNombre(nombre)} no tiene servicios activos.`);
        }

        const presupuestos = data.presupuestos || [];
        if (presupuestos.length) {
            addBotMsg(`Presupuestos (${presupuestos.length}):`);
            presupuestos.forEach((p) => {
                addBotMsg(
                    `📄 ${p.numero_presupuesto} ${p.estado} — ${fmtMoney(p.total_general)}`,
                    [{ label: "Ver presupuesto", action: () => navegarAPresupuesto(p.id) }],
                );
            });
        }

        if (data.servicios_terminados_count > 0) {
            const n = data.servicios_terminados_count;
            addBotMsg(`✅ ${n} servicio${n === 1 ? "" : "s"} terminado${n === 1 ? "" : "s"} anteriormente.`);
        }
    }

    // Consulta la ficha de un cliente por su folio CL-XXXX.
    async function consultarCliente(numeroCliente) {
        addLoadingMsg("Consultando cliente…");
        try {
            const res = await fetch("/api/ai/consulta-cliente", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ numero_cliente: numeroCliente }),
            });
            const payload = await res.json().catch(() => ({}));
            removeLoadingMsg();
            if (res.status === 404) {
                addBotMsg((payload && payload.error) || "No encontré un cliente con ese número.");
                return;
            }
            if (!res.ok || !payload.ok || !payload.data) {
                addBotMsg("No pude consultar el cliente. Intenta de nuevo.");
                return;
            }
            renderClienteCard(payload.data);
            // Memoria de contexto para preguntas de seguimiento (5 min).
            state.ultimoContexto = {
                tipo: "cliente",
                datos: payload.data,
                timestamp: Date.now(),
            };
        } catch (err) {
            removeLoadingMsg();
            console.error("[ASIST] consulta-cliente error:", err);
            addBotMsg("No pude consultar el cliente. Intenta de nuevo.");
        }
    }

    /* ---------- Memoria de contexto (preguntas de seguimiento) ---------- */
    const KEYWORDS_SEGUIMIENTO = [
        "cuál es", "cual es", "cuáles", "cuales", "dime más", "dame más",
        "más info", "detalle", "muéstrame", "muestrame", "cuál", "cual",
    ];
    const CONTEXTO_TTL_MS = 5 * 60 * 1000; // 5 minutos

    function esSeguimiento(low) {
        return KEYWORDS_SEGUIMIENTO.some((k) => low.includes(k));
    }

    // Muestra el detalle del último resultado si sigue vigente (< 5 min).
    function mostrarDetalleContexto() {
        const ctx = state.ultimoContexto;
        const vigente = ctx && ctx.tipo && ctx.timestamp
            && (Date.now() - ctx.timestamp < CONTEXTO_TTL_MS);
        if (!vigente) {
            addBotMsg("No tengo contexto de tu pregunta anterior. ¿Sobre qué quieres más detalle?");
            return;
        }
        if (ctx.tipo === "cliente") {
            renderClienteCard(ctx.datos);
        } else {
            // consulta_negocio: re-muestra el resultado guardado.
            addBotMsg(ctx.datos.respuesta || "No tengo más detalle de esa consulta.");
        }
    }

    /* ---------- Flujo de presupuesto ---------- */
    function empezarPresupuesto() {
        addUserMsg("📋 Nuevo presupuesto");
        state.modo = "presupuesto";
        state.paso = "cliente_tipo";
        addBotMsg("¿Es para un cliente nuevo o uno que ya tenemos registrado?", [
            { label: "Cliente nuevo", action: () => tipoCliente("nuevo") },
            { label: "Cliente existente", action: () => tipoCliente("existente") },
        ]);
    }

    function tipoCliente(tipo) {
        addUserMsg(tipo === "nuevo" ? "Cliente nuevo" : "Cliente existente");
        if (tipo === "nuevo") {
            state.paso = "cliente_nombre";
            addBotMsg("¿Cuál es el nombre del cliente?");
        } else {
            state.paso = "cliente_numero";
            addBotMsg("¿Cuál es el número de cliente? (formato CL-XXXX)");
        }
    }

    function preguntarTipoServicio() {
        state.paso = "tipo_servicio";
        addBotMsg(
            "¿Qué tipo de servicio es?",
            Object.entries(TIPOS).map(([key, label]) => ({
                label,
                action: () => seleccionarTipoServicio(key),
            })),
        );
    }

    function seleccionarTipoServicio(tipo) {
        addUserMsg(TIPOS[tipo]);
        state.datos.tipo_servicio = tipo;
        state.paso = "descripcion";
        addBotMsg("Descríbeme el trabajo con tus palabras. Puedes usar el micrófono 🎤");
    }

    function iniciarPreguntasAdicionales() {
        state.datos.respuestas_adicionales = {};
        state.preguntaIdx = 0;
        state.preguntas = PREGUNTAS_POR_TIPO[state.datos.tipo_servicio] || [];
        siguientePregunta();
    }

    function siguientePregunta() {
        if (state.preguntaIdx >= state.preguntas.length) {
            generar();
            return;
        }
        const q = state.preguntas[state.preguntaIdx];
        state.paso = `pregunta:${state.preguntaIdx}`;
        addBotMsg(
            q.pregunta,
            q.opciones.map((opt) => ({
                label: opt,
                action: () => responderPregunta(opt, state.preguntaIdx),
            })),
        );
    }

    function responderPregunta(valor, idx) {
        if (idx !== state.preguntaIdx) return;
        addUserMsg(valor);
        const q = state.preguntas[idx];
        state.datos.respuestas_adicionales[q.pregunta] = valor;
        state.preguntaIdx++;
        siguientePregunta();
    }

    async function generar() {
        state.paso = "enviando";
        addBotMsg("Perfecto, tengo todo. Preparo tu presupuesto…");
        addLoadingMsg();

        const body = {
            tipo_servicio: state.datos.tipo_servicio,
            descripcion: state.datos.descripcion,
            respuestas_adicionales: state.datos.respuestas_adicionales || {},
        };
        if (state.datos.numero_cliente_existente) {
            body.numero_cliente_existente = state.datos.numero_cliente_existente;
        } else {
            body.cliente_nombre = state.datos.cliente_nombre;
            if (state.datos.cliente_telefono) body.cliente_telefono = state.datos.cliente_telefono;
        }

        try {
            const res = await fetch("/api/ai/chat-presupuesto", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const payload = await res.json().catch(() => ({}));
            removeLoadingMsg();

            if (!res.ok || !payload.ok) {
                addBotMsg(
                    (payload && payload.error) ||
                    "Tuve un problema al generar el presupuesto. ¿Lo intentamos de nuevo?",
                    [{ label: "Intentar de nuevo", action: empezarPresupuesto }],
                );
                return;
            }

            const d = payload.data || {};
            const num = d.numero_presupuesto || "";
            addBotMsg(
                `✨ Listo. Presupuesto ${num} creado con ${d.bloques_generados || 0} bloque(s). Abro el editor…`,
            );
            setTimeout(() => {
                document.dispatchEvent(
                    new CustomEvent("alas:abrir-presupuesto", {
                        detail: { presupuesto_id: d.presupuesto_id },
                    }),
                );
                // Confirmación en el chat por si el usuario cierra el editor
                // pensando que perdió el trabajo.
                addBotMsg(
                    `✅ Listo. El presupuesto ${num} quedó guardado como borrador. ` +
                    `Si lo cierras, lo encuentras en la sección Presupuestos. ` +
                    `Agrega los precios cuando estés listo.`,
                );
                toastGlobal("✨ Presupuesto listo. Revisa los datos y agrega los precios.");
                // Flujo terminado: libera el modo para que el usuario pueda
                // pedir otra cosa con texto libre.
                state.modo = null;
                state.paso = null;
            }, 700);
        } catch (err) {
            removeLoadingMsg();
            console.error("[ASIST] fetch error:", err);
            addBotMsg(
                "Tuve un problema al generar el presupuesto. ¿Lo intentamos de nuevo?",
                [{ label: "Intentar de nuevo", action: empezarPresupuesto }],
            );
        }
    }

    /* ---------- Interpretación de texto libre ---------- */
    // Quita acentos y pasa a minúsculas para comparar de forma tolerante.
    function normaliza(s) {
        return String(s == null ? "" : s)
            .toLowerCase()
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .trim();
    }

    // Detecta el tipo de servicio desde texto libre o dictado de voz.
    const ALIAS_TIPO = {
        plomeria: ["plomeria", "plomero", "tuberia", "fuga", "agua", "drenaje"],
        electrica: ["electrica", "electrico", "electricidad", "luz", "cableado", "corto"],
        gas: ["gas", "estacionario", "regulador"],
        pintura: ["pintura", "pintar", "pintor"],
        soldadura: ["soldadura", "soldar", "soldador", "herreria"],
        mantenimiento_integral: ["mantenimiento", "integral"],
    };
    function matchTipoServicio(txt) {
        const low = normaliza(txt);
        if (!low) return null;
        return (
            Object.keys(ALIAS_TIPO).find((k) =>
                ALIAS_TIPO[k].some((a) => low.includes(a)),
            ) || null
        );
    }

    // Mapea texto libre a una de las opciones de botón mostradas.
    // Devuelve la opción exacta (tal cual aparece en el botón) o null.
    function matchOpcion(txt, opciones) {
        const low = normaliza(txt);
        if (!low || !Array.isArray(opciones)) return null;
        // 1) Coincidencia exacta.
        let m = opciones.find((o) => normaliza(o) === low);
        if (m) return m;
        // 2) El texto contiene la opción, o la opción contiene al texto.
        m = opciones.find((o) => {
            const ol = normaliza(o);
            return low.includes(ol) || ol.includes(low);
        });
        if (m) return m;
        // 3) Alguna palabra significativa de la opción aparece en el texto.
        m = opciones.find((o) =>
            normaliza(o)
                .split(/\s+/)
                .some((w) => w.length > 2 && low.includes(w)),
        );
        return m || null;
    }

    /* ---------- Procesar texto libre del usuario ---------- */
    function procesarTexto(txt) {
        const t = txt.trim();
        if (!t) return;

        // Modo libre / inicial: keyword detection.
        if (state.modo === null || state.paso === null) {
            addUserMsg(t);
            const low = t.toLowerCase();
            // Detección por niveles, pensada para un usuario poco técnico:
            // primero COMANDOS explícitos (crear/registrar, con verbo imperativo),
            // que no deben ser secuestrados por palabras de tiempo/estado; luego
            // las consultas informativas de negocio; luego navegación por
            // sustantivos; y al final el seguimiento (genérico) y el fallback.

            // 0) Folio de cliente CL-XXXX: lo más específico.
            const mCliente = t.match(/CL-\d{4}/i);
            if (mCliente) return consultarCliente(mCliente[0].toUpperCase());

            // 1) Registro/alta explícito (verbo imperativo + sustantivo de
            // sección). ANTES de negocio: "dar de alta un servicio para esta
            // semana" no debe irse a la agenda. Servicio antes que cliente: una
            // frase con ambos ("trabajo para el señor X") es un servicio.
            if (esRegistroServicio(low)) return navegar("servicios");
            if (esRegistroCliente(low)) return navegar("clientes");

            // 2) Consultas informativas de negocio (mixtas o simples). Van antes
            // de crear-presupuesto para que "cuantos presupuestos faltan" no abra
            // el flujo de creación.
            const tiposNegocio = detectarConsultasNegocio(low);
            if (tiposNegocio.length > 1) return consultarNegocioMultiple(tiposNegocio);
            if (tiposNegocio.length === 1) return consultarNegocio(tiposNegocio[0]);

            // 3) Intención de crear un presupuesto/cotización.
            if (esNuevoPresupuesto(low)) return empezarPresupuesto();

            // 4) Navegación / consulta de una sección por sustantivos. NOTAS va
            // antes que SERVICIOS ("ver el reporte de un servicio" = nota).
            if (incluyeAlguna(low, KEYWORDS_NAV_NOTAS)) return navegar("notas");
            if (incluyeAlguna(low, KEYWORDS_NAV_SERVICIOS)) return navegar("servicios");
            if (incluyeAlguna(low, KEYWORDS_NAV_CLIENTES)) return navegar("clientes");
            if (incluyeAlguna(low, KEYWORDS_NAV_USUARIOS)) return navegar("usuarios");

            // 5) Seguimiento al último resultado (keywords genéricas como
            // "cuáles"/"muéstrame": al final para no ganarle a algo explícito).
            if (esSeguimiento(low)) return mostrarDetalleContexto();

            // 6) Sin coincidencia.
            addBotMsg(
                "No entendí. Toca un botón o pregúntame por presupuestos, servicios, clientes o notas.",
            );
            return;
        }

        // En flujo de presupuesto, según paso actual:
        if (state.modo === "presupuesto") {
            switch (state.paso) {
                case "cliente_tipo": {
                    // El usuario escribió en vez de tocar [Cliente nuevo]/[Cliente existente].
                    const low = normaliza(t);
                    if (/(nuev|primera vez|no.*registr|no lo teng|no la teng)/.test(low)) {
                        return tipoCliente("nuevo");
                    }
                    if (/(exist|registrad|ya l[oa] teng|ya teng|ya esta|tenemos|conocid|de antes|viejo|antiguo)/.test(low)) {
                        return tipoCliente("existente");
                    }
                    addBotMsg("No entendí bien. ¿Puedes tocar una de las opciones de arriba?");
                    return;
                }
                case "cliente_nombre": {
                    if (t.length < 2) { addBotMsg("Nombre muy corto. Intenta de nuevo."); return; }
                    addUserMsg(t);
                    state.datos.cliente_nombre = t;
                    state.paso = "cliente_telefono";
                    addBotMsg("¿Cuál es su teléfono? (10 dígitos)");
                    return;
                }
                case "cliente_numero": {
                    const m = t.match(/CL-?(\d{1,4})/i);
                    if (!m) {
                        addBotMsg("Formato inválido. Debe ser CL-XXXX (ej. CL-0042).");
                        return;
                    }
                    addUserMsg(t);
                    state.datos.numero_cliente_existente = `CL-${m[1].padStart(4, "0")}`;
                    preguntarTipoServicio();
                    return;
                }
                case "cliente_telefono": {
                    const digits = t.replace(/\D+/g, "");
                    if (digits.length !== 10) {
                        addBotMsg("Necesito 10 dígitos exactos.");
                        return;
                    }
                    addUserMsg(t);
                    state.datos.cliente_telefono = digits;
                    preguntarTipoServicio();
                    return;
                }
                case "tipo_servicio": {
                    // Texto libre o dictado de voz: identificar el tipo de servicio.
                    const tipo = matchTipoServicio(t);
                    if (tipo) return seleccionarTipoServicio(tipo);
                    addBotMsg("No entendí bien. ¿Puedes tocar una de las opciones de arriba?");
                    return;
                }
                case "descripcion": {
                    if (t.length < 10) {
                        addBotMsg("Describe un poco más (mínimo 10 caracteres).");
                        return;
                    }
                    addUserMsg(t);
                    state.datos.descripcion = t;
                    iniciarPreguntasAdicionales();
                    return;
                }
                default: {
                    if (state.paso && state.paso.startsWith("pregunta:")) {
                        const idx = parseInt(state.paso.split(":")[1], 10);
                        const q = state.preguntas[idx];
                        // Texto libre o voz: mapearlo a una de las opciones del paso.
                        const opcion = q && matchOpcion(t, q.opciones);
                        if (opcion) return responderPregunta(opcion, idx);
                        addBotMsg("No entendí bien. ¿Puedes tocar una de las opciones de arriba?");
                        return;
                    }
                    addBotMsg("No entendí bien. ¿Puedes tocar una de las opciones de arriba?");
                }
            }
            return;
        }
    }

    /* ---------- Reconocimiento de voz (Web Speech API) ---------- */
    // iOS solo expone webkitSpeechRecognition (ya cubierto por SR) y exige
    // continuous=false. Apple limita el dictado a nivel sistema/WebKit, así que
    // la restricción aplica a todos los navegadores del dispositivo, no solo
    // Safari. Sin soporte, micBtn ya viene oculto.
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    let recognition = null;
    let recording = false;
    if (SR) {
        recognition = new SR();
        recognition.lang = "es-MX";
        recognition.continuous = false;     // requerido en iOS Safari
        recognition.interimResults = false; // requerido en iOS Safari
        recognition.maxAlternatives = 1;
        recognition.onresult = (e) => {
            const txt = e.results[0][0].transcript;
            input.value = txt;
            procesarTexto(txt);
            input.value = "";
        };
        recognition.onend = () => {
            recording = false;
            micBtn.classList.remove("is-recording");
        };
        recognition.onerror = (e) => {
            recording = false;
            micBtn.classList.remove("is-recording");
            // Micrófono no disponible / permiso denegado: avisar en el chat.
            if (e && (e.error === "not-allowed" || e.error === "service-not-allowed")) {
                addBotMsg(
                    isIOS
                        ? "El micrófono no está disponible en este dispositivo. Escribe tu mensaje directamente."
                        : "No pude acceder al micrófono. Revisa los permisos del micrófono en tu navegador.",
                );
            }
        };
        micBtn.addEventListener("click", () => {
            if (recording) {
                try { recognition.stop(); } catch { /* noop */ }
                return;
            }
            try {
                recognition.start();
                recording = true;
                micBtn.classList.add("is-recording");
            } catch { /* noop */ }
        });
    }

    /* ---------- Wiring final ---------- */
    btn.addEventListener("click", toggle);
    sendBtn.addEventListener("click", () => {
        const v = input.value;
        if (!v.trim()) return;
        procesarTexto(v);
        input.value = "";
    });
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
        }
    });

    // Inicialización: el asistente se muestra solo cuando hay sesión activa.
    // Reusa el mismo evento que el resto del panel admin.
    document.addEventListener("alas:session-ready", (e) => {
        state.sesion = e.detail || null;
        if (state.sesion) {
            mostrarBurbuja();
        } else {
            // Cierre de sesión: borra el historial del chat.
            limpiarHistorial();
            ocultarBurbuja();
        }
    });
})();
