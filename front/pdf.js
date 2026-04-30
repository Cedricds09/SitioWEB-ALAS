(() => {
    const BUSINESS_NAME = "Servicios Integrales ALAS";
    const BUSINESS_TAG  = "Mantenimiento Habitacional";
    const BUSINESS_INFO = "Ciudad de México  ·  Tel. +52 55 3167 5824";
    const LOGO_URL = "imagenes/logoprincipal.png";

    let logoDataUrl = null;
    let logoPromise = null;

    function loadLogo() {
        if (logoDataUrl) return Promise.resolve(logoDataUrl);
        if (logoPromise) return logoPromise;
        logoPromise = new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                try {
                    const canvas = document.createElement("canvas");
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    canvas.getContext("2d").drawImage(img, 0, 0);
                    logoDataUrl = canvas.toDataURL("image/png");
                    resolve(logoDataUrl);
                } catch (err) {
                    console.warn("[PDF] No se pudo convertir logo a dataURL:", err);
                    resolve(null);
                }
            };
            img.onerror = () => {
                console.warn("[PDF] Falló carga de logo:", LOGO_URL);
                resolve(null);
            };
            img.src = LOGO_URL;
        });
        return logoPromise;
    }

    // Precalentar logo
    loadLogo();

    function money(n) {
        const num = Number(n) || 0;
        const isWhole = Math.abs(num - Math.round(num)) < 0.005;
        return "$" + num.toLocaleString("es-MX", {
            minimumFractionDigits: isWhole ? 0 : 2,
            maximumFractionDigits: 2
        });
    }

    function qrDataUrl(text) {
        if (typeof QRious === "undefined") return null;
        const qr = new QRious({
            value: text,
            size: 240,
            background: "white",
            foreground: "black",
            level: "M"
        });
        return qr.toDataURL();
    }

    async function generate(note) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert("No se pudo cargar jsPDF. Revisa tu conexión a internet.");
            return;
        }
        const { jsPDF } = window.jspdf;
        const logo = await loadLogo();

        const id      = note.id      || "ALAS-0000";
        const date    = note.date    || "—";
        const name    = (note.name    || "—").toString();
        const phone   = (note.phone   || "—").toString();
        const service = (note.service || "—").toString();
        const message = (note.message || "").toString();
        const items   = Array.isArray(note.items) ? note.items : [];
        const total   = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);

        const doc = new jsPDF({ unit: "mm", format: "a4" });
        const W = 210, H = 297, M = 18;

        // Header bar
        doc.setFillColor(10, 18, 48);
        doc.rect(0, 0, W, 32, "F");

        if (logo) {
            try {
                doc.addImage(logo, "PNG", M, 6, 20, 20);
            } catch (err) {
                console.warn("[PDF] addImage logo falló:", err);
            }
        } else {
            doc.setDrawColor(255, 255, 255);
            doc.setLineWidth(0.5);
            doc.rect(M, 8, 16, 16);
            doc.setFontSize(7);
            doc.setTextColor(200, 210, 230);
            doc.text("LOGO", M + 8, 17, { align: "center" });
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.setTextColor(255, 255, 255);
        doc.text(BUSINESS_NAME, M + 22, 15);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(180, 190, 220);
        doc.text(BUSINESS_TAG, M + 22, 20);
        doc.text(BUSINESS_INFO, M + 22, 25);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(255, 255, 255);
        doc.text("NOTA", W - M, 13, { align: "right" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(id, W - M, 19, { align: "right" });
        doc.setFontSize(9);
        doc.setTextColor(180, 190, 220);
        doc.text(`Fecha: ${date}`, W - M, 25, { align: "right" });

        let y = 48;
        doc.setTextColor(40, 40, 40);

        // Cliente
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Cliente", M, y);
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);
        doc.line(M, y + 1.5, W - M, y + 1.5);
        y += 8;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(`Nombre:   ${name}`, M, y);
        y += 5.5;
        doc.text(`Teléfono: ${phone}`, M, y);

        // Servicio
        y += 11;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Servicio solicitado", M, y);
        doc.line(M, y + 1.5, W - M, y + 1.5);
        y += 8;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(`Tipo: ${service}`, M, y);
        if (message) {
            y += 6;
            const lines = doc.splitTextToSize(message, W - M * 2);
            doc.text(lines, M, y);
            y += lines.length * 5;
        }

        // Items
        y += 8;
        doc.setFillColor(240, 242, 248);
        doc.setDrawColor(210, 215, 225);
        doc.rect(M, y, W - M * 2, 9, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(40, 40, 40);
        doc.text("CONCEPTO", M + 3, y + 6);
        doc.text("MONTO", W - M - 3, y + 6, { align: "right" });
        y += 9;

        doc.setFont("helvetica", "normal");
        if (items.length === 0) {
            doc.setTextColor(150, 150, 150);
            doc.text("(Sin conceptos registrados)", M + 3, y + 6);
            doc.setTextColor(40, 40, 40);
            y += 9;
        } else {
            items.forEach(it => {
                const lines = doc.splitTextToSize(it.concept || "", W - M * 2 - 45);
                const rowH = Math.max(9, lines.length * 5 + 3);
                doc.text(lines, M + 3, y + 6);
                doc.text(money(Number(it.amount) || 0), W - M - 3, y + 6, { align: "right" });
                doc.setDrawColor(230, 232, 240);
                doc.line(M, y + rowH, W - M, y + rowH);
                y += rowH;
            });
        }

        // Total
        y += 2;
        doc.setFillColor(10, 18, 48);
        doc.rect(W - M - 80, y, 80, 11, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(255, 255, 255);
        doc.text("TOTAL", W - M - 77, y + 7);
        doc.text(money(total), W - M - 3, y + 7, { align: "right" });
        y += 18;

        // Pagado
        doc.setDrawColor(30, 130, 60);
        doc.setTextColor(30, 130, 60);
        doc.setLineWidth(1);
        doc.roundedRect(M, y, 42, 16, 2, 2);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(17);
        doc.text("PAGADO", M + 21, y + 10.5, { align: "center" });

        // Firma
        const sigX = W - M - 70;
        const sigY = y + 12;
        doc.setDrawColor(80, 80, 80);
        doc.setLineWidth(0.4);
        doc.line(sigX, sigY, sigX + 70, sigY);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(80, 80, 80);
        doc.text("Firma y sello", sigX + 35, sigY + 5, { align: "center" });

        // QR
        const qr = qrDataUrl(`ALAS|${id}|${date}|${total.toFixed(2)}`);
        if (qr) {
            doc.addImage(qr, "PNG", M, H - 42, 24, 24);
            doc.setFontSize(7);
            doc.setTextColor(120, 120, 120);
            doc.text(id, M + 12, H - 15, { align: "center" });
            doc.text("Escanea para validar", M + 12, H - 11, { align: "center" });
        }

        // Footer
        doc.setFontSize(8);
        doc.setTextColor(130, 130, 130);
        doc.text("Gracias por su confianza — Servicios Integrales ALAS", W / 2, H - 8, { align: "center" });

        const filename = note.filename || `${id}.pdf`;
        doc.save(filename);
    }

    window.AlasPDF = { generate };
})();
