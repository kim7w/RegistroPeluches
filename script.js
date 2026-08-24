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

let visorFotos = [];
let visorIndice = 0;

let scanner = null;
let scannerActivo = false;
let ultimoCodigoDetectado = "";
let repeticionesCodigoDetectado = 0;

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

// Convierte los errores de Firebase/Firestore en mensajes útiles
// para saber exactamente por qué no se pudo guardar.
function describirError(error) {
    const codigo = error?.code || "sin-codigo";
    const mensajeOriginal = error?.message || String(error) || "Error desconocido";

    const mensajes = {
        "permission-denied":
            "Firebase rechazó la escritura por permisos. Revisa las reglas de Firestore de la colección 'peluches'.",
        "unauthenticated":
            "Firebase requiere autenticación para guardar este producto.",
        "failed-precondition":
            "Firebase indica una condición previa pendiente. Revisa la configuración de Firestore.",
        "unavailable":
            "Firebase no está disponible en este momento. Comprueba tu conexión a Internet e inténtalo nuevamente.",
        "deadline-exceeded":
            "Firebase tardó demasiado en responder. Comprueba tu conexión e inténtalo nuevamente.",
        "network-request-failed":
            "Falló la conexión de red. Comprueba que tengas Internet.",
        "invalid-argument":
            "Firebase recibió datos no válidos. Revisa los campos del producto.",
        "not-found":
            "Firebase no encontró el documento que se intenta actualizar.",
        "already-exists":
            "El registro ya existe.",
        "resource-exhausted":
            "Se alcanzó un límite de Firebase. Inténtalo nuevamente más tarde."
    };

    const explicacion = mensajes[codigo] || mensajeOriginal;

    return `Código: ${codigo}\n${explicacion}\n\nDetalle técnico: ${mensajeOriginal}`;
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
    return peluches.filter(
        p => coincideFiltro(p) && coincideBusqueda(p, buscar?.value || "")
    );
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
        <article class="tarjeta">
            <div class="imagen-principal">
                ${imagen}
                <span class="badge-estado ${badgeClass}">${estado}</span>
                <span class="cantidad-badge">
                    📦 ${cantidad} ${cantidad === 1 ? "unidad" : "unidades"}
                </span>
            </div>

            ${miniaturas}

            <div class="info">
                <h3>${escaparHTML(p.nombre || "Sin nombre")}</h3>

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
            alert("Completa código, nombre y precio.");
            return;
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

        // El CÓDIGO/COSTO DE COMPRA puede repetirse entre productos.
        // La ETIQUETA es el código de barras y sí debe ser única.
        const existentePorEtiqueta = etiqueta
            ? peluches.find(
                p =>
                    normalizar(p.etiqueta) === normalizar(etiqueta) &&
                    p.id !== editando
            )
            : null;

        if (existentePorEtiqueta) {
            alert(
                "Ese código de barras (Etiqueta) ya está registrado. Usa otro código de barras."
            );
            return;
        }

        const datos = {
            codigo,
            nombre,
            precio,
            etiqueta,
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

        // Ya no mostramos un mensaje genérico: aquí se indica el error real.
        const detalle = describirError(error);
        alert(`❌ No se pudo guardar el producto.\n\n${detalle}`);

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

async function abrirScanner() {
    const modal = document.getElementById("scannerModal");
    const estado = document.getElementById("scannerEstado");

    modal?.classList.add("abierto");
    if (estado) estado.textContent = "Preparando cámara...";

    try {
        if (typeof Html5Qrcode === "undefined") {
            if (estado) {
                estado.textContent =
                    "No se pudo cargar el lector. Recarga la página e inténtalo de nuevo.";
            }
            return;
        }

        if (scannerActivo) return;

        /*
         * ACEPTAMOS LOS PRINCIPALES FORMATOS DE CÓDIGOS DE BARRAS.
         *
         * El lector estaba limitado únicamente a CODE 128. Eso hacía
         * que códigos EAN-13 como los de algunas etiquetas de peluches
         * no fueran detectados aunque la cámara los enfocara correctamente.
         *
         * Se incluyen los formatos 1D más habituales para inventario.
         * Se comprueba que cada formato exista para mantener compatibilidad
         * con distintas versiones de html5-qrcode.
         */
        const F = window.Html5QrcodeSupportedFormats;

        const formatosDisponibles = [
            F?.CODABAR,
            F?.CODE_39,
            F?.CODE_93,
            F?.CODE_128,
            F?.EAN_8,
            F?.EAN_13,
            F?.ITF,
            F?.RSS_14,
            F?.RSS_EXPANDED,
            F?.UPC_A,
            F?.UPC_E
        ].filter(formato => formato !== undefined);

        const formatos = formatosDisponibles.length > 0
            ? formatosDisponibles
            : undefined;

        const configuracionScanner = {
            fps: 20,
            qrbox: {
                width: Math.min(
                    560,
                    Math.max(300, Math.floor(window.innerWidth * 0.90))
                ),
                height: 280
            },
            aspectRatio: 1.7777778,
            disableFlip: false,
            videoConstraints: {
                facingMode: { ideal: "environment" },
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },

            /*
             * Si el navegador/teléfono dispone de BarcodeDetector,
             * Html5Qrcode puede utilizarlo. Si no está disponible,
             * continúa usando su lector interno.
             */
            experimentalFeatures: {
                useBarCodeDetectorIfSupported: true
            }
        };

        scanner = new Html5Qrcode("reader", {
            verbose: false,
            formatsToSupport: formatos
        });

        scannerActivo = true;

        const recibirCodigo = codigo => {
            procesarCodigoEscaneado(codigo);
        };

        try {
            await scanner.start(
                { facingMode: { exact: "environment" } },
                configuracionScanner,
                recibirCodigo,
                () => {}
            );
        } catch (errorCamaraExacta) {
            console.warn(
                "No se pudo iniciar con cámara exacta. Se intentará con la cámara trasera:",
                errorCamaraExacta
            );

            try {
                await scanner.stop();
            } catch (e) {}

            try {
                await scanner.clear();
            } catch (e) {}

            scanner = new Html5Qrcode("reader", {
                verbose: false,
                formatsToSupport: formatos
            });

            scannerActivo = true;

            await scanner.start(
                { facingMode: "environment" },
                configuracionScanner,
                recibirCodigo,
                () => {}
            );
        }

        if (estado) {
            estado.textContent =
                "Cámara activa. Coloca el código de barras completo dentro del recuadro.";
        }
    } catch (error) {
        console.error("Error abriendo cámara:", error);

        try {
            if (scanner) {
                try {
                    await scanner.stop();
                } catch (e) {}

                try {
                    await scanner.clear();
                } catch (e) {}
            }
        } catch (e) {}

        scannerActivo = false;
        scanner = null;

        if (estado) {
            estado.textContent =
                "No se pudo iniciar el lector. Revisa el permiso de cámara o usa la entrada manual.";
        }
    }
}

async function cerrarScanner() {
    const modal = document.getElementById("scannerModal");

    ultimoCodigoDetectado = "";
    repeticionesCodigoDetectado = 0;

    if (scanner && scannerActivo) {
        try { await scanner.stop(); } catch (e) {}
        try { await scanner.clear(); } catch (e) {}
    }

    scanner = null;
    scannerActivo = false;
    modal?.classList.remove("abierto");

    const codigoManual = document.getElementById("codigoManual");
    if (codigoManual) codigoManual.value = "";
}

function normalizarCodigoBarras(valor = "") {
    /*
     * Limpieza segura del resultado del lector.
     *
     * Algunos lectores pueden anteponer el identificador de
     * simbología de Code 128, por ejemplo ]C0 o ]C1.
     * Ese prefijo NO forma parte del código de la etiqueta.
     */
    let resultado = String(valor ?? "")
        .replace(/[\r\n\t]+/g, "")
        .trim();

    resultado = resultado.replace(/^\]C[01]/i, "");

    /*
     * Conservamos letras, números, guiones y demás caracteres
     * que realmente puedan formar parte del código.
     * No eliminamos el guion de XY-25013.
     */
    return resultado;
}

function procesarCodigoEscaneado(codigo) {
    const valor = normalizarCodigoBarras(codigo);

    if (!valor) return;

    /*
     * No aceptamos una lectura instantánea aislada.
     * Pedimos dos lecturas consecutivas iguales para reducir
     * falsos positivos de la cámara.
     */
    if (valor !== ultimoCodigoDetectado) {
        ultimoCodigoDetectado = valor;
        repeticionesCodigoDetectado = 1;

        const estado = document.getElementById("scannerEstado");
        if (estado) {
            estado.textContent =
                `Código detectado: ${valor}. Confirmando lectura...`;
        }

        return;
    }

    repeticionesCodigoDetectado++;

    if (repeticionesCodigoDetectado < 2) return;

    ultimoCodigoDetectado = "";
    repeticionesCodigoDetectado = 0;

    cerrarScanner();

    /*
     * El código leído se compara ÚNICAMENTE con Etiqueta,
     * porque Etiqueta es el código de barras físico.
     */
    const encontrado = peluches.find(
        p =>
            normalizarCodigoBarras(p.etiqueta) === valor
    );

    if (encontrado) {
        if (buscar) buscar.value = valor;
        filtroActivo = "todos";

        document.querySelectorAll(".filtro").forEach(boton => {
            boton.classList.toggle(
                "activo",
                boton.dataset.filtro === "todos"
            );
        });

        actualizarInterfazBusqueda();

        setTimeout(() => {
            document.querySelector(".tarjeta")?.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });
        }, 80);
    } else {
        cancelarEdicion();
        abrirFormulario();

        const etiquetaInput =
            document.getElementById("etiqueta");

        if (etiquetaInput) {
            etiquetaInput.value = valor;
        }

        document.getElementById("nombre")?.focus();

        alert(
            "Código de barras no registrado. Se colocó automáticamente en Etiqueta."
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

// Funciones utilizadas directamente desde el HTML.
window.editarPeluche =
    editarPeluche;

window.eliminarPeluche =
    eliminarPeluche;

window.abrirMovimiento =
    abrirMovimiento;

window.cambiarFotoTarjeta =
    cambiarFotoTarjeta;

window.abrirVisorPorId =
    abrirVisorPorId;

cargarPeluches();
