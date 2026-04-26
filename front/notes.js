(() => {
    // Ajusta si el backend corre en otro host/puerto
    const API_BASE = "http://localhost:3000";

    function escape(s) {
        return String(s ?? "").replace(/[&<>"']/g, c => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[c]));
    }

    function money(n) {
        return "$" + (Number(n) || 0).toLocaleString("es-MX", {
            minimumFractionDigits: 2, maximumFractionDigits: 2
        });
    }

    function formatClienteId(c) {
        const s = String(c ?? "").trim();
        if (!s) return "—";
        return s.startsWith("CL-") ? s : `CL-${s}`;
    }

    function formatNotaId(id) {
        const n = parseInt(id, 10);
        if (!Number.isFinite(n)) return "NT-0000";
        return `NT-${String(n).padStart(4, "0")}`;
    }

    function formatPdfFileId(id) {
        const n = parseInt(id, 10);
        if (!Number.isFinite(n)) return "ALAS-0000";
        return `ALAS-${String(n).padStart(4, "0")}`;
    }

    // Privacidad: censurar teléfono, visibles solo últimos 3 dígitos
    function maskTelefono(raw) {
        if (!raw) return "";
        const digits = String(raw).replace(/\D+/g, "");
        if (!digits) return "";
        if (digits.length <= 3) return digits;
        const visibles = digits.slice(-3);
        const ocultos = "*".repeat(digits.length - 3);
        return `${ocultos}${visibles}`;
    }

    // Privacidad: solo primer nombre + primer apellido
    function sanitizarNombre(raw) {
        if (!raw) return "";
        const partes = String(raw).trim().split(/\s+/).filter(Boolean);
        if (partes.length === 0) return "";
        if (partes.length === 1) return partes[0];
        return `${partes[0]} ${partes[1]}`;
    }

    function formatFecha(f) {
        if (!f) return "—";
        const d = new Date(f);
        if (isNaN(d.getTime())) return String(f);
        return d.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
    }

    // Normaliza "conceptos" a array de { concept, amount } para pdf.js
    function parseConceptos(raw, total) {
        if (Array.isArray(raw)) {
            return raw.map(r => ({
                concept: String(r.concept ?? r.descripcion ?? r.nombre ?? r),
                amount: Number(r.amount ?? r.costo ?? r.precio ?? 0)
            }));
        }
        if (typeof raw === "string") {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) return parseConceptos(parsed, total);
            } catch { /* no es JSON, tratar como texto */ }
            const parts = raw.split(/\r?\n|;|,/).map(s => s.trim()).filter(Boolean);
            if (parts.length > 1) {
                return parts.map(p => ({ concept: p, amount: 0 }));
            }
            return [{ concept: raw, amount: Number(total) || 0 }];
        }
        return [{ concept: "Servicio", amount: Number(total) || 0 }];
    }

    function toPdfNote(data, cliente, validacion) {
        const nombreSafe = sanitizarNombre(data.nombre) || formatClienteId(data.cliente ?? cliente);
        const telMasked = maskTelefono(data.telefono) || "—";
        return {
            id: formatNotaId(data.id),
            filename: `${formatPdfFileId(data.id)}.pdf`,
            customerId: formatClienteId(data.cliente ?? cliente),
            date: formatFecha(data.fecha),
            name: nombreSafe,
            phone: telMasked,
            service: "Nota de servicio",
            message: typeof data.conceptos === "string" ? data.conceptos : "",
            items: parseConceptos(data.conceptos, data.total)
        };
    }

    function flashAndScroll(root) {
        root.scrollIntoView({ behavior: "smooth", block: "center" });
        root.classList.remove("flash");
        // reinicia animación
        void root.offsetWidth;
        root.classList.add("flash");
    }

    function renderError(msg, opts = {}) {
        const root = document.getElementById("notesResults");
        if (!root) return;
        root.classList.toggle("error", !!opts.notFound);
        root.innerHTML = `<p class="notes-empty">${escape(msg)}</p>`;
        flashAndScroll(root);
    }

    function renderNotFound() {
        renderError("No se encontró ninguna nota con los datos proporcionados", { notFound: true });
    }

    function renderNota(data, pdfNote) {
        const root = document.getElementById("notesResults");
        if (!root) return;

        root.classList.remove("error");
        const estadoClase = String(data.estado || "").toLowerCase() === "pagado" ? "paid" : "pending";
        const conceptosTxt = Array.isArray(pdfNote.items)
            ? pdfNote.items.map(i => i.concept).join(" · ")
            : String(data.conceptos ?? "—");

        root.innerHTML = `
            <p class="notes-count">1 nota encontrada</p>
            <ul class="notes-list">
                <li class="note-item">
                    <div class="note-meta">
                        <span class="note-id">${escape(formatNotaId(data.id))}</span>
                        <span class="note-id">Cliente: ${escape(formatClienteId(data.cliente))}</span>
                        <span class="note-date">${escape(formatFecha(data.fecha))}</span>
                    </div>
                    <div class="note-info">
                        <p class="note-service">${escape(conceptosTxt)}</p>
                        <p class="note-total">Total: ${escape(money(data.total))}</p>
                        <p class="note-status ${estadoClase}">Estado: ${escape(data.estado)}</p>
                    </div>
                    <button type="button" class="btn btn-primary note-dl">Descargar PDF</button>
                </li>
            </ul>
        `;

        const btn = root.querySelector(".note-dl");
        if (btn) {
            btn.addEventListener("click", () => {
                if (window.AlasPDF) window.AlasPDF.generate(pdfNote);
                else alert("Generador de PDF no disponible.");
            });
        }
    }

    async function buscarNota(cliente, validacion) {
        const root = document.getElementById("notesResults");
        if (root) root.innerHTML = '<p class="notes-count">Buscando…</p>';

        const url = `${API_BASE}/api/notas/${encodeURIComponent(cliente)}?validacion=${encodeURIComponent(validacion)}`;
        console.log("[FRONT] GET", url);

        try {
            const res = await fetch(url, { method: "GET" });
            const body = await res.json().catch(() => ({}));

            if (res.status === 404) {
                renderNotFound();
                return;
            }
            if (!res.ok || !body.ok) {
                renderError(body.error || `Error del servidor (${res.status}).`);
                return;
            }

            const pdfNote = toPdfNote(body.data, cliente, validacion);
            renderNota(body.data, pdfNote);
            flashAndScroll(root);
        } catch (err) {
            console.error("[FRONT] Error fetch:", err);
            renderError("No se pudo conectar al servidor. Verifica que el backend esté corriendo.");
        }
    }

    const form = document.getElementById("notesForm");
    if (form) {
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            const data = new FormData(form);
            const cliente = String(data.get("customer") || "").trim();
            const validacion = String(data.get("key") || "").trim();
            if (!cliente || !validacion) {
                renderError("Captura número de cliente y validación.");
                return;
            }
            buscarNota(cliente, validacion);
        });
    }

    window.AlasNotes = { buscar: buscarNota };
})();
