// ===== LIMPIEZA DE VERSIONES ANTERIORES =====
// Si GitHub/Chrome conserva el HTML viejo encima de la aplicación nueva,
// se elimina antes de buscar IDs. Esto evita IDs duplicados y botones que no responden.
const APP_ROOT = document.querySelector(".contenedor");
if (APP_ROOT) {
    const hijos = [...document.body.children];
    for (const hijo of hijos) {
        if (hijo !== APP_ROOT && !hijo.matches("script")) {
            hijo.remove();
        }
    }
}

// Firebase se carga de forma dinámica para que, si el CDN tarda o falla,
// la interfaz y sus botones sigan funcionando y podamos mostrar el error real.
let initializeApp = null;
let getFirestore = null;
let collection = null;
let addDoc = null;
let getDocs = null;
let deleteDoc = null;
let doc = null;
let updateDoc = null;
let db = null;
let firebaseListo = false;
let firebaseCargando = null;

const firebaseConfig = {
    apiKey: "AIzaSyCZIgfuXyL6_AZxPjbir7j7LIDxi3k5Xo",
    authDomain: "registropeluches.firebaseapp.com",
    projectId: "registropeluches",
    storageBucket: "registropeluches.firebasestorage.app",
    messagingSenderId: "1090804367320",
    appId: "1:1090804367320:web:15462d9a4dbb4c1f987cad",
    measurementId: "G-VZ537J3Q3E"
};

async function iniciarFirebase() {
    if (firebaseListo) return true;
    if (firebaseCargando) return firebaseCargando;

    firebaseCargando = (async () => {
        try {
            const appMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
            const fsMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

            initializeApp = appMod.initializeApp;
            getFirestore = fsMod.getFirestore;
            collection = fsMod.collection;
            addDoc = fsMod.addDoc;
            getDocs = fsMod.getDocs;
            deleteDoc = fsMod.deleteDoc;
            doc = fsMod.doc;
            updateDoc = fsMod.updateDoc;

            const app = initializeApp(firebaseConfig);
            db = getFirestore(app);
            firebaseListo = true;
            return true;
        } catch (error) {
            console.error("Firebase no pudo iniciarse:", error);
            firebaseListo = false;
            throw error;
        } finally {
            firebaseCargando = null;
        }
    })();

    return firebaseCargando;
}

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

    if (filtroActivo === "disponible") {
        return obtenerCantidad(p) > 0;
    }

    if (filtroActivo === "bajo") {
        return estadoPeluche(p) === "Poco inventario";
    }

    if (filtroActivo === "agotado") {
        return estadoPeluche(p) === "Agotado";
    }

    if (filtroActivo === "local") return obtenerCantidadLocal(p) > 0;
    if (filtroActivo === "bodega") return obtenerCantidadBodega(p) > 0;

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
        agotado: "Filtro: agotados"
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

function mostrarPeluchesInicio(datos) {
    const contenedor = document.getElementById("listaInicio");
    const seccion = document.getElementById("inicioPeluches");
    if (!contenedor || !seccion) return;

    const destacados = datos.slice(0, 4);
    contenedor.innerHTML = destacados.map(crearTarjeta).join("");
    seccion.hidden = !destacados.length;
}

