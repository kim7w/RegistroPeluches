    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
    import {
        getFirestore,
        collection,
        addDoc,
        getDocs,
        deleteDoc,
        doc,
        updateDoc
    } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

    const firebaseConfig = {
        apiKey: "AIzaSyCZIgfuXyL6_AZxPjbir7j7LIDxi3k5Xo",
        authDomain: "registropeluches.firebaseapp.com",
        projectId: "registropeluches",
        storageBucket: "registropeluches.firebasestorage.app",
        messagingSenderId: "1090804367320",
        appId: "1:1090804367320:web:15462d9a4dbb4c1f987cad",
        measurementId: "G-VZ537J3Q3E"
    };

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    const CLOUDINARY_UPLOAD = "https://api.cloudinary.com/v1_1/vspx5rke/image/upload";
    const CLOUDINARY_PRESET = "peluches";
    const MINIMO_DEFECTO = 2;

    const formulario = document.getElementById("formulario");
    const formularioPanel = document.getElementById("formularioPanel");
    const toggleFormulario = document.getElementById("toggleFormulario");
    const flechaFormulario = document.getElementById("flechaFormulario");
    const lista = document.getElementById("lista");
    const buscar = document.getElementById("buscar");
    const contador = document.getElementById("contador");
    const limpiarBusqueda = document.getElementById("limpiarBusqueda");
    const sinResultados = document.getElementById("sinResultados");
    const foto = document.getElementById("foto");
    const galeriaPrevia = document.getElementById("galeriaPrevia");
    const btnGuardar = document.getElementById("btnGuardar");
    const btnCancelar = document.getElementById("btnCancelar");

    let peluches = [];
    let editando = null;
    let filtroActivo = "todos";
    let ordenActivo = "reciente";
    const seleccionados = new Set();
    let modoSeleccion = false;
    let modoRapido = false;
    let detalleId = null;

    let visorFotos = [];
    let visorIndice = 0;

    let scanner = null;
    let scannerActivo = false;

    // OCR para etiquetas que traen el código escrito como texto
    // (por ejemplo: >ZDB-P4107) y no un código de barras.
    let ocrWorker = null;
    let ocrLoopActivo = false;
    let ocrProcesando = false;
    let ocrScriptCargando = null;

    let movimientoId = null;
    let movimientoTipo = "entrada";

    const normalizar = (v = "") =>
        String(v)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();

    function escaparHTML(valor = "") {
        return String(valor)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function numeroSeguro(valor) {
        const numero = Number(valor);
        return Number.isFinite(numero) ? numero : 0;
    }

    function obtenerFotos(p) {
        const fotos = Array.isArray(p.fotos)
            ? p.fotos.filter(Boolean)
            : [];

        if (p.foto && !fotos.includes(p.foto)) {
            fotos.unshift(p.foto);
        }

        return [...new Set(fotos)];
    }

    function obtenerCantidadLocal(p) {
        if (p.cantidadLocal !== undefined && p.cantidadLocal !== null) {
            return Math.max(0, numeroSeguro(p.cantidadLocal));
        }

        // Compatibilidad con registros antiguos.
        if (p.cantidad !== undefined && p.cantidad !== null) {
            return Math.max(0, numeroSeguro(p.cantidad));
        }

        return 0;
    }

    function obtenerCantidadBodega(p) {
        if (p.cantidadBodega !== undefined && p.cantidadBodega !== null) {
            return Math.max(0, numeroSeguro(p.cantidadBodega));
        }

        return 0;
    }

    function obtenerCantidad(p) {
        return obtenerCantidadLocal(p) + obtenerCantidadBodega(p);
    }

    function obtenerMinimo(p) {
        if (p.minimo === undefined || p.minimo === null || p.minimo === "") {
            return MINIMO_DEFECTO;
        }

        return Math.max(0, numeroSeguro(p.minimo));
    }

    function estadoPeluche(p) {
        const cantidad = obtenerCantidad(p);

        if (cantidad <= 0) return "Agotado";
        if (cantidad <= obtenerMinimo(p)) return "Poco inventario";

        return "Disponible";
    }

    function clasificarTamano(tamano = "") {
        const t = normalizar(tamano);
        const numeros = t.match(/\d+(?:[.,]\d+)?/g)?.map(n => Number(n.replace(",", "."))) || [];

        if (
            t.includes("grande") ||
            numeros.some(n => n >= 50)
        ) {
            return "grande";
        }

        if (
            t.includes("mediano") ||
            t.includes("mediana") ||
            numeros.some(n => n >= 25 && n < 50)
        ) {
            return "mediano";
        }

        if (
            t.includes("pequeno") ||
            t.includes("pequena") ||
            numeros.some(n => n < 25)
        ) {
            return "pequeno";
        }

        return "";
    }

    function actualizarResumen() {
        const unidades = peluches.reduce(
            (suma, p) => suma + obtenerCantidad(p),
            0
        );

        const refs = {
            totalPeluche: peluches.length,
            totalUnidades: unidades,
            totalDisponibles: peluches.filter(
                p => obtenerCantidad(p) > 0
            ).length,
            totalBajo: peluches.filter(
                p => estadoPeluche(p) === "Poco inventario"
            ).length,
            totalAgotados: peluches.filter(
                p => estadoPeluche(p) === "Agotado"
            ).length
        };

        Object.entries(refs).forEach(([id, value]) => {
            const elemento = document.getElementById(id);
            if (elemento) elemento.textContent = value;
        });
    }

    function coincideFiltro(p) {
        if (filtroActivo === "todos") return true;

        // Stock físico disponible específicamente en el LOCAL.
        if (filtroActivo === "local") {
            return obtenerCantidadLocal(p) > 0;
        }

        // Stock físico disponible específicamente en la BODEGA.
        if (filtroActivo === "bodega") {
            return obtenerCantidadBodega(p) > 0;
        }

        if (filtroActivo === "disponible") {
            return obtenerCantidad(p) > 0;
        }

        if (filtroActivo === "bajo") {
            return estadoPeluche(p) === "Poco inventario";
        }

        if (filtroActivo === "agotado") {
            return estadoPeluche(p) === "Agotado";
        }

        return clasificarTamano(p.tamano) === filtroActivo;
    }

    function coincideBusqueda(p, texto) {
        if (!texto) return true;

        const campos = [
            p.codigo,
            p.nombre,
            p.precio,
            p.etiqueta,
            p.tamano,
            p.observaciones,
            obtenerCantidadLocal(p),
            obtenerCantidadBodega(p),
            obtenerCantidad(p),
            p.fechaIngreso
        ];

        return normalizar(campos.join(" ")).includes(normalizar(texto));
    }

    function obtenerFiltrados() {
        const resultado = peluches.filter(
            p => coincideFiltro(p) && coincideBusqueda(p, buscar?.value || "")
        );

        const numero = valor => numeroSeguro(valor);
        resultado.sort((a, b) => {
            if (ordenActivo === "nombre") return normalizar(a.nombre).localeCompare(normalizar(b.nombre), "es");
            if (ordenActivo === "nombre-desc") return normalizar(b.nombre).localeCompare(normalizar(a.nombre), "es");
            if (ordenActivo === "precio") return numero(a.precio) - numero(b.precio);
            if (ordenActivo === "precio-desc") return numero(b.precio) - numero(a.precio);
            if (ordenActivo === "cantidad") return obtenerCantidad(b) - obtenerCantidad(a);
            if (ordenActivo === "cantidad-asc") return obtenerCantidad(a) - obtenerCantidad(b);
            if (ordenActivo === "agotados") return Number(estadoPeluche(b) === "Agotado") - Number(estadoPeluche(a) === "Agotado");
            if (ordenActivo === "bajo") return Number(estadoPeluche(b) === "Poco inventario") - Number(estadoPeluche(a) === "Poco inventario");
            return (String(b.fechaIngreso || "").localeCompare(String(a.fechaIngreso || ""))) || (peluches.indexOf(a) - peluches.indexOf(b));
        });

        return resultado;
    }

    function actualizarInterfazBusqueda() {
        const texto = (buscar?.value || "").trim();
        limpiarBusqueda?.classList.toggle("visible", Boolean(texto));

        const resultado = obtenerFiltrados();

        if (contador) {
            contador.textContent =
                texto || filtroActivo !== "todos"
                    ? `${resultado.length} producto${resultado.length === 1 ? "" : "s"} encontrado${resultado.length === 1 ? "" : "s"}`
                    : `Productos registrados: ${peluches.length}`;
        }

        const nombres = {
            todos: "Mostrando todos",
            grande: "Filtro: grandes",
            mediano: "Filtro: medianos",
            pequeno: "Filtro: pequeños",
            disponible: "Filtro: disponibles",
            bajo: "Filtro: poco inventario",
            agotado: "Filtro: agotados",
            local: "Filtro: con stock local",
            bodega: "Filtro: con stock bodega"
        };

        const filtroActual = document.getElementById("filtroActual");

        if (filtroActual) {
            filtroActual.textContent = texto
                ? `Buscando: “${texto}”`
                : nombres[filtroActivo];
        }

        mostrarPeluches(resultado);
    }


    function actualizarSeleccionUI() {
        const toolbar = document.getElementById("seleccionToolbar");
        const count = document.getElementById("seleccionCount");
        if (count) count.textContent = seleccionados.size;
        if (toolbar) toolbar.hidden = !modoSeleccion;

        document.querySelectorAll(".tarjeta[data-id]").forEach(tarjeta => {
            tarjeta.classList.toggle("seleccionada", seleccionados.has(tarjeta.dataset.id));
            const check = tarjeta.querySelector(".seleccion-check");
            if (check) check.checked = seleccionados.has(tarjeta.dataset.id);
        });
    }

    function alternarSeleccion(id, evento) {
        evento?.stopPropagation();
        if (seleccionados.has(id)) seleccionados.delete(id);
        else seleccionados.add(id);
        actualizarSeleccionUI();
    }

    function seleccionarVisibles() {
        obtenerFiltrados().forEach(p => seleccionados.add(p.id));
        actualizarSeleccionUI();
    }

    function quitarSeleccion() {
        seleccionados.clear();
        actualizarSeleccionUI();
    }

    function obtenerPeluchesParaImprimir() {
        if (seleccionados.size) {
            return peluches.filter(p => seleccionados.has(p.id));
        }
        const visibles = obtenerFiltrados();
        if (visibles.length) return visibles;
        return peluches;
    }

    function generarSVGBarcode(valor) {
        if (!valor || typeof window.JsBarcode !== "function") return "";
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        document.body.appendChild(svg);
        try {
            window.JsBarcode(svg, valor, {
                format: "CODE128",
                displayValue: true,
                fontSize: 14,
                height: 48,
                margin: 4,
                width: 1.7
            });
            return svg.outerHTML;
        } finally {
            svg.remove();
        }
    }

    function imprimirEtiquetas() {
        const productos = obtenerPeluchesParaImprimir();
        if (!productos.length) {
            alert("No hay peluches para imprimir.");
            return;
        }

        const etiquetas = productos.map(p => {
            const codigoBarra = p.etiqueta || p.codigo || "";
            const svg = generarSVGBarcode(codigoBarra);
            return `<div class="etiqueta-imprimir">
                <div class="etiqueta-nombre">${escaparHTML(p.nombre || "Peluche")}</div>
                <div class="etiqueta-codigo">${escaparHTML(codigoBarra)}</div>
                ${svg || `<div class="sin-barcode">${escaparHTML(codigoBarra)}</div>`}
                <div class="etiqueta-interno">Código interno: ${escaparHTML(p.codigo || "—")} · Q${escaparHTML(p.precio ?? "0")}</div>
            </div>`;
        }).join("");

        const ventana = window.open("", "_blank", "width=900,height=700");
        if (!ventana) {
            alert("El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes para esta página.");
            return;
        }

        ventana.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas de peluches</title>
        <style>
        *{box-sizing:border-box}body{margin:0;padding:10mm;font-family:Arial,sans-serif}.hoja{display:grid;grid-template-columns:repeat(3,1fr);gap:6mm}.etiqueta-imprimir{height:38mm;border:1px dashed #777;border-radius:3mm;padding:3mm;text-align:center;break-inside:avoid;display:flex;flex-direction:column;justify-content:center}.etiqueta-nombre{font-size:12pt;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.etiqueta-codigo{font-size:9pt;margin-top:1mm;font-weight:700}.etiqueta-imprimir svg{width:100%;max-height:16mm}.etiqueta-interno{font-size:7pt;margin-top:1mm}.sin-barcode{font-size:15pt;font-weight:700;margin:4mm 0}@media print{body{padding:0}.hoja{gap:3mm}}
        </style></head><body><div class="hoja">${etiquetas}</div><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
        ventana.document.close();
    }

    function abrirDetalle(id) {
        const p = peluches.find(x => x.id === id);
        if (!p) return;
        detalleId = id;

        const fotos = obtenerFotos(p);
        const principal = fotos[0] || "";
        const local = obtenerCantidadLocal(p);
        const bodega = obtenerCantidadBodega(p);
        const total = obtenerCantidad(p);
        const estado = estadoPeluche(p);

        const titulo = document.getElementById("detalleTitulo");
        const subtitulo = document.getElementById("detalleSubtitulo");
        const contenido = document.getElementById("detalleContenido");
        if (titulo) titulo.textContent = p.nombre || "Peluche";
        if (subtitulo) subtitulo.textContent = `${p.etiqueta || "Sin etiqueta"} · ${p.codigo || "Sin código interno"}`;
        if (contenido) {
            contenido.innerHTML = `<div class="detalle-contenido">
                ${principal ? `<img class="detalle-imagen" src="${escaparHTML(principal)}" alt="${escaparHTML(p.nombre || "Peluche")}">` : `<div class="detalle-imagen sin-foto">🧸</div>`}
                <div>
                    <div class="detalle-datos">
                        <div class="detalle-dato"><small>PRECIO</small><strong>Q${escaparHTML(p.precio ?? "0")}</strong></div>
                        <div class="detalle-dato"><small>ESTADO</small><strong>${escaparHTML(estado)}</strong></div>
                        <div class="detalle-dato"><small>🏪 LOCAL</small><strong>${local}</strong></div>
                        <div class="detalle-dato"><small>📦 BODEGA</small><strong>${bodega}</strong></div>
                        <div class="detalle-dato"><small>📊 TOTAL</small><strong>${total}</strong></div>
                        <div class="detalle-dato"><small>⚠️ MÍNIMO</small><strong>${obtenerMinimo(p)}</strong></div>
                    </div>
                    ${p.tamano ? `<p><strong>📏 Medida:</strong> ${escaparHTML(p.tamano)}</p>` : ""}
                    ${p.observaciones ? `<p><strong>💬 Observaciones:</strong> ${escaparHTML(p.observaciones)}</p>` : ""}
                    ${p.etiqueta ? `<div class="detalle-barcode-wrap"><svg id="detalleBarcode" class="detalle-barcode"></svg></div>` : ""}
                </div>
            </div>`;
            if (p.etiqueta && typeof window.JsBarcode === "function") {
                try { window.JsBarcode("#detalleBarcode", p.etiqueta, {format:"CODE128", displayValue:true, height:55, margin:4}); } catch(e) {}
            }
        }
        document.getElementById("detalleModal")?.classList.add("abierto");
    }

    function cerrarDetalle() {
        document.getElementById("detalleModal")?.classList.remove("abierto");
        detalleId = null;
    }

    function crearTarjeta(p) {
        const fotos = obtenerFotos(p);
        const principal = fotos[0] || "";

        const local = obtenerCantidadLocal(p);
        const bodega = obtenerCantidadBodega(p);
        const cantidad = local + bodega;

        const estado = estadoPeluche(p);
        const agotado = estado === "Agotado";
        const bajo = estado === "Poco inventario";

        const miniaturas =
            fotos.length > 1
                ? `<div class="miniaturas">
                    ${fotos.map((url, i) => `
                        <img
                            src="${escaparHTML(url)}"
                            alt="Foto ${i + 1}"
                            class="${i === 0 ? "activa" : ""}"
                            loading="lazy"
                            onclick="cambiarFotoTarjeta(event,'${p.id}',${i})"
                        >
                    `).join("")}
                </div>`
                : "";

        const imagen = principal
            ? `<img
                id="foto-${p.id}"
                src="${escaparHTML(principal)}"
                alt="${escaparHTML(p.nombre || "Peluche")}"
                loading="lazy"
                onclick="abrirVisorPorId('${p.id}',0)"
            >`
            : `<div class="sin-foto">🧸</div>`;

        const badgeClass = agotado ? "agotado" : (bajo ? "bajo" : "");

        return `
            <article class="tarjeta" data-id="${p.id}">
                ${modoSeleccion ? `<input class="seleccion-check" type="checkbox" aria-label="Seleccionar ${escaparHTML(p.nombre || "peluche")}" ${seleccionados.has(p.id) ? "checked" : ""} onclick="alternarSeleccion('${p.id}',event)">` : ""}
                <div class="imagen-principal">
                    ${imagen}
                    <span class="badge-estado ${badgeClass}">${estado}</span>
                    <span class="cantidad-badge">
                        📦 ${cantidad} ${cantidad === 1 ? "unidad" : "unidades"}
                    </span>
                </div>

                ${miniaturas}

                <div class="info">
                    <h3 class="nombre-clicable" onclick="abrirDetalle('${p.id}')">${escaparHTML(p.nombre || "Sin nombre")}</h3>

                    <div class="etiquetas">
                        ${
                            p.etiqueta
                                ? `<span class="etiqueta-chip">🏷️ ${escaparHTML(p.etiqueta)}</span>`
                                : ""
                        }

                        ${
                            p.tamano
                                ? `<span class="etiqueta-chip">📏 ${escaparHTML(p.tamano)}</span>`
                                : ""
                        }
                    </div>

                    <div class="precio">
                        Q${escaparHTML(p.precio ?? "0")}
                    </div>

                    <div class="datos">
                        <div class="dato">
                            <small>CÓDIGO</small>
                            <strong>${escaparHTML(p.codigo || "—")}</strong>
                        </div>

                        <div class="dato ${bajo ? "alerta" : ""}">
                            <small>📊 TOTAL</small>
                            <strong>${cantidad}</strong>
                        </div>

                        <div class="dato">
                            <small>🏪 LOCAL</small>
                            <strong>${local}</strong>
                        </div>

                        <div class="dato">
                            <small>📦 BODEGA</small>
                            <strong>${bodega}</strong>
                        </div>

                        <div class="dato">
                            <small>⚠️ MÍNIMO</small>
                            <strong>${obtenerMinimo(p)}</strong>
                        </div>

                        <div class="dato">
                            <small>📏 MEDIDA</small>
                            <strong>${escaparHTML(p.tamano || "—")}</strong>
                        </div>

                        <div class="dato">
                            <small>📅 INGRESO</small>
                            <strong>${escaparHTML(p.fechaIngreso || "—")}</strong>
                        </div>

                        <div class="dato">
                            <small>📷 FOTOS</small>
                            <strong>${fotos.length}</strong>
                        </div>
                    </div>

                    ${
                        p.observaciones
                            ? `<p class="observaciones">💬 ${escaparHTML(p.observaciones)}</p>`
                            : ""
                    }
                </div>

                ${modoRapido ? `
                <div class="modo-rapido-tarjeta">
                    <button type="button" onclick="movimientoRapido('${p.id}','entrada','local')">🏪 +1</button>
                    <button type="button" onclick="movimientoRapido('${p.id}','salida','local')">🏪 −1</button>
                    <button type="button" onclick="movimientoRapido('${p.id}','entrada','bodega')">📦 +1</button>
                    <button type="button" onclick="movimientoRapido('${p.id}','salida','bodega')">📦 −1</button>
                </div>` : ""}

                <div class="botones">
                    <button
                        class="btn-entrada"
                        type="button"
                        onclick="abrirMovimiento('${p.id}','entrada')"
                    >
                        ➕ Entrada
                    </button>

                    <button
                        class="btn-salida"
                        type="button"
                        onclick="abrirMovimiento('${p.id}','salida')"
                    >
                        ➖ Salida
                    </button>

                    <button
                        class="btn-editar"
                        type="button"
                        onclick="editarPeluche('${p.id}')"
                    >
                        ✏️ Editar
                    </button>

                    <button
                        class="btn-eliminar"
                        type="button"
                        onclick="eliminarPeluche('${p.id}')"
                    >
                        🗑️
                    </button>
                </div>
            </article>
        `;
    }

    function mostrarPeluches(datos) {
        if (!lista) return;

        lista.innerHTML = datos.map(crearTarjeta).join("");

        if (sinResultados) {
            sinResultados.style.display = datos.length ? "none" : "block";
        }
        actualizarSeleccionUI();
    }

    async function cargarPeluches() {
        try {
            if (lista) {
                lista.innerHTML = `
                    <div class="sin-resultados">
                        <div>⏳</div>
                        <p>Cargando inventario...</p>
                    </div>
                `;
            }

            const consulta = await getDocs(
                collection(db, "peluches")
            );

            peluches = [];

            consulta.forEach(d => {
                peluches.push({
                    id: d.id,
                    ...d.data()
                });
            });

            actualizarResumen();
            actualizarInterfazBusqueda();

        } catch (error) {
            console.error("Error cargando inventario:", error);

            if (lista) {
                lista.innerHTML = `
                    <div class="sin-resultados">
                        <div>⚠️</div>
                        <h3>No se pudo cargar el inventario</h3>
                        <p>Revisa tu conexión e inténtalo de nuevo.</p>
                    </div>
                `;
            }
        }
    }

    async function comprimirImagen(
        archivo,
        maxSize = 1600,
        calidad = 0.80
    ) {
        if (
            archivo.type === "image/gif" ||
            archivo.type === "image/svg+xml"
        ) {
            return archivo;
        }

        return new Promise(resolve => {
            const imagen = new Image();
            const url = URL.createObjectURL(archivo);

            imagen.onload = () => {
                URL.revokeObjectURL(url);

                let ancho = imagen.naturalWidth;
                let alto = imagen.naturalHeight;

                if (ancho > maxSize || alto > maxSize) {
                    const escala = Math.min(
                        maxSize / ancho,
                        maxSize / alto
                    );

                    ancho = Math.round(ancho * escala);
                    alto = Math.round(alto * escala);
                }

                const canvas = document.createElement("canvas");
                canvas.width = ancho;
                canvas.height = alto;

                const ctx = canvas.getContext("2d");

                if (!ctx) {
                    resolve(archivo);
                    return;
                }

                ctx.drawImage(
                    imagen,
                    0,
                    0,
                    ancho,
                    alto
                );

                canvas.toBlob(
                    blob => {
                        if (!blob) {
                            resolve(archivo);
                            return;
                        }

                        resolve(
                            new File(
                                [blob],
                                archivo.name.replace(/\.[^/.]+$/, "") + ".webp",
                                {
                                    type: "image/webp",
                                    lastModified: Date.now()
                                }
                            )
                        );
                    },
                    "image/webp",
                    calidad
                );
            };

            imagen.onerror = () => {
                URL.revokeObjectURL(url);
                resolve(archivo);
            };

            imagen.src = url;
        });
    }

    async function subirImagenCloudinary(archivo) {
        if (!archivo) return "";

        const optimizado = await comprimirImagen(archivo);

        const datos = new FormData();

        datos.append("file", optimizado);
        datos.append("upload_preset", CLOUDINARY_PRESET);

        const respuesta = await fetch(
            CLOUDINARY_UPLOAD,
            {
                method: "POST",
                body: datos
            }
        );

        if (!respuesta.ok) {
            throw new Error("No se pudo subir una imagen.");
        }

        const resultado = await respuesta.json();

        return resultado.secure_url || "";
    }

    if (foto) {
        foto.addEventListener("change", () => {
            if (!galeriaPrevia) return;

            galeriaPrevia.innerHTML = "";

            [...foto.files].forEach(file => {
                if (!file.type.startsWith("image/")) return;

                const url = URL.createObjectURL(file);
                const img = document.createElement("img");

                img.src = url;
                img.alt = "Vista previa";

                img.onload = () => {
                    URL.revokeObjectURL(url);
                };

                galeriaPrevia.appendChild(img);
            });
        });
    }


    // ===== CÓDIGOS DE BARRAS SIN ETIQUETA =====
    // Los códigos SIN-XXXX se guardan en el campo "etiqueta" (código de barras),
    // nunca en "codigo" (costo de compra).
    async function generarCodigoBarrasSinEtiqueta() {
        const usados = new Set(
            peluches
                .map(p => String(p.etiqueta || "").trim().toUpperCase())
                .filter(Boolean)
        );

        let numero = 1;

        // Códigos generados con cinco dígitos: SIN-00001, SIN-00002...
        while (usados.has(`SIN-${String(numero).padStart(5, "0")}`)) {
            numero++;
        }

        return `SIN-${String(numero).padStart(5, "0")}`;
    }

    async function asignarCodigoBarrasSinEtiqueta() {
        const campo = document.getElementById("etiqueta");
        if (!campo) return;

        const actual = campo.value.trim();
        if (actual) return;

        campo.value = await generarCodigoBarrasSinEtiqueta();
        campo.dataset.generado = "true";
    }

    function abrirFormulario() {
        if (!formulario) return;

        formulario.hidden = false;

        formularioPanel?.classList.remove("colapsado");

        toggleFormulario?.setAttribute(
            "aria-expanded",
            "true"
        );

        if (flechaFormulario) {
            flechaFormulario.textContent = "⌃";
        }

        formulario.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }

    function cerrarFormulario() {
        if (!formulario) return;

        formulario.hidden = true;

        formularioPanel?.classList.add("colapsado");

        toggleFormulario?.setAttribute(
            "aria-expanded",
            "false"
        );

        if (flechaFormulario) {
            flechaFormulario.textContent = "⌄";
        }
    }

    toggleFormulario?.addEventListener("click", () => {
        if (formulario.hidden) {
            abrirFormulario();
        } else {
            cerrarFormulario();
        }
    });

    document.getElementById("btnNuevo")?.addEventListener(
        "click",
        () => {
            cancelarEdicion();
            abrirFormulario();

            document.getElementById("codigo")?.focus();
        }
    );

    async function guardarFormulario(e) {
        e.preventDefault();

        const original =
            btnGuardar?.textContent || "💾 Guardar producto";

        if (btnGuardar) {
            btnGuardar.disabled = true;
            btnGuardar.textContent = "⏳ Guardando...";
        }

        try {
            const codigo =
                document.getElementById("codigo")?.value.trim() || "";

            const nombre =
                document.getElementById("nombre")?.value.trim() || "";

            const precio =
                document.getElementById("precio")?.value || "";

            const etiqueta =
                document.getElementById("etiqueta")?.value.trim() || "";

            const tamano =
                document.getElementById("medida")?.value.trim() || "";

            // CORRECCIÓN PRINCIPAL:
            // El HTML tiene cantidadLocal y cantidadBodega.
            const cantidadLocal = Math.max(
                0,
                numeroSeguro(
                    document.getElementById("cantidadLocal")?.value
                )
            );

            const cantidadBodega = Math.max(
                0,
                numeroSeguro(
                    document.getElementById("cantidadBodega")?.value
                )
            );

            const cantidad = cantidadLocal + cantidadBodega;

            const minimo = Math.max(
                0,
                numeroSeguro(
                    document.getElementById("minimo")?.value
                )
            );

            const observaciones =
                document.getElementById("observaciones")?.value.trim() || "";

            const fechaIngreso =
                document.getElementById("fechaIngreso")?.value || "";

            if (!codigo || !nombre || !precio) {
                alert("Completa código / costo de compra, nombre y precio.");
                return;
            }

            // Si no existe etiqueta/código de barras, generar uno automáticamente
            // EN EL CAMPO etiqueta, sin tocar el campo codigo/costo.
            let etiquetaFinal = etiqueta;
            if (!etiquetaFinal) {
                etiquetaFinal = await generarCodigoBarrasSinEtiqueta();
                const campoEtiqueta = document.getElementById("etiqueta");
                if (campoEtiqueta) campoEtiqueta.value = etiquetaFinal;
            }

            let fotos = [];

            if (foto?.files?.length) {
                fotos = (
                    await Promise.all(
                        [...foto.files].map(subirImagenCloudinary)
                    )
                ).filter(Boolean);

            } else if (editando) {
                const existente = peluches.find(
                    p => p.id === editando
                );

                fotos = existente
                    ? obtenerFotos(existente)
                    : [];
            }

            // El código interno / código del producto puede repetirse.
            // La etiqueta / código de barras es la que debe ser única.
            const existentePorEtiqueta = peluches.find(
                p =>
                    normalizar(p.etiqueta) === normalizar(etiquetaFinal) &&
                    p.id !== editando
            );

            if (existentePorEtiqueta) {
                alert(
                    "Ese código de barras / etiqueta ya está registrado. Busca el producto existente o usa otro código."
                );
                return;
            }

            const datos = {
                codigo,
                nombre,
                precio,
                etiqueta: etiquetaFinal,
                tamano,

                cantidad,
                cantidadLocal,
                cantidadBodega,

                minimo,
                observaciones,

                foto: fotos[0] || "",
                fotos,

                fechaIngreso,

                estado:
                    cantidad <= 0
                        ? "Agotado"
                        : (
                            cantidad <= minimo
                                ? "Poco inventario"
                                : "Disponible"
                        )
            };

            if (editando) {
                await updateDoc(
                    doc(db, "peluches", editando),
                    datos
                );

                const indice = peluches.findIndex(
                    p => p.id === editando
                );

                if (indice !== -1) {
                    peluches[indice] = {
                        id: editando,
                        ...datos
                    };
                }

            } else {
                const nuevo = await addDoc(
                    collection(db, "peluches"),
                    datos
                );

                peluches.unshift({
                    id: nuevo.id,
                    ...datos
                });
            }

            actualizarResumen();
            actualizarInterfazBusqueda();

            cancelarEdicion();
            cerrarFormulario();

            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });

        } catch (error) {
            console.error("Error guardando producto:", error);

            alert(
                "No se pudo guardar el producto. Revisa tu conexión e inténtalo de nuevo."
            );

        } finally {
            if (btnGuardar) {
                btnGuardar.disabled = false;

                btnGuardar.textContent = editando
                    ? original
                    : "💾 Guardar producto";
            }
        }
    }

    formulario?.addEventListener(
        "submit",
        guardarFormulario
    );

    function editarPeluche(id) {
        const p = peluches.find(
            x => x.id === id
        );

        if (!p) {
            alert("No se encontró el producto.");
            return;
        }

        document.getElementById("codigo").value =
            p.codigo || "";

        document.getElementById("nombre").value =
            p.nombre || "";

        document.getElementById("precio").value =
            p.precio ?? "";

        document.getElementById("etiqueta").value =
            p.etiqueta || "";

        document.getElementById("medida").value =
            p.tamano || "";

        document.getElementById("cantidadLocal").value =
            obtenerCantidadLocal(p);

        document.getElementById("cantidadBodega").value =
            obtenerCantidadBodega(p);

        document.getElementById("minimo").value =
            obtenerMinimo(p);

        document.getElementById("observaciones").value =
            p.observaciones || "";

        document.getElementById("fechaIngreso").value =
            p.fechaIngreso || "";

        if (galeriaPrevia) {
            galeriaPrevia.innerHTML =
                obtenerFotos(p)
                    .map(
                        url =>
                            `<img src="${escaparHTML(url)}" alt="Foto guardada">`
                    )
                    .join("");
        }

        editando = id;

        if (btnGuardar) {
            btnGuardar.textContent =
                "💾 Actualizar producto";
        }

        if (btnCancelar) {
            btnCancelar.style.display = "block";
        }

        abrirFormulario();
    }

    function cancelarEdicion() {
        formulario?.reset();

        if (galeriaPrevia) {
            galeriaPrevia.innerHTML = "";
        }

        editando = null;

        if (btnGuardar) {
            btnGuardar.textContent =
                "💾 Guardar producto";
        }

        if (btnCancelar) {
            btnCancelar.style.display = "none";
        }

        const minimo =
            document.getElementById("minimo");

        if (minimo) {
            minimo.value = MINIMO_DEFECTO;
        }

        const cantidadLocal =
            document.getElementById("cantidadLocal");

        if (cantidadLocal) {
            cantidadLocal.value = 0;
        }

        const cantidadBodega =
            document.getElementById("cantidadBodega");

        if (cantidadBodega) {
            cantidadBodega.value = 0;
        }
    }

    btnCancelar?.addEventListener(
        "click",
        () => {
            cancelarEdicion();
            cerrarFormulario();
        }
    );


    function descargarArchivo(nombre, contenido, tipo = "application/json") {
        const blob = new Blob([contenido], { type: tipo });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = nombre;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function exportarRespaldo() {
        const respaldo = {
            version: 1,
            app: "Registro de Peluches de Kim",
            exportado: new Date().toISOString(),
            peluches: peluches.map(p => ({ ...p, id: undefined }))
        };
        const fecha = new Date().toISOString().slice(0,10);
        descargarArchivo(`respaldo_peluches_${fecha}.json`, JSON.stringify(respaldo, null, 2));
        alert("✅ Copia de seguridad descargada.");
    }

    async function importarRespaldo(archivo) {
        if (!archivo) return;
        try {
            const texto = await archivo.text();
            const respaldo = JSON.parse(texto);
            const registros = Array.isArray(respaldo) ? respaldo : respaldo.peluches;
            if (!Array.isArray(registros)) throw new Error("El archivo no contiene una lista válida de peluches.");

            const existentes = new Set(peluches.map(p => normalizar(p.etiqueta || "")).filter(Boolean));
            let agregados = 0;
            let omitidos = 0;

            for (const original of registros) {
                const datos = { ...original };
                delete datos.id;
                if (!datos.codigo || !datos.nombre) { omitidos++; continue; }
                if (!datos.etiqueta) {
                    let n = 1;
                    while (existentes.has(`sin-${String(n).padStart(5, "0")}`)) n++;
                    datos.etiqueta = `SIN-${String(n).padStart(5, "0")}`;
                }
                const clave = normalizar(datos.etiqueta);
                if (existentes.has(clave)) { omitidos++; continue; }
                datos.cantidadLocal = Math.max(0, numeroSeguro(datos.cantidadLocal));
                datos.cantidadBodega = Math.max(0, numeroSeguro(datos.cantidadBodega));
                datos.cantidad = datos.cantidadLocal + datos.cantidadBodega;
                datos.minimo = Math.max(0, numeroSeguro(datos.minimo ?? MINIMO_DEFECTO));
                datos.estado = estadoPeluche(datos);
                await addDoc(collection(db, "peluches"), datos);
                existentes.add(clave);
                agregados++;
            }

            alert(`Importación terminada.\n\n✅ Agregados: ${agregados}\n⏭️ Omitidos por duplicado o datos incompletos: ${omitidos}`);
            await cargarPeluches();
        } catch (error) {
            console.error("Error importando respaldo:", error);
            alert(`No se pudo importar el respaldo.\n\n${error.message || "Archivo no válido."}`);
        }
    }

    async function eliminarPeluche(id) {
        if (
            !confirm(
                "¿Deseas eliminar este producto? Esta acción no se puede deshacer."
            )
        ) {
            return;
        }

        try {
            await deleteDoc(
                doc(db, "peluches", id)
            );

            peluches = peluches.filter(
                p => p.id !== id
            );

            actualizarResumen();
            actualizarInterfazBusqueda();

        } catch (error) {
            console.error(
                "Error eliminando producto:",
                error
            );

            alert(
                "No se pudo eliminar el producto."
            );
        }
    }

    function actualizarResumenMovimiento(p) {
        const local =
            obtenerCantidadLocal(p);

        const bodega =
            obtenerCantidadBodega(p);

        const total =
            local + bodega;

        const movimientoLocal =
            document.getElementById("movimientoLocal");

        const movimientoBodega =
            document.getElementById("movimientoBodega");

        const movimientoTotal =
            document.getElementById("movimientoTotal");

        // Compatibilidad con el HTML actual.
        const movimientoActual =
            document.getElementById("movimientoActual");

        if (movimientoLocal) {
            movimientoLocal.textContent = local;
        }

        if (movimientoBodega) {
            movimientoBodega.textContent = bodega;
        }

        if (movimientoTotal) {
            movimientoTotal.textContent = total;
        }

        if (movimientoActual) {
            movimientoActual.textContent = total;
        }
    }

    async function actualizarCantidad(
        id,
        tipo,
        destino,
        cantidadMovimiento
    ) {
        const p = peluches.find(
            x => x.id === id
        );

        if (!p) {
            throw new Error(
                "Producto no encontrado."
            );
        }

        const cantidad = Math.max(
            0,
            Math.floor(numeroSeguro(cantidadMovimiento))
        );

        if (!cantidad) {
            throw new Error(
                "La cantidad debe ser mayor que 0."
            );
        }

        let local =
            obtenerCantidadLocal(p);

        let bodega =
            obtenerCantidadBodega(p);

        const antesLocal = local;
        const antesBodega = bodega;

        if (tipo === "entrada") {
            if (destino === "local") {
                local += cantidad;
            } else {
                bodega += cantidad;
            }
        } else {
            if (destino === "local") {
                if (cantidad > local) {
                    throw new Error(
                        `No puedes sacar ${cantidad} del local. Solo hay ${local}.`
                    );
                }

                local -= cantidad;

            } else {
                if (cantidad > bodega) {
                    throw new Error(
                        `No puedes sacar ${cantidad} de bodega. Solo hay ${bodega}.`
                    );
                }

                bodega -= cantidad;
            }
        }

        const total = local + bodega;

        const movimiento = {
            tipo,
            destino,
            cantidad,
            antesLocal,
            antesBodega,
            despuesLocal: local,
            despuesBodega: bodega,
            antesTotal: antesLocal + antesBodega,
            despuesTotal: total,
            fecha: new Date().toISOString()
        };

        const historial = Array.isArray(p.movimientos)
            ? [...p.movimientos, movimiento]
            : [movimiento];

        const datosActualizar = {
            cantidad: total,
            cantidadLocal: local,
            cantidadBodega: bodega,

            estado:
                total <= 0
                    ? "Agotado"
                    : (
                        total <= obtenerMinimo(p)
                            ? "Poco inventario"
                            : "Disponible"
                    ),

            ultimoMovimiento: movimiento,

            movimientos:
                historial.slice(-50)
        };

        await updateDoc(
            doc(db, "peluches", id),
            datosActualizar
        );

        p.cantidad = total;
        p.cantidadLocal = local;
        p.cantidadBodega = bodega;
        p.estado = datosActualizar.estado;
        p.ultimoMovimiento =
            movimiento;
        p.movimientos =
            datosActualizar.movimientos;

        actualizarResumen();
        actualizarInterfazBusqueda();
    }

    function abrirMovimiento(id, tipo) {
        const p = peluches.find(
            x => x.id === id
        );

        if (!p) return;

        movimientoId = id;
        movimientoTipo = tipo;

        const titulo =
            document.getElementById(
                "movimientoTitulo"
            );

        const producto =
            document.getElementById(
                "movimientoProducto"
            );

        const cantidad =
            document.getElementById(
                "movimientoCantidad"
            );

        const destino =
            document.getElementById(
                "movimientoDestino"
            );

        if (titulo) {
            titulo.textContent =
                tipo === "entrada"
                    ? "➕ Registrar entrada"
                    : "➖ Registrar salida";
        }

        if (producto) {
            producto.textContent =
                p.nombre || "Producto";
        }

        actualizarResumenMovimiento(p);

        if (cantidad) {
            cantidad.value = 1;
        }

        if (destino) {
            destino.value =
                tipo === "entrada"
                    ? "local"
                    : "local";
        }

        const destinoLabel =
            document.getElementById(
                "movimientoDestinoLabel"
            );

        if (destinoLabel) {
            destinoLabel.firstChild.textContent =
                tipo === "entrada"
                    ? "Destino "
                    : "Origen ";
        }

        const modal =
            document.getElementById(
                "movimientoModal"
            );

        modal?.classList.add("abierto");

        setTimeout(
            () =>
                document
                    .getElementById("movimientoCantidad")
                    ?.focus(),
            100
        );
    }

    function cerrarMovimiento() {
        document
            .getElementById("movimientoModal")
            ?.classList.remove("abierto");

        movimientoId = null;
    }

    document
        .getElementById("cerrarMovimiento")
        ?.addEventListener(
            "click",
            cerrarMovimiento
        );

    document
        .getElementById("btnCancelarMovimiento")
        ?.addEventListener(
            "click",
            cerrarMovimiento
        );

    document
        .getElementById("btnConfirmarMovimiento")
        ?.addEventListener(
            "click",
            async () => {
                if (!movimientoId) return;

                const p = peluches.find(
                    x => x.id === movimientoId
                );

                if (!p) return;

                const cantidad =
                    Number(
                        document.getElementById(
                            "movimientoCantidad"
                        )?.value
                    );

                const destino =
                    document.getElementById(
                        "movimientoDestino"
                    )?.value || "local";

                if (
                    !Number.isInteger(cantidad) ||
                    cantidad <= 0
                ) {
                    alert(
                        "Ingresa una cantidad entera mayor que 0."
                    );
                    return;
                }

                const boton =
                    document.getElementById(
                        "btnConfirmarMovimiento"
                    );

                if (boton) {
                    boton.disabled = true;
                    boton.textContent =
                        "Guardando...";
                }

                try {
                    await actualizarCantidad(
                        movimientoId,
                        movimientoTipo,
                        destino,
                        cantidad
                    );

                    cerrarMovimiento();

                } catch (error) {
                    console.error(
                        "Error registrando movimiento:",
                        error
                    );

                    alert(
                        error.message ||
                        "No se pudo registrar el movimiento. Revisa tu conexión."
                    );

                } finally {
                    if (boton) {
                        boton.disabled = false;
                        boton.textContent =
                            "Confirmar";
                    }
                }
            }
        );

    document
        .getElementById("movimientoModal")
        ?.addEventListener(
            "click",
            e => {
                if (
                    e.target.id ===
                    "movimientoModal"
                ) {
                    cerrarMovimiento();
                }
            }
        );

    async function cargarTesseract() {
        if (window.Tesseract) return window.Tesseract;

        if (ocrScriptCargando) {
            return ocrScriptCargando;
        }

        ocrScriptCargando = new Promise((resolve, reject) => {
            const existente = document.querySelector(
                'script[data-tesseract="registro-peluches"]'
            );

            if (existente) {
                existente.addEventListener("load", () => resolve(window.Tesseract), { once: true });
                existente.addEventListener("error", reject, { once: true });
                return;
            }

            const script = document.createElement("script");
            script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
            script.async = true;
            script.dataset.tesseract = "registro-peluches";
            script.onload = () => resolve(window.Tesseract);
            script.onerror = () => reject(new Error("No se pudo cargar el lector OCR."));
            document.head.appendChild(script);
        });

        try {
            return await ocrScriptCargando;
        } finally {
            ocrScriptCargando = null;
        }
    }

    function normalizarCodigoOCR(valor = "") {
        return String(valor)
            .toUpperCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[\r\n]+/g, " ")
            .replace(/[|]/g, "I")
            .replace(/[—–−]/g, "-")
            .replace(/\s+/g, " ")
            .trim();
    }

    function equivalenciaCodigo(valor = "") {
        return normalizarCodigoOCR(valor)
            .replace(/^\s*[>›»]+\s*/, "")
            .replace(/\s+/g, "")
            .replace(/[._/\\]+/g, "-");
    }

    function buscarProductoPorCodigo(valor = "") {
        const normal = equivalenciaCodigo(valor);
        if (!normal) return null;

        return peluches.find(p => {
            const codigo = equivalenciaCodigo(p.codigo || "");
            const etiqueta = equivalenciaCodigo(p.etiqueta || "");
            return codigo === normal || etiqueta === normal;
        }) || null;
    }

    function extraerCodigoDesdeOCR(texto = "") {
        const textoLimpio = normalizarCodigoOCR(texto);

        // Primero intentamos encontrar el formato típico de estas etiquetas:
        // >ZDB-P4107, ZDB-P4107, XY-25013, etc.
        const candidatos = textoLimpio
            .split(/\s+/)
            .map(x => x.replace(/[^A-Z0-9>_-]/g, ""))
            .filter(Boolean);

        const combinados = [];
        for (const candidato of candidatos) {
            combinados.push(candidato);
        }

        const porLinea = textoLimpio
            .split(/\n+/)
            .map(x => x.replace(/[^A-Z0-9>_-]/g, "").trim())
            .filter(Boolean);

        combinados.push(...porLinea);

        for (const candidato of combinados) {
            const limpio = candidato.replace(/_+/g, "-");
            if (
                /^>?[A-Z0-9]{2,}[A-Z0-9_-]*-[A-Z0-9_-]{2,}$/.test(limpio) &&
                /[A-Z]/.test(limpio) &&
                /[0-9]/.test(limpio)
            ) {
                return limpio;
            }
        }

        // Si OCR separó el código en dos partes, probamos a unir tokens.
        for (let i = 0; i < candidatos.length - 1; i++) {
            const unido = `${candidatos[i]}-${candidatos[i + 1]}`;
            if (
                /^>?[A-Z0-9]{2,}[A-Z0-9_-]*-[A-Z0-9_-]{2,}$/.test(unido) &&
                /[A-Z]/.test(unido) &&
                /[0-9]/.test(unido)
            ) {
                return unido;
            }
        }

        return "";
    }

    async function iniciarOCR() {
        if (ocrLoopActivo || !scannerActivo) return;

        const estado = document.getElementById("scannerEstado");
        ocrLoopActivo = true;

        try {
            if (estado) {
                estado.textContent =
                    "Lector activo. Apunta al código impreso; también intento leer códigos de barras.";
            }

            const T = await cargarTesseract();
            if (!T || !scannerActivo) return;

            ocrWorker = await T.createWorker("eng");

            const video = document.querySelector("#reader video");
            if (!video) {
                if (estado) {
                    estado.textContent =
                        "No encontré la cámara. Mantén visible el recuadro y vuelve a intentarlo.";
                }
                return;
            }

            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (!ctx) return;

            while (ocrLoopActivo && scannerActivo) {
                if (!video.videoWidth || !video.videoHeight || ocrProcesando) {
                    await new Promise(r => setTimeout(r, 300));
                    continue;
                }

                ocrProcesando = true;

                try {
                    const escala = Math.min(
                        1,
                        1100 / video.videoWidth
                    );

                    canvas.width = Math.max(640, Math.round(video.videoWidth * escala));
                    canvas.height = Math.max(480, Math.round(video.videoHeight * escala));

                    ctx.drawImage(
                        video,
                        0,
                        0,
                        canvas.width,
                        canvas.height
                    );

                    // Aumentamos contraste para ayudar a leer letras negras sobre blanco.
                    const imagen = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const pixeles = imagen.data;

                    for (let i = 0; i < pixeles.length; i += 4) {
                        const gris = Math.round(
                            pixeles[i] * 0.299 +
                            pixeles[i + 1] * 0.587 +
                            pixeles[i + 2] * 0.114
                        );
                        const contraste = gris < 165 ? 0 : 255;
                        pixeles[i] = contraste;
                        pixeles[i + 1] = contraste;
                        pixeles[i + 2] = contraste;
                    }

                    ctx.putImageData(imagen, 0, 0);

                    const resultado = await ocrWorker.recognize(canvas);
                    const texto = resultado?.data?.text || "";
                    const codigo = extraerCodigoDesdeOCR(texto);

                    if (codigo) {
                        const encontrado = buscarProductoPorCodigo(codigo);

                        if (encontrado) {
                            if (estado) {
                                estado.textContent = `Código detectado: ${codigo}`;
                            }

                            ocrLoopActivo = false;
                            procesarCodigoEscaneado(codigo);
                            break;
                        }

                        // Aunque todavía no exista, lo mandamos al flujo normal
                        // para poder registrarlo como producto nuevo.
                        if (equivalenciaCodigo(codigo).length >= 5) {
                            if (estado) {
                                estado.textContent = `Código detectado: ${codigo}. Confirmando...`;
                            }

                            ocrLoopActivo = false;
                            procesarCodigoEscaneado(codigo);
                            break;
                        }
                    }
                } catch (error) {
                    console.warn("OCR: no se pudo leer este intento", error);
                } finally {
                    ocrProcesando = false;
                }

                await new Promise(r => setTimeout(r, 900));
            }
        } catch (error) {
            console.error("Error iniciando OCR:", error);
            if (estado && scannerActivo) {
                estado.textContent =
                    "No se pudo activar la lectura de texto. Puedes escribir el código abajo.";
            }
        } finally {
            ocrLoopActivo = false;
            ocrProcesando = false;
        }
    }

    async function abrirScanner() {
        const modal = document.getElementById("scannerModal");
        const estado = document.getElementById("scannerEstado");

        modal?.classList.add("abierto");

        if (estado) {
            estado.textContent =
                "Preparando cámara y lector...";
        }

        try {
            if (typeof Html5Qrcode === "undefined") {
                if (estado) {
                    estado.textContent =
                        "No se pudo cargar el lector de cámara. También puedes escribir el código abajo.";
                }
                return;
            }

            if (scannerActivo) return;

            scanner = new Html5Qrcode("reader");
            scannerActivo = true;

            await scanner.start(
                { facingMode: "environment" },
                {
                    fps: 10,
                    qrbox: {
                        width: 320,
                        height: 180
                    }
                },
                codigo => {
                    // Esta ruta sigue funcionando para códigos de barras/QR.
                    procesarCodigoEscaneado(codigo);
                },
                () => {}
            );

            if (estado) {
                estado.textContent =
                    "Cámara activa. Apunta al código. También leeré códigos impresos como >ZDB-P4107.";
            }

            // La etiqueta de la foto es texto, no un código de barras.
            // Por eso iniciamos OCR además del lector tradicional.
            iniciarOCR();

        } catch (error) {
            console.error("Error abriendo cámara:", error);

            if (estado) {
                estado.textContent =
                    "No se pudo abrir la cámara. Revisa el permiso del navegador o escribe el código.";
            }

            ocrLoopActivo = false;
            scannerActivo = false;
            scanner = null;
        }
    }

    async function cerrarScanner() {
        const modal = document.getElementById("scannerModal");

        ocrLoopActivo = false;
        ocrProcesando = false;

        if (ocrWorker) {
            try {
                await ocrWorker.terminate();
            } catch (e) {}
            ocrWorker = null;
        }

        if (scanner && scannerActivo) {
            try {
                await scanner.stop();
            } catch (e) {}

            try {
                await scanner.clear();
            } catch (e) {}
        }

        scanner = null;
        scannerActivo = false;

        modal?.classList.remove("abierto");

        const codigoManual = document.getElementById("codigoManual");
        if (codigoManual) {
            codigoManual.value = "";
        }
    }

    function procesarCodigoEscaneado(codigo) {
        const valor = String(codigo ?? "")
            .replace(/[\r\n]+/g, " ")
            .trim();

        if (!valor) return;

        cerrarScanner();

        const encontrado = buscarProductoPorCodigo(valor);

        if (encontrado) {
            if (buscar) buscar.value = encontrado.etiqueta || encontrado.codigo || valor;
            filtroActivo = "todos";
            document.querySelectorAll(".filtro").forEach(boton => boton.classList.toggle("activo", boton.dataset.filtro === "todos"));
            actualizarInterfazBusqueda();
            setTimeout(() => abrirDetalle(encontrado.id), 80);
        } else {
            cancelarEdicion();
            abrirFormulario();

            // El escáner trabaja con la ETIQUETA / código de barras.
            // El código interno (#1N0FWB, etc.) se escribe aparte y puede repetirse.
            const etiquetaInput = document.getElementById("etiqueta");
            if (etiquetaInput) {
                etiquetaInput.value = valor;
            }

            document.getElementById("codigo")?.focus();

            alert(
                `Código ${valor} no registrado. Se colocó en Etiqueta / código de barras. Completa los demás datos para crear el producto.`
            );
        }
    }

    document
        .getElementById("btnEscanear")
        ?.addEventListener(
            "click",
            abrirScanner
        );

    document
        .getElementById(
            "btnEscanearFormulario"
        )
        ?.addEventListener(
            "click",
            abrirScanner
        );

    document
        .getElementById("cerrarScanner")
        ?.addEventListener(
            "click",
            cerrarScanner
        );

    document
        .getElementById("btnCodigoManual")
        ?.addEventListener(
            "click",
            () =>
                procesarCodigoEscaneado(
                    document.getElementById(
                        "codigoManual"
                    )?.value
                )
        );

    document
        .getElementById("codigoManual")
        ?.addEventListener(
            "keydown",
            e => {
                if (e.key === "Enter") {
                    procesarCodigoEscaneado(
                        e.target.value
                    );
                }
            }
        );

    buscar?.addEventListener(
        "input",
        actualizarInterfazBusqueda
    );

    limpiarBusqueda?.addEventListener(
        "click",
        () => {
            if (buscar) {
                buscar.value = "";
                buscar.focus();
            }

            actualizarInterfazBusqueda();
        }
    );

    document
        .querySelectorAll(".filtro")
        .forEach(
            boton =>
                boton.addEventListener(
                    "click",
                    () => {
                        filtroActivo =
                            boton.dataset.filtro;

                        document
                            .querySelectorAll(
                                ".filtro"
                            )
                            .forEach(
                                b =>
                                    b.classList.remove(
                                        "activo"
                                    )
                            );

                        boton.classList.add(
                            "activo"
                        );

                        actualizarInterfazBusqueda();
                    }
                )
        );

    // Filtros directos del panel de herramientas.
    function aplicarFiltroInventario(filtro) {
        filtroActivo = filtro;

        document.querySelectorAll(".filtro").forEach(boton => {
            boton.classList.toggle(
                "activo",
                boton.dataset.filtro === filtro
            );
        });

        actualizarInterfazBusqueda();
    }

    document.getElementById("btnFiltroLocal")?.addEventListener("click", () => {
        aplicarFiltroInventario("local");
    });

    document.getElementById("btnFiltroBodega")?.addEventListener("click", () => {
        aplicarFiltroInventario("bodega");
    });

    document.getElementById("btnLimpiarFiltros")?.addEventListener("click", () => {
        aplicarFiltroInventario("todos");
        if (buscar) buscar.value = "";
        actualizarInterfazBusqueda();
    });

    function cambiarFotoTarjeta(
        evento,
        id,
        indice
    ) {
        evento.stopPropagation();

        const p = peluches.find(
            x => x.id === id
        );

        if (!p) return;

        const fotos =
            obtenerFotos(p);

        const img =
            document.getElementById(
                `foto-${id}`
            );

        if (
            img &&
            fotos[indice]
        ) {
            img.src =
                fotos[indice];

            img.onclick = () =>
                abrirVisorPorId(
                    id,
                    indice
                );
        }

        img
            ?.closest(".tarjeta")
            ?.querySelectorAll(
                ".miniaturas img"
            )
            .forEach(
                (miniatura, i) =>
                    miniatura.classList.toggle(
                        "activa",
                        i === indice
                    )
            );
    }

    function abrirVisorPorId(
        id,
        indice = 0
    ) {
        const p =
            peluches.find(
                x => x.id === id
            );

        if (!p) return;

        visorFotos =
            obtenerFotos(p);

        if (!visorFotos.length) return;

        visorIndice = Math.max(
            0,
            Math.min(
                indice,
                visorFotos.length - 1
            )
        );

        actualizarVisor();

        document
            .getElementById(
                "visorImagen"
            )
            ?.classList.add(
                "abierto"
            );
    }

    function actualizarVisor() {
        const imagenGrande =
            document.getElementById(
                "imagenGrande"
            );

        const contadorImagenes =
            document.getElementById(
                "contadorImagenes"
            );

        if (imagenGrande) {
            imagenGrande.src =
                visorFotos[
                    visorIndice
                ] || "";
        }

        if (contadorImagenes) {
            contadorImagenes.textContent =
                visorFotos.length > 1
                    ? `${visorIndice + 1} / ${visorFotos.length}`
                    : "";
        }
    }

    function cambiarVisor(
        direccion
    ) {
        if (
            visorFotos.length < 2
        ) {
            return;
        }

        visorIndice =
            (
                visorIndice +
                direccion +
                visorFotos.length
            ) %
            visorFotos.length;

        actualizarVisor();
    }

    function cerrarVisor() {
        document
            .getElementById(
                "visorImagen"
            )
            ?.classList.remove(
                "abierto"
            );
    }

    document
        .getElementById(
            "imagenAnterior"
        )
        ?.addEventListener(
            "click",
            e => {
                e.stopPropagation();
                cambiarVisor(-1);
            }
        );

    document
        .getElementById(
            "imagenSiguiente"
        )
        ?.addEventListener(
            "click",
            e => {
                e.stopPropagation();
                cambiarVisor(1);
            }
        );

    document
        .getElementById(
            "cerrarVisor"
        )
        ?.addEventListener(
            "click",
            cerrarVisor
        );

    document
        .getElementById(
            "visorImagen"
        )
        ?.addEventListener(
            "click",
            e => {
                if (
                    e.target.id ===
                    "visorImagen"
                ) {
                    cerrarVisor();
                }
            }
        );

    document.addEventListener(
        "keydown",
        e => {
            if (e.key === "Escape") {
                cerrarVisor();
                cerrarScanner();
                cerrarMovimiento();
            }

            if (
                document
                    .getElementById(
                        "visorImagen"
                    )
                    ?.classList.contains(
                        "abierto"
                    )
            ) {
                if (
                    e.key === "ArrowLeft"
                ) {
                    cambiarVisor(-1);
                }

                if (
                    e.key === "ArrowRight"
                ) {
                    cambiarVisor(1);
                }
            }
        }
    );


    document.getElementById("ordenar")?.addEventListener("change", e => {
        ordenActivo = e.target.value;
        actualizarInterfazBusqueda();
    });

    document.getElementById("btnSeleccionarTodos")?.addEventListener("click", seleccionarVisibles);
    document.getElementById("btnQuitarSeleccion")?.addEventListener("click", quitarSeleccion);
    document.getElementById("btnImprimirSeleccion")?.addEventListener("click", imprimirEtiquetas);
    document.getElementById("btnImprimir")?.addEventListener("click", imprimirEtiquetas);
    document.getElementById("btnExportar")?.addEventListener("click", exportarRespaldo);
    document.getElementById("btnImportar")?.addEventListener("click", () => document.getElementById("archivoImportar")?.click());
    document.getElementById("archivoImportar")?.addEventListener("change", e => {
        const archivo = e.target.files?.[0];
        importarRespaldo(archivo);
        e.target.value = "";
    });
    document.getElementById("cerrarDetalle")?.addEventListener("click", cerrarDetalle);
    document.getElementById("detalleModal")?.addEventListener("click", e => {
        if (e.target.id === "detalleModal") cerrarDetalle();
    });
    document.getElementById("detalleEntrada")?.addEventListener("click", () => {
        if (!detalleId) return;
        const id = detalleId;
        cerrarDetalle();
        abrirMovimiento(id, "entrada");
    });
    document.getElementById("detalleSalida")?.addEventListener("click", () => {
        if (!detalleId) return;
        const id = detalleId;
        cerrarDetalle();
        abrirMovimiento(id, "salida");
    });
    document.getElementById("detalleEditar")?.addEventListener("click", () => {
        if (!detalleId) return;
        const id = detalleId;
        cerrarDetalle();
        editarPeluche(id);
    });

    // Funciones utilizadas directamente desde el HTML.
    window.editarPeluche =
        editarPeluche;

    window.eliminarPeluche =
        eliminarPeluche;

    window.abrirMovimiento =
        abrirMovimiento;

    window.cambiarFotoTarjeta =
        cambiarFotoTarjeta;

    window.alternarSeleccion = alternarSeleccion;
    window.abrirDetalle = abrirDetalle;

    window.abrirVisorPorId =
        abrirVisorPorId;

    cerrarFormulario();
    cargarPeluches();




    // ============================================================
    // MENÚ LATERAL + MODO TRABAJO RÁPIDO + SELECCIÓN DE ETIQUETAS
    // ============================================================
    const menuLateral = document.getElementById("menuLateral");
    const menuOverlay = document.getElementById("menuOverlay");
    const btnMenu = document.getElementById("btnMenu");
    const cerrarMenuBtn = document.getElementById("cerrarMenu");
    const modoRapidoBarra = document.getElementById("modoRapidoBarra");

    function abrirMenu() {
        if (!menuLateral) return;
        menuLateral.classList.add("abierto");
        menuLateral.setAttribute("aria-hidden", "false");
        if (menuOverlay) {
            menuOverlay.hidden = false;
            requestAnimationFrame(() => menuOverlay.classList.add("visible"));
        }
        btnMenu?.setAttribute("aria-expanded", "true");
        document.body.classList.add("menu-abierto");
    }

    function cerrarMenu() {
        if (!menuLateral) return;
        menuLateral.classList.remove("abierto");
        menuLateral.setAttribute("aria-hidden", "true");
        if (menuOverlay) {
            menuOverlay.classList.remove("visible");
            menuOverlay.hidden = true;
        }
        btnMenu?.setAttribute("aria-expanded", "false");
        document.body.classList.remove("menu-abierto");
    }

    function irAElemento(id) {
        document.getElementById(id)?.scrollIntoView({behavior:"smooth", block:"start"});
        cerrarMenu();
    }

    function actualizarEstadoMenu() {
        const totalP = document.getElementById("menuTotalPeluche");
        const totalU = document.getElementById("menuTotalUnidades");
        const bajo = document.getElementById("menuTotalBajo");
        const agotados = document.getElementById("menuTotalAgotados");
        if (totalP) totalP.textContent = peluches.length;
        if (totalU) totalU.textContent = peluches.reduce((s,p)=>s+obtenerCantidad(p),0);
        if (bajo) bajo.textContent = peluches.filter(p=>estadoPeluche(p)==="Poco inventario").length;
        if (agotados) agotados.textContent = peluches.filter(p=>estadoPeluche(p)==="Agotado").length;
        const estado = document.getElementById("menuModoRapido");
        if (estado) estado.textContent = modoRapido ? "ON" : "OFF";
    }

    function activarModoSeleccion() {
        modoSeleccion = true;
        document.body.classList.add("modo-seleccion-activo");
        actualizarSeleccionUI();
        mostrarPeluches(obtenerFiltrados());
        document.getElementById("seleccionToolbar")?.scrollIntoView({behavior:"smooth", block:"start"});
        cerrarMenu();
    }

    function salirModoSeleccion() {
        modoSeleccion = false;
        seleccionados.clear();
        document.body.classList.remove("modo-seleccion-activo");
        actualizarSeleccionUI();
        mostrarPeluches(obtenerFiltrados());
    }

    function alternarModoRapido() {
        modoRapido = !modoRapido;
        if (modoRapido) {
            modoRapidoBarra?.removeAttribute("hidden");
        } else {
            modoRapidoBarra?.setAttribute("hidden", "");
        }
        document.body.classList.toggle("modo-rapido-activo", modoRapido);
        actualizarEstadoMenu();
        actualizarInterfazBusqueda();
        cerrarMenu();
    }

    async function movimientoRapido(id, tipo, destino) {
        try {
            await actualizarCantidad(id, tipo, destino, 1);
        } catch (error) {
            alert(error?.message || "No se pudo actualizar el inventario.");
        }
    }

    function abrirHistorialProducto(id) {
        const p = peluches.find(x=>x.id===id);
        if (!p) return;
        const modal = document.getElementById("historialModal");
        const titulo = document.getElementById("historialProducto");
        const contenido = document.getElementById("historialContenido");
        if (titulo) titulo.textContent = `${p.nombre || "Peluche"} · ${p.etiqueta || "Sin etiqueta"}`;
        const movimientos = Array.isArray(p.movimientos) ? [...p.movimientos].reverse() : [];
        if (contenido) {
            contenido.innerHTML = movimientos.length ? movimientos.map(m => `
                <div class="historial-item">
                    <strong>${m.tipo === "entrada" ? "➕ Entrada" : "➖ Salida"}</strong>
                    <span>${m.cantidad} unidad(es) · ${m.destino === "local" ? "🏪 Local" : "📦 Bodega"}</span>
                    <small>${new Date(m.fecha).toLocaleString("es-GT")}</small>
                </div>
            `).join("") : `<div class="sin-resultados"><div>🕘</div><p>No hay movimientos registrados.</p></div>`;
        }
        modal?.classList.add("abierto");
    }

    function abrirHistorialGlobal() {
        const modal = document.getElementById("historialModal");
        const titulo = document.getElementById("historialProducto");
        const contenido = document.getElementById("historialContenido");
        if (titulo) titulo.textContent = "Todos los movimientos";
        const movimientos = [];
        peluches.forEach(p => {
            (Array.isArray(p.movimientos) ? p.movimientos : []).forEach(m => movimientos.push({p,m}));
        });
        movimientos.sort((a,b)=>new Date(b.m.fecha)-new Date(a.m.fecha));
        if (contenido) {
            contenido.innerHTML = movimientos.length ? movimientos.slice(0,200).map(({p,m}) => `
                <div class="historial-item">
                    <strong>${m.tipo === "entrada" ? "➕ Entrada" : "➖ Salida"} · ${escaparHTML(p.nombre || "Peluche")}</strong>
                    <span>${m.cantidad} unidad(es) · ${m.destino === "local" ? "🏪 Local" : "📦 Bodega"}</span>
                    <small>${new Date(m.fecha).toLocaleString("es-GT")}</small>
                </div>
            `).join("") : `<div class="sin-resultados"><div>🕘</div><p>No hay movimientos registrados.</p></div>`;
        }
        modal?.classList.add("abierto");
        cerrarMenu();
    }

    btnMenu?.addEventListener("click", abrirMenu);
    cerrarMenuBtn?.addEventListener("click", cerrarMenu);
    menuOverlay?.addEventListener("click", cerrarMenu);
    document.getElementById("btnSalirModoRapido")?.addEventListener("click", () => {
        if (modoRapido) alternarModoRapido();
    });
    document.getElementById("cerrarHistorial")?.addEventListener("click", () => document.getElementById("historialModal")?.classList.remove("abierto"));
    document.getElementById("historialModal")?.addEventListener("click", e => {
        if (e.target.id === "historialModal") e.currentTarget.classList.remove("abierto");
    });
    document.getElementById("detalleHistorial")?.addEventListener("click", () => {
        if (detalleId) abrirHistorialProducto(detalleId);
    });

    document.querySelectorAll("[data-menu-action]").forEach(btn => {
        btn.addEventListener("click", () => {
            const accion = btn.dataset.menuAction;
            if (accion === "inicio") irAElemento("seccionResumen");
            else if (accion === "peluches") irAElemento("seccionPeluches");
            else if (accion === "nuevo") { cancelarEdicion(); abrirFormulario(); cerrarMenu(); }
            else if (accion === "escanear") { abrirScanner(); cerrarMenu(); }
            else if (accion === "rapido") alternarModoRapido();
            else if (accion === "historial") abrirHistorialGlobal();
            else if (accion === "bajo") { filtroActivo="bajo"; document.querySelectorAll(".filtro").forEach(x=>x.classList.toggle("activo",x.dataset.filtro==="bajo")); actualizarInterfazBusqueda(); cerrarMenu(); }
            else if (accion === "agotado") { filtroActivo="agotado"; document.querySelectorAll(".filtro").forEach(x=>x.classList.toggle("activo",x.dataset.filtro==="agotado")); actualizarInterfazBusqueda(); cerrarMenu(); }
            else if (accion === "etiquetas") { modoSeleccion ? salirModoSeleccion() : activarModoSeleccion(); }
            else if (accion === "exportar") { exportarRespaldo(); cerrarMenu(); }
            else if (accion === "importar") { document.getElementById("archivoImportar")?.click(); cerrarMenu(); }
        });
    });

    // El botón de etiquetas, si existe en alguna versión anterior del HTML, ahora entra al modo selección.
    document.getElementById("btnImprimir")?.addEventListener("click", () => {
        modoSeleccion ? salirModoSeleccion() : activarModoSeleccion();
    });

    // Recalcula los contadores del menú después de cada cambio de inventario.
    const actualizarResumenBase = actualizarResumen;
    actualizarResumen = function() {
        actualizarResumenBase();
        actualizarEstadoMenu();
    };

    window.movimientoRapido = movimientoRapido;
    window.abrirHistorialProducto = abrirHistorialProducto;

    actualizarEstadoMenu();
    actualizarSeleccionUI();

    // ============================================================
    // CÓDIGO DE BARRAS: BOTÓN "SIN CÓDIGO" SIEMPRE DISPONIBLE
    // ============================================================
    document.getElementById("btnSinCodigo")?.addEventListener("click", async () => {
        const campo = document.getElementById("etiqueta");
        if (!campo) return;

        if (!campo.value.trim()) {
            campo.value = await generarCodigoBarrasSinEtiqueta();
            campo.dataset.generado = "true";
        }

        campo.focus();
        campo.select();
    });

    // ============================================================
    // BÚSQUEDA VISUAL RÁPIDA
    // Compara una foto con las fotos principales ya registradas.
    // No usa IA externa: trabaja con una firma pequeña de imagen y
    // guarda las firmas en el navegador para que las siguientes
    // búsquedas sean mucho más rápidas.
    // ============================================================
    const VISUAL_CACHE_KEY = "registroPeluchesVisualCacheV1";
    const VISUAL_SIZE = 24;
    const VISUAL_MAX_RESULTADOS = 8;
    let fotoBusquedaEnCurso = false;
    let visualCache = null;

    function cargarCacheVisual() {
        if (visualCache) return visualCache;
        try {
            visualCache = JSON.parse(localStorage.getItem(VISUAL_CACHE_KEY) || "{}") || {};
        } catch (_) {
            visualCache = {};
        }
        return visualCache;
    }

    function guardarCacheVisual() {
        try {
            localStorage.setItem(VISUAL_CACHE_KEY, JSON.stringify(visualCache || {}));
        } catch (_) {
            // Si el almacenamiento está lleno, la búsqueda sigue funcionando sin caché.
        }
    }

    function urlMiniaturaVisual(url) {
        if (!url) return "";
        // Cloudinary: pedimos una miniatura pequeña para no descargar las fotos grandes.
        if (url.includes("res.cloudinary.com/") && url.includes("/image/upload/")) {
            return url.replace("/image/upload/", "/image/upload/w_160,h_160,c_fill,q_auto,f_auto/");
        }
        return url;
    }

    function cargarImagenVisual(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.decoding = "async";
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("No se pudo cargar la imagen."));
            img.src = urlMiniaturaVisual(url);
        });
    }

    function firmaImagen(img) {
        const canvas = document.createElement("canvas");
        canvas.width = VISUAL_SIZE;
        canvas.height = VISUAL_SIZE;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, VISUAL_SIZE, VISUAL_SIZE);

        const data = ctx.getImageData(0, 0, VISUAL_SIZE, VISUAL_SIZE).data;
        const hist = new Array(32).fill(0);
        const gris = [];
        let sr = 0, sg = 0, sb = 0;
        const totalPix = VISUAL_SIZE * VISUAL_SIZE;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i] / 255;
            const g = data[i + 1] / 255;
            const b = data[i + 2] / 255;
            sr += r; sg += g; sb += b;
            const y = 0.299 * r + 0.587 * g + 0.114 * b;
            gris.push(y);
            const ri = Math.min(3, Math.floor(r * 4));
            const gi = Math.min(3, Math.floor(g * 4));
            const bi = Math.min(1, Math.floor(b * 2));
            hist[(ri * 4 + gi) * 2 + bi]++;
        }

        for (let i = 0; i < hist.length; i++) hist[i] /= totalPix;

        // Miniatura en escala de grises para captar forma/silueta además del color.
        const small = [];
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                let suma = 0;
                for (let yy = 0; yy < 3; yy++) {
                    for (let xx = 0; xx < 3; xx++) {
                        const px = Math.min(VISUAL_SIZE - 1, x * 3 + xx);
                        const py = Math.min(VISUAL_SIZE - 1, y * 3 + yy);
                        suma += gris[py * VISUAL_SIZE + px];
                    }
                }
                small.push(suma / 9);
            }
        }

        return {
            mean: [sr / totalPix, sg / totalPix, sb / totalPix],
            hist,
            small
        };
    }

    function distanciaVisual(a, b) {
        if (!a || !b) return Infinity;
        let color = 0;
        for (let i = 0; i < 3; i++) color += Math.abs(a.mean[i] - b.mean[i]);

        let hist = 0;
        for (let i = 0; i < a.hist.length; i++) hist += Math.abs(a.hist[i] - b.hist[i]);

        let forma = 0;
        for (let i = 0; i < a.small.length; i++) forma += Math.abs(a.small[i] - b.small[i]);

        // Menor puntuación = foto más parecida.
        return color * 0.35 + hist * 0.45 + (forma / a.small.length) * 0.20;
    }

    async function firmaDeFotoUrl(url) {
        const cache = cargarCacheVisual();
        if (cache[url]) return cache[url];
        try {
            const img = await cargarImagenVisual(url);
            const firma = firmaImagen(img);
            cache[url] = firma;
            return firma;
        } catch (_) {
            return null;
        }
    }

    async function firmaDeArchivo(file) {
        const img = await cargarImagenVisual(URL.createObjectURL(file));
        return firmaImagen(img);
    }

    function renderResultadosVisual(resultados) {
        const contenedor = document.getElementById("fotoBusquedaResultados");
        if (!contenedor) return;

        contenedor.innerHTML = resultados.length
            ? resultados.map(r => {
                const p = r.p;
                const fotos = obtenerFotos(p);
                const fotoPrincipal = fotos[0] || "";
                return `<button type="button" class="resultado-visual" data-visual-id="${escaparHTML(p.id)}">
                    ${fotoPrincipal ? `<img src="${escaparHTML(urlMiniaturaVisual(fotoPrincipal))}" alt="">` : `<div class="resultado-visual-sin-foto">🧸</div>`}
                    <span><strong>${escaparHTML(p.nombre || "Sin nombre")}</strong><small>${escaparHTML(p.etiqueta || p.codigo || "Sin código")} · ${obtenerCantidad(p)} unidad(es)</small></span>
                    <b>Ver</b>
                </button>`;
            }).join("")
            : `<div class="sin-resultados"><div>🔎</div><p>No encontramos una coincidencia clara.</p><small>Prueba con una foto más parecida y con el peluche centrado.</small></div>`;

        contenedor.querySelectorAll("[data-visual-id]").forEach(btn => {
            btn.addEventListener("click", () => {
                abrirDetalle(btn.dataset.visualId);
                document.getElementById("fotoBusquedaModal")?.classList.remove("abierto");
            });
        });
    }

    async function ejecutarBusquedaVisual(file) {
        if (!file || fotoBusquedaEnCurso) return;

        const estado = document.getElementById("fotoBusquedaEstado");
        const resultados = document.getElementById("fotoBusquedaResultados");
        const preview = document.getElementById("fotoBusquedaPreview");
        fotoBusquedaEnCurso = true;

        if (estado) estado.textContent = "Analizando foto…";
        if (resultados) resultados.innerHTML = "";
        if (preview) {
            preview.hidden = false;
            preview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Foto de búsqueda">`;
        }

        try {
            const firmaObjetivo = await firmaDeArchivo(file);
            const candidatos = peluches.filter(p => obtenerFotos(p).length);
            const cache = cargarCacheVisual();
            const resultadosVisuales = [];
            let procesados = 0;

            // Primero usamos firmas guardadas: son prácticamente instantáneas.
            const pendientes = [];
            for (const p of candidatos) {
                const url = obtenerFotos(p)[0];
                if (cache[url]) {
                    resultadosVisuales.push({ p, score: distanciaVisual(firmaObjetivo, cache[url]) });
                } else {
                    pendientes.push({ p, url });
                }
            }

            resultadosVisuales.sort((a, b) => a.score - b.score);
            renderResultadosVisual(resultadosVisuales.slice(0, VISUAL_MAX_RESULTADOS));

            // Las fotos no cacheadas se procesan en pequeños grupos para que el teléfono
            // no se congele. Los resultados se actualizan progresivamente.
            const CONCURRENCIA = 6;
            for (let i = 0; i < pendientes.length; i += CONCURRENCIA) {
                const grupo = pendientes.slice(i, i + CONCURRENCIA);
                await Promise.all(grupo.map(async item => {
                    const firma = await firmaDeFotoUrl(item.url);
                    if (firma) resultadosVisuales.push({ p: item.p, score: distanciaVisual(firmaObjetivo, firma) });
                    procesados++;
                }));

                resultadosVisuales.sort((a, b) => a.score - b.score);
                renderResultadosVisual(resultadosVisuales.slice(0, VISUAL_MAX_RESULTADOS));
                if (estado) estado.textContent = `Buscando… ${Math.min(candidatos.length, candidatos.length - pendientes.length + procesados)} / ${candidatos.length}`;
                // Cede el hilo al navegador para mantener la interfaz fluida.
                await new Promise(r => setTimeout(r, 0));
            }

            resultadosVisuales.sort((a, b) => a.score - b.score);
            renderResultadosVisual(resultadosVisuales.slice(0, VISUAL_MAX_RESULTADOS));
            if (estado) estado.textContent = resultadosVisuales.length ? "Listo. Toca el peluche que buscas." : "No hay peluches con foto para comparar.";
            guardarCacheVisual();
        } catch (error) {
            console.error("Búsqueda visual:", error);
            if (estado) estado.textContent = "No se pudo analizar la foto. Prueba con otra imagen.";
        } finally {
            fotoBusquedaEnCurso = false;
        }
    }

    function abrirBuscadorFoto() {
        const modal = document.getElementById("fotoBusquedaModal");
        const input = document.getElementById("fotoBusquedaInput");
        const estado = document.getElementById("fotoBusquedaEstado");
        const resultados = document.getElementById("fotoBusquedaResultados");
        const preview = document.getElementById("fotoBusquedaPreview");
        modal?.classList.add("abierto");
        if (estado) estado.textContent = "Selecciona o toma una foto para buscar.";
        if (resultados) resultados.innerHTML = "";
        if (preview) { preview.hidden = true; preview.innerHTML = ""; }
        if (input) input.value = "";
    }

    document.getElementById("btnBuscarFoto")?.addEventListener("click", abrirBuscadorFoto);
    document.getElementById("cerrarFotoBusqueda")?.addEventListener("click", () => {
        if (!fotoBusquedaEnCurso) document.getElementById("fotoBusquedaModal")?.classList.remove("abierto");
    });
    document.getElementById("fotoBusquedaModal")?.addEventListener("click", e => {
        if (e.target.id === "fotoBusquedaModal" && !fotoBusquedaEnCurso) e.currentTarget.classList.remove("abierto");
    });
    document.getElementById("fotoBusquedaInput")?.addEventListener("change", e => {
        const file = e.target.files?.[0];
        if (file) ejecutarBusquedaVisual(file);
    });

    // Conecta la opción de búsqueda por foto al menú lateral.
    document.querySelectorAll('[data-menu-action="foto"]').forEach(btn => {
        btn.addEventListener("click", () => {
            abrirBuscadorFoto();
            cerrarMenu();
        });
    });