async function cargarPeluches() {
    try {
        await iniciarFirebase();

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
        // No mostrar peluches automáticamente en Inicio; solo aparecen al entrar a Ver peluches.

    } catch (error) {
        console.error("Error cargando inventario:", error);

        mostrarErrorFirebase(error);
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
    if (campo.value.trim()) {
        const reemplazar = confirm("Ya hay un código en Etiqueta / código de barras. ¿Quieres reemplazarlo por un código SIN nuevo?");
        if (!reemplazar) return;
    }
    const boton = document.getElementById("btnSinCodigo");
    const textoOriginal = boton?.textContent || "➕ Sin código";
    try {
        if (boton) { boton.disabled = true; boton.textContent = "⏳ Generando..."; }
        const codigoNuevo = await generarCodigoBarrasSinEtiqueta();
        campo.value = codigoNuevo;
        campo.dataset.generado = "true";
        campo.dispatchEvent(new Event("input", {bubbles:true}));
        campo.focus();
        campo.select();
    } catch (error) {
        console.error("Error generando código SIN:", error);
        alert("No se pudo generar el código. Inténtalo nuevamente.");
    } finally {
        if (boton) { boton.disabled = false; boton.textContent = textoOriginal; }
    }
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

document.getElementById("btnSinCodigo")?.addEventListener("click", asignarCodigoBarrasSinEtiqueta);

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
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
            e.preventDefault();
            abrirMenu?.();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r") {
            e.preventDefault();
            alternarModoRapido();
            return;
        }
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


function activarFiltroDirecto(filtro) {
    filtroActivo = filtro;
    document.querySelectorAll(".filtro").forEach(x => x.classList.toggle("activo", x.dataset.filtro === filtro));
    actualizarInterfazBusqueda();
}

document.getElementById("btnFiltroLocal")?.addEventListener("click", () => activarFiltroDirecto("local"));
document.getElementById("btnFiltroBodega")?.addEventListener("click", () => activarFiltroDirecto("bodega"));
document.getElementById("btnLimpiarFiltros")?.addEventListener("click", () => {
    filtroActivo = "todos";
    if (buscar) buscar.value = "";
    document.querySelectorAll(".filtro").forEach(x => x.classList.toggle("activo", x.dataset.filtro === "todos"));
    actualizarInterfazBusqueda();
});

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




// Si Firebase tarda, no bloqueamos la interfaz. Los botones siguen respondiendo.
function mostrarErrorFirebase(error) {
    const listaLocal = document.getElementById("lista");
    if (!listaLocal) return;
    const mensaje = error?.message || "No se pudo conectar con Firebase.";
    listaLocal.innerHTML = `
        <div class="sin-resultados">
            <div>⚠️</div>
            <h3>No se pudo cargar el inventario</h3>
            <p>La aplicación sí abrió, pero no pudo conectar con la base de datos.</p>
            <button type="button" id="btnReintentarFirebase" class="accion-secundaria">🔄 Reintentar</button>
        </div>`;
    document.getElementById("btnReintentarFirebase")?.addEventListener("click", () => cargarPeluches());
    console.error("Detalle Firebase:", mensaje);
}

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


// ==================== BÚSQUEDA VISUAL POR FOTO ====================
// Versión rápida: el modelo visual se carga SOLO cuando se usa esta función,
// las imágenes se reducen y se analizan por lotes. Los vectores quedan en
// memoria para que las búsquedas siguientes sean mucho más rápidas.
let modeloVisual = null;
let fotoBusquedaEnCurso = false;
const cacheVisual = new Map();
const TAMANO_VISUAL = 224;
const LOTE_VISUAL = 12;

function cargarScriptExterno(src, id) {
    return new Promise((resolve, reject) => {
        if (id && document.getElementById(id)) {
            const existente = document.getElementById(id);
            if (existente.dataset.cargado === "true") return resolve();
            existente.addEventListener("load", () => resolve(), {once:true});
            existente.addEventListener("error", () => reject(new Error(`No se pudo cargar ${src}`)), {once:true});
            return;
        }
        const script = document.createElement("script");
        if (id) script.id = id;
        script.src = src;
        script.async = true;
        script.onload = () => { script.dataset.cargado = "true"; resolve(); };
        script.onerror = () => reject(new Error(`No se pudo cargar el módulo visual.`));
        document.head.appendChild(script);
    });
}

function cerrarBuscadorFoto() {
    document.getElementById("buscarFotoModal")?.classList.remove("abierto");
    const input = document.getElementById("archivoBuscarFoto");
    if (input) input.value = "";
    const preview = document.getElementById("fotoBusquedaPreview");
    if (preview) preview.removeAttribute("src");
    document.getElementById("fotoBusquedaVista")?.setAttribute("hidden", "");
    const resultados = document.getElementById("fotoBusquedaResultados");
    if (resultados) resultados.innerHTML = "";
}

async function cargarModeloVisual() {
    if (modeloVisual) return modeloVisual;

    const estado = document.getElementById("fotoBusquedaEstado");
    if (estado) estado.textContent = "⏳ Preparando búsqueda visual (solo la primera vez)...";

    if (!window.tf) {
        await cargarScriptExterno("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js", "tfjsVisual");
    }
    if (!window.mobilenet) {
        await cargarScriptExterno("https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js", "mobilenetVisual");
    }

    modeloVisual = await window.mobilenet.load({version:2, alpha:0.5});
    return modeloVisual;
}

function vectorNorm(v) {
    let suma = 0;
    for (const x of v) suma += x * x;
    return Math.sqrt(suma) || 1;
}

function similitudCoseno(a, b) {
    let producto = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) producto += a[i] * b[i];
    return producto / (vectorNorm(a) * vectorNorm(b));
}

function imagenDesdeUrl(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.decoding = "async";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("No se pudo cargar una foto."));
        img.src = url;
    });
}

function lienzoVisual(img) {
    const canvas = document.createElement("canvas");
    canvas.width = TAMANO_VISUAL;
    canvas.height = TAMANO_VISUAL;
    const ctx = canvas.getContext("2d", {willReadFrequently:false});
    if (!ctx) throw new Error("No se pudo preparar la imagen.");

    const lado = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height) || 1;
    const sx = Math.max(0, ((img.naturalWidth || img.width) - lado) / 2);
    const sy = Math.max(0, ((img.naturalHeight || img.height) - lado) / 2);
    ctx.drawImage(img, sx, sy, lado, lado, 0, 0, TAMANO_VISUAL, TAMANO_VISUAL);
    return canvas;
}

async function obtenerVectorVisual(img, modelo) {
    const canvas = lienzoVisual(img);
    const tensor = window.tf.browser.fromPixels(canvas);
    const resultado = await window.tf.tidy(() => {
        const embedding = modelo.infer(tensor, true);
        return Array.from(embedding.dataSync());
    });
    tensor.dispose();
    return resultado;
}

async function obtenerVectoresVisualLote(items, modelo) {
    const tensors = items.map(item => window.tf.browser.fromPixels(lienzoVisual(item.img)));
    const lote = window.tf.stack(tensors);
    tensors.forEach(t => t.dispose());

    const resultado = await window.tf.tidy(() => {
        const embedding = modelo.infer(lote, true);
        return Array.from(embedding.arraySync());
    });

    lote.dispose();
    return resultado;
}

async function obtenerVectorCacheado(p, modelo) {
    const url = obtenerFotos(p)[0] || "";
    if (!url) return null;
    if (cacheVisual.has(url)) return cacheVisual.get(url);

    const img = await imagenDesdeUrl(url);
    const vector = await obtenerVectorVisual(img, modelo);
    cacheVisual.set(url, vector);
    return vector;
}

async function abrirBuscadorFoto() {
    cerrarMenu();
    document.getElementById("buscarFotoModal")?.classList.add("abierto");
    const estado = document.getElementById("fotoBusquedaEstado");
    if (estado) estado.textContent = "Listo. Toma una foto o elige una imagen.";
}

async function procesarBusquedaFoto(file) {
    if (!file || fotoBusquedaEnCurso) return;
    fotoBusquedaEnCurso = true;

    const estado = document.getElementById("fotoBusquedaEstado");
    const resultadosEl = document.getElementById("fotoBusquedaResultados");
    const vista = document.getElementById("fotoBusquedaVista");
    const preview = document.getElementById("fotoBusquedaPreview");

    try {
        if (estado) estado.textContent = "⏳ Preparando la foto...";
        if (resultadosEl) resultadosEl.innerHTML = "";

        const objectUrl = URL.createObjectURL(file);
        if (preview) {
            preview.src = objectUrl;
            vista?.removeAttribute("hidden");
        }

        const imgConsulta = await imagenDesdeUrl(objectUrl);
        const modelo = await cargarModeloVisual();
        if (estado) estado.textContent = "🔎 Buscando entre tus peluches...";

        const consulta = await obtenerVectorVisual(imgConsulta, modelo);
        const candidatos = [];
        const pendientes = [];

        // Solo usamos la foto principal para la primera pasada: esto evita
        // analizar 3-4 fotos por cada producto y hace la búsqueda mucho más rápida.
        for (const p of peluches) {
            const url = obtenerFotos(p)[0] || "";
            if (!url) continue;

            if (cacheVisual.has(url)) {
                candidatos.push({p, score:similitudCoseno(consulta, cacheVisual.get(url))});
            } else {
                pendientes.push({p, url});
            }
        }

        // Procesamiento por lotes para no ejecutar MobileNet una vez por foto.
        for (let i = 0; i < pendientes.length; i += LOTE_VISUAL) {
            const loteDatos = pendientes.slice(i, i + LOTE_VISUAL);
            const cargadas = [];

            await Promise.all(loteDatos.map(async item => {
                try {
                    cargadas.push({p:item.p, url:item.url, img:await imagenDesdeUrl(item.url)});
                } catch (e) {
                    console.warn("No se pudo cargar foto visual:", e);
                }
            }));

            if (!cargadas.length) continue;

            const vectores = await obtenerVectoresVisualLote(cargadas, modelo);
            vectores.forEach((vector, indice) => {
                const item = cargadas[indice];
                cacheVisual.set(item.url, vector);
                candidatos.push({p:item.p, score:similitudCoseno(consulta, vector)});
            });

            if (estado) {
                const procesadas = Math.min(i + LOTE_VISUAL, pendientes.length);
                estado.textContent = `🔎 Buscando... ${procesadas}/${pendientes.length} fotos`;
            }
        }

        URL.revokeObjectURL(objectUrl);

        candidatos.sort((a,b) => b.score - a.score);
        const top = candidatos.slice(0,5);

        if (!top.length) {
            if (estado) estado.textContent = "No hay peluches con fotos para comparar.";
            return;
        }

        if (estado) estado.textContent = `✨ Encontré ${top.length} coincidencia${top.length === 1 ? "" : "s"}.`;

        resultadosEl.innerHTML = top.map(({p,score}) => {
            const foto = obtenerFotos(p)[0] || "";
            const porcentaje = Math.max(0, Math.min(100, Math.round(score * 100)));
            return `
                <button type="button" class="resultado-foto" data-foto-id="${escaparHTML(p.id)}">
                    <img src="${escaparHTML(foto)}" alt="" loading="lazy">
                    <span class="resultado-foto-info">
                        <strong>${escaparHTML(p.nombre || "Peluche sin nombre")}</strong>
                        <small>${escaparHTML(p.codigo || p.codigoInterno || "Sin código interno")}</small>
                        <b>${porcentaje}% de similitud</b>
                    </span>
                </button>`;
        }).join("");

        resultadosEl.querySelectorAll("[data-foto-id]").forEach(btn => {
            btn.addEventListener("click", () => {
                const id = btn.dataset.fotoId;
                cerrarBuscadorFoto();
                abrirDetalle(id);
            });
        });
    } catch (error) {
        console.error("Búsqueda visual:", error);
        if (estado) estado.textContent = "❌ No pude realizar la búsqueda visual. Puedes seguir usando el código de barras.";
    } finally {
        fotoBusquedaEnCurso = false;
    }
}

document.getElementById("btnBuscarFoto")?.addEventListener("click", abrirBuscadorFoto);
document.getElementById("btnVerTodosInicio")?.addEventListener("click", () => {
    document.getElementById("seccionPeluches")?.scrollIntoView({behavior:"smooth", block:"start"});
});

document.getElementById("btnTomarFoto")?.addEventListener("click", () => {
    const input = document.getElementById("archivoBuscarFoto");
    if (input) {
        input.setAttribute("capture", "environment");
        input.click();
    }
});
document.getElementById("btnElegirFoto")?.addEventListener("click", () => {
    const input = document.getElementById("archivoBuscarFoto");
    if (input) {
        input.removeAttribute("capture");
        input.click();
    }
});
document.getElementById("archivoBuscarFoto")?.addEventListener("change", e => {
    procesarBusquedaFoto(e.target.files?.[0]);
});
document.getElementById("cerrarBuscarFoto")?.addEventListener("click", cerrarBuscadorFoto);
document.getElementById("buscarFotoModal")?.addEventListener("click", e => {
    if (e.target.id === "buscarFotoModal") cerrarBuscadorFoto();
});

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
        else if (accion === "buscarFoto") { abrirBuscadorFoto(); }
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
    // No mostrar peluches automáticamente en Inicio; solo aparecen al entrar a Ver peluches.
};

window.movimientoRapido = movimientoRapido;
window.abrirHistorialProducto = abrirHistorialProducto;

actualizarEstadoMenu();
actualizarSeleccionUI();


// Arranque final: todos los botones y menús ya están preparados antes de consultar Firestore.
modoSeleccion = false;
actualizarSeleccionUI();
cargarPeluches();
