import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc
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
let movimientoId = null;
let movimientoTipo = "entrada";

const normalizar = (v = "") => String(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function escaparHTML(valor = "") {
    return String(valor).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
        .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function obtenerFotos(p) {
    const fotos = Array.isArray(p.fotos) ? p.fotos.filter(Boolean) : [];
    if (p.foto && !fotos.includes(p.foto)) fotos.unshift(p.foto);
    return [...new Set(fotos)];
}

function obtenerCantidad(p) {
    // Compatibilidad con la versión anterior: Local + Bodega = existencia actual.
    const local = Number(p.cantidadLocal ?? 0) || 0;
    const bodega = Number(p.cantidadBodega ?? 0) || 0;
    if (p.cantidad !== undefined && p.cantidad !== null && p.cantidadLocal === undefined && p.cantidadBodega === undefined) {
        return Math.max(0, Number(p.cantidad) || 0);
    }
    return Math.max(0, local + bodega);
}

function obtenerMinimo(p) {
    return Math.max(0, Number(p.minimo ?? MINIMO_DEFECTO) || 0);
}

function estadoPeluche(p) {
    const cantidad = obtenerCantidad(p);
    if (cantidad <= 0) return "Agotado";
    if (cantidad <= obtenerMinimo(p)) return "Poco inventario";
    return "Disponible";
}

function clasificarTamano(tamano = "") {
    const t = normalizar(tamano);
    const numeros = t.match(/\d+(?:[.,]\d+)?/g)?.map(Number) || [];
    if (t.includes("grande") || numeros.some(n => n >= 50)) return "grande";
    if (t.includes("mediano") || t.includes("mediana") || numeros.some(n => n >= 25 && n < 50)) return "mediano";
    if (t.includes("pequeno") || t.includes("pequena") || numeros.some(n => n < 25)) return "pequeno";
    return "";
}

function actualizarResumen() {
    const unidades = peluches.reduce((s,p) => s + obtenerCantidad(p), 0);
    const refs = {
        totalPeluche: peluches.length,
        totalUnidades: unidades,
        totalDisponibles: peluches.filter(p => obtenerCantidad(p) > 0).length,
        totalBajo: peluches.filter(p => estadoPeluche(p) === "Poco inventario").length,
        totalAgotados: peluches.filter(p => estadoPeluche(p) === "Agotado").length
    };
    Object.entries(refs).forEach(([id,value]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    });
}

function coincideFiltro(p) {
    if (filtroActivo === "todos") return true;
    if (filtroActivo === "disponible") return obtenerCantidad(p) > 0;
    if (filtroActivo === "bajo") return estadoPeluche(p) === "Poco inventario";
    if (filtroActivo === "agotado") return estadoPeluche(p) === "Agotado";
    return clasificarTamano(p.tamano) === filtroActivo;
}

function coincideBusqueda(p, texto) {
    if (!texto) return true;
    const campos = [p.codigo,p.nombre,p.precio,p.etiqueta,p.tamano,p.observaciones,obtenerCantidad(p),p.fechaIngreso];
    return normalizar(campos.join(" ")).includes(normalizar(texto));
}

function obtenerFiltrados() {
    return peluches.filter(p => coincideFiltro(p) && coincideBusqueda(p, buscar?.value || ""));
}

function actualizarInterfazBusqueda() {
    const texto = (buscar?.value || "").trim();
    limpiarBusqueda?.classList.toggle("visible", Boolean(texto));
    const resultado = obtenerFiltrados();
    if (contador) contador.textContent = texto || filtroActivo !== "todos"
        ? `${resultado.length} producto${resultado.length === 1 ? "" : "s"} encontrado${resultado.length === 1 ? "" : "s"}`
        : `Productos registrados: ${peluches.length}`;
    const nombres = {todos:"Mostrando todos",grande:"Filtro: grandes",mediano:"Filtro: medianos",pequeno:"Filtro: pequeños",
        disponible:"Filtro: disponibles",bajo:"Filtro: poco inventario",agotado:"Filtro: agotados"};
    const fa = document.getElementById("filtroActual");
    if (fa) fa.textContent = texto ? `Buscando: “${texto}”` : nombres[filtroActivo];
    mostrarPeluches(resultado);
}

function crearTarjeta(p) {
    const fotos = obtenerFotos(p);
    const principal = fotos[0] || "";
    const cantidad = obtenerCantidad(p);
    const estado = estadoPeluche(p);
    const agotado = estado === "Agotado";
    const bajo = estado === "Poco inventario";

    const miniaturas = fotos.length > 1 ? `<div class="miniaturas">${fotos.map((url,i)=>`
        <img src="${escaparHTML(url)}" alt="Foto ${i+1}" class="${i===0?"activa":""}" loading="lazy"
             onclick="cambiarFotoTarjeta(event,'${p.id}',${i})">`).join("")}</div>` : "";

    const imagen = principal ? `<img id="foto-${p.id}" src="${escaparHTML(principal)}" alt="${escaparHTML(p.nombre||"Peluche")}" loading="lazy"
        onclick="abrirVisorPorId('${p.id}',0)">` : `<div class="sin-foto">🧸</div>`;

    const badgeClass = agotado ? "agotado" : (bajo ? "bajo" : "");
    return `<article class="tarjeta">
        <div class="imagen-principal">
            ${imagen}
            <span class="badge-estado ${badgeClass}">${estado}</span>
            <span class="cantidad-badge">📦 ${cantidad} ${cantidad===1?"unidad":"unidades"}</span>
        </div>
        ${miniaturas}
        <div class="info">
            <h3>${escaparHTML(p.nombre || "Sin nombre")}</h3>
            <div class="etiquetas">
                ${p.etiqueta ? `<span class="etiqueta-chip">🏷️ ${escaparHTML(p.etiqueta)}</span>` : ""}
                ${p.tamano ? `<span class="etiqueta-chip">📏 ${escaparHTML(p.tamano)}</span>` : ""}
            </div>
            <div class="precio">Q${escaparHTML(p.precio ?? "0")}</div>
            <div class="datos">
                <div class="dato"><small>CÓDIGO</small><strong>${escaparHTML(p.codigo||"—")}</strong></div>
                <div class="dato ${bajo?"alerta":""}"><small>📦 EXISTENCIA</small><strong>${cantidad}</strong></div>
                <div class="dato"><small>⚠️ MÍNIMO</small><strong>${obtenerMinimo(p)}</strong></div>
                <div class="dato"><small>📏 MEDIDA</small><strong>${escaparHTML(p.tamano||"—")}</strong></div>
                <div class="dato"><small>📅 INGRESO</small><strong>${escaparHTML(p.fechaIngreso||"—")}</strong></div>
                <div class="dato"><small>📷 FOTOS</small><strong>${fotos.length}</strong></div>
            </div>
            ${p.observaciones ? `<p class="observaciones">💬 ${escaparHTML(p.observaciones)}</p>` : ""}
        </div>
        <div class="botones">
            <button class="btn-entrada" type="button" onclick="abrirMovimiento('${p.id}','entrada')">➕ Entrada</button>
            <button class="btn-salida" type="button" onclick="abrirMovimiento('${p.id}','salida')">➖ Salida</button>
            <button class="btn-editar" type="button" onclick="editarPeluche('${p.id}')">✏️ Editar</button>
            <button class="btn-eliminar" type="button" onclick="eliminarPeluche('${p.id}')">🗑️</button>
        </div>
    </article>`;
}

function mostrarPeluches(datos) {
    if (!lista) return;
    lista.innerHTML = datos.map(crearTarjeta).join("");
    if (sinResultados) sinResultados.style.display = datos.length ? "none" : "block";
}

async function cargarPeluches() {
    try {
        lista.innerHTML = `<div class="sin-resultados"><div>⏳</div><p>Cargando inventario...</p></div>`;
        const consulta = await getDocs(collection(db,"peluches"));
        peluches = [];
        consulta.forEach(d => peluches.push({id:d.id,...d.data()}));
        actualizarResumen();
        actualizarInterfazBusqueda();
    } catch(error) {
        console.error(error);
        lista.innerHTML = `<div class="sin-resultados"><div>⚠️</div><h3>No se pudo cargar el inventario</h3><p>Revisa tu conexión e inténtalo de nuevo.</p></div>`;
    }
}

async function comprimirImagen(archivo,maxSize=1600,calidad=.80) {
    if (archivo.type==="image/gif" || archivo.type==="image/svg+xml") return archivo;
    return new Promise(resolve=>{
        const imagen=new Image(), url=URL.createObjectURL(archivo);
        imagen.onload=()=>{
            URL.revokeObjectURL(url);
            let ancho=imagen.naturalWidth, alto=imagen.naturalHeight;
            if(ancho>maxSize || alto>maxSize){const escala=Math.min(maxSize/ancho,maxSize/alto);ancho=Math.round(ancho*escala);alto=Math.round(alto*escala)}
            const canvas=document.createElement("canvas");canvas.width=ancho;canvas.height=alto;
            const ctx=canvas.getContext("2d");if(!ctx){resolve(archivo);return}
            ctx.drawImage(imagen,0,0,ancho,alto);
            canvas.toBlob(blob=>{
                resolve(blob?new File([blob],archivo.name.replace(/\.[^/.]+$/,"")+".webp",{type:"image/webp",lastModified:Date.now()}):archivo);
            },"image/webp",calidad);
        };
        imagen.onerror=()=>{URL.revokeObjectURL(url);resolve(archivo)}; imagen.src=url;
    });
}

async function subirImagenCloudinary(archivo) {
    if(!archivo) return "";
    const optimizado=await comprimirImagen(archivo);
    const datos=new FormData();datos.append("file",optimizado);datos.append("upload_preset",CLOUDINARY_PRESET);
    const respuesta=await fetch(CLOUDINARY_UPLOAD,{method:"POST",body:datos});
    if(!respuesta.ok) throw new Error("No se pudo subir una imagen.");
    const resultado=await respuesta.json();
    return resultado.secure_url || "";
}

if(foto) foto.addEventListener("change",()=>{
    galeriaPrevia.innerHTML="";
    [...foto.files].forEach(file=>{
        if(!file.type.startsWith("image/")) return;
        const url=URL.createObjectURL(file);const img=document.createElement("img");img.src=url;img.alt="Vista previa";
        img.onload=()=>URL.revokeObjectURL(url);galeriaPrevia.appendChild(img);
    });
});

function abrirFormulario() {
    formulario.hidden=false;
    formularioPanel?.classList.remove("colapsado");
    toggleFormulario?.setAttribute("aria-expanded","true");
    if(flechaFormulario) flechaFormulario.textContent="⌃";
    formulario.scrollIntoView({behavior:"smooth",block:"start"});
}

function cerrarFormulario() {
    formulario.hidden=true;
    formularioPanel?.classList.add("colapsado");
    toggleFormulario?.setAttribute("aria-expanded","false");
    if(flechaFormulario) flechaFormulario.textContent="⌄";
}

toggleFormulario?.addEventListener("click",()=>{
    if(formulario.hidden) abrirFormulario(); else cerrarFormulario();
});

document.getElementById("btnNuevo")?.addEventListener("click",()=>{
    cancelarEdicion();
    abrirFormulario();
    document.getElementById("codigo")?.focus();
});

async function guardarFormulario(e) {
    e.preventDefault();
    const original=btnGuardar.textContent;
    btnGuardar.disabled=true;btnGuardar.textContent="⏳ Guardando...";

    try {
        const codigo=document.getElementById("codigo").value.trim();
        const nombre=document.getElementById("nombre").value.trim();
        const precio=document.getElementById("precio").value;
        const etiqueta=document.getElementById("etiqueta").value.trim();
        const tamano=document.getElementById("medida").value.trim();
        const cantidad=Math.max(0,Number(document.getElementById("cantidad").value)||0);
        const minimo=Math.max(0,Number(document.getElementById("minimo").value)||0);
        const observaciones=document.getElementById("observaciones").value.trim();
        const fechaIngreso=document.getElementById("fechaIngreso").value || "";
        let fotos=[];

        if(foto?.files?.length) fotos=(await Promise.all([...foto.files].map(subirImagenCloudinary))).filter(Boolean);
        else if(editando){const existente=peluches.find(p=>p.id===editando);fotos=existente?obtenerFotos(existente):[]}

        const existentePorCodigo=peluches.find(p=>normalizar(p.codigo)===normalizar(codigo) && p.id!==editando);
        if(existentePorCodigo){
            alert("Ese código ya está registrado. Busca el producto existente o usa otro código.");
            btnGuardar.disabled=false;btnGuardar.textContent=original;return;
        }

        const datos={
            codigo,nombre,precio,etiqueta,tamano,cantidad,minimo,observaciones,
            foto:fotos[0]||"",fotos,fechaIngreso,
            estado: cantidad<=0 ? "Agotado" : (cantidad<=minimo ? "Poco inventario" : "Disponible"),
            // Normalización de registros antiguos: ya no se usa Local/Bodega.
            cantidadLocal:cantidad,cantidadBodega:0
        };

        if(editando){
            await updateDoc(doc(db,"peluches",editando),datos);
            const i=peluches.findIndex(p=>p.id===editando);
            if(i!==-1) peluches[i]={id:editando,...datos};
        } else {
            const nuevo=await addDoc(collection(db,"peluches"),datos);
            peluches.unshift({id:nuevo.id,...datos});
        }

        actualizarResumen();actualizarInterfazBusqueda();
        cancelarEdicion();
        cerrarFormulario();
        window.scrollTo({top:0,behavior:"smooth"});
    } catch(error) {
        console.error(error);
        alert("No se pudo guardar el producto. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
        btnGuardar.disabled=false;
        if(!editando) btnGuardar.textContent="💾 Guardar producto"; else btnGuardar.textContent=original;
    }
}
formulario?.addEventListener("submit",guardarFormulario);

function editarPeluche(id) {
    const p=peluches.find(x=>x.id===id);
    if(!p){alert("No se encontró el producto.");return}
    document.getElementById("codigo").value=p.codigo||"";
    document.getElementById("nombre").value=p.nombre||"";
    document.getElementById("precio").value=p.precio??"";
    document.getElementById("etiqueta").value=p.etiqueta||"";
    document.getElementById("medida").value=p.tamano||"";
    document.getElementById("cantidad").value=obtenerCantidad(p);
    document.getElementById("minimo").value=obtenerMinimo(p);
    document.getElementById("observaciones").value=p.observaciones||"";
    document.getElementById("fechaIngreso").value=p.fechaIngreso||"";
    galeriaPrevia.innerHTML=obtenerFotos(p).map(url=>`<img src="${escaparHTML(url)}" alt="Foto guardada">`).join("");
    editando=id;btnGuardar.textContent="💾 Actualizar producto";btnCancelar.style.display="block";abrirFormulario();
}

function cancelarEdicion() {
    formulario?.reset();galeriaPrevia.innerHTML="";editando=null;btnGuardar.textContent="💾 Guardar producto";btnCancelar.style.display="none";
    const minimo=document.getElementById("minimo");if(minimo) minimo.value=MINIMO_DEFECTO;
}
btnCancelar?.addEventListener("click",()=>{cancelarEdicion();cerrarFormulario()});

async function eliminarPeluche(id) {
    if(!confirm("¿Deseas eliminar este producto? Esta acción no se puede deshacer.")) return;
    try{
        await deleteDoc(doc(db,"peluches",id));
        peluches=peluches.filter(p=>p.id!==id);
        actualizarResumen();actualizarInterfazBusqueda();
    }catch(error){console.error(error);alert("No se pudo eliminar el producto.")}
}

async function actualizarCantidad(id,nuevaCantidad,tipo,cantidadMovimiento) {
    const p=peluches.find(x=>x.id===id);if(!p)return;
    const nueva=Math.max(0,nuevaCantidad);
    const movimiento={
        tipo,cantidad:Number(cantidadMovimiento),antes:obtenerCantidad(p),despues:nueva,
        fecha:new Date().toISOString()
    };
    const historial=Array.isArray(p.movimientos)?[...p.movimientos,movimiento]:[movimiento];
    await updateDoc(doc(db,"peluches",id),{
        cantidad:nueva,cantidadLocal:nueva,cantidadBodega:0,
        estado:nueva<=0?"Agotado":(nueva<=obtenerMinimo(p)?"Poco inventario":"Disponible"),
        ultimoMovimiento:movimiento,
        movimientos:historial.slice(-50)
    });
    p.cantidad=nueva;p.cantidadLocal=nueva;p.cantidadBodega=0;p.estado=movimiento.despues<=0?"Agotado":(nueva<=obtenerMinimo(p)?"Poco inventario":"Disponible");
    p.ultimoMovimiento=movimiento;p.movimientos=historial.slice(-50);
    actualizarResumen();actualizarInterfazBusqueda();
}

function abrirMovimiento(id,tipo) {
    const p=peluches.find(x=>x.id===id);if(!p)return;
    movimientoId=id;movimientoTipo=tipo;
    document.getElementById("movimientoTitulo").textContent=tipo==="entrada"?"➕ Registrar entrada":"➖ Registrar salida";
    document.getElementById("movimientoProducto").textContent=p.nombre||"Producto";
    document.getElementById("movimientoActual").textContent=obtenerCantidad(p);
    document.getElementById("movimientoCantidad").value=1;
    document.getElementById("movimientoModal").classList.add("abierto");
    setTimeout(()=>document.getElementById("movimientoCantidad")?.focus(),100);
}

function cerrarMovimiento(){document.getElementById("movimientoModal")?.classList.remove("abierto");movimientoId=null}
document.getElementById("cerrarMovimiento")?.addEventListener("click",cerrarMovimiento);
document.getElementById("btnCancelarMovimiento")?.addEventListener("click",cerrarMovimiento);

document.getElementById("btnConfirmarMovimiento")?.addEventListener("click",async()=>{
    if(!movimientoId)return;
    const p=peluches.find(x=>x.id===movimientoId);if(!p)return;
    const cantidad=Number(document.getElementById("movimientoCantidad").value);
    if(!Number.isInteger(cantidad)||cantidad<=0){alert("Ingresa una cantidad entera mayor que 0.");return}
    const actual=obtenerCantidad(p);
    if(movimientoTipo==="salida" && cantidad>actual){alert(`No puedes sacar ${cantidad}. Solo hay ${actual} disponibles.`);return}
    const nueva=movimientoTipo==="entrada"?actual+cantidad:actual-cantidad;
    const boton=document.getElementById("btnConfirmarMovimiento");boton.disabled=true;boton.textContent="Guardando...";
    try{await actualizarCantidad(movimientoId,nueva,movimientoTipo,cantidad);cerrarMovimiento()}
    catch(error){console.error(error);alert("No se pudo registrar el movimiento. Revisa tu conexión.")}
    finally{boton.disabled=false;boton.textContent="Confirmar"}
});

document.getElementById("scannerModal")?.addEventListener("click",e=>{if(e.target.id==="scannerModal")cerrarScanner()});

async function abrirScanner() {
    const modal=document.getElementById("scannerModal");modal.classList.add("abierto");
    const estado=document.getElementById("scannerEstado");estado.textContent="Preparando cámara...";
    try{
        if(typeof Html5Qrcode==="undefined"){estado.textContent="No se pudo cargar el lector. También puedes escribir el código abajo.";return}
        if(scannerActivo) return;
        scanner=new Html5Qrcode("reader");
        scannerActivo=true;
        await scanner.start({facingMode:"environment"},{fps:10,qrbox:{width:280,height:130}},
            codigo=>procesarCodigoEscaneado(codigo),
            ()=>{});
        estado.textContent="Cámara activa. Apunta al código de barras.";
    }catch(error){
        console.error(error);estado.textContent="No se pudo abrir la cámara. Revisa el permiso del navegador o escribe el código.";
        scannerActivo=false;scanner=null;
    }
}

async function cerrarScanner() {
    const modal=document.getElementById("scannerModal");
    if(scanner && scannerActivo){try{await scanner.stop();}catch(e){}try{await scanner.clear();}catch(e){}}
    scanner=null;scannerActivo=false;modal.classList.remove("abierto");
    document.getElementById("codigoManual").value="";
}

function procesarCodigoEscaneado(codigo) {
    const valor=String(codigo).trim();if(!valor)return;
    cerrarScanner();
    const encontrado=peluches.find(p=>normalizar(p.codigo)===normalizar(valor));
    if(encontrado){
        buscar.value=valor;filtroActivo="todos";
        document.querySelectorAll(".filtro").forEach(b=>b.classList.toggle("activo",b.dataset.filtro==="todos"));
        actualizarInterfazBusqueda();
        setTimeout(()=>document.querySelector(".tarjeta")?.scrollIntoView({behavior:"smooth",block:"center"}),80);
    }else{
        cancelarEdicion();abrirFormulario();document.getElementById("codigo").value=valor;
        document.getElementById("nombre")?.focus();
        alert("Código no registrado. Completa los datos para crear el producto.");
    }
}

document.getElementById("btnEscanear")?.addEventListener("click",abrirScanner);
document.getElementById("btnEscanearFormulario")?.addEventListener("click",abrirScanner);
document.getElementById("cerrarScanner")?.addEventListener("click",cerrarScanner);
document.getElementById("btnCodigoManual")?.addEventListener("click",()=>procesarCodigoEscaneado(document.getElementById("codigoManual").value));
document.getElementById("codigoManual")?.addEventListener("keydown",e=>{if(e.key==="Enter")procesarCodigoEscaneado(e.target.value)});

buscar?.addEventListener("input",actualizarInterfazBusqueda);
limpiarBusqueda?.addEventListener("click",()=>{buscar.value="";buscar.focus();actualizarInterfazBusqueda()});

document.querySelectorAll(".filtro").forEach(boton=>boton.addEventListener("click",()=>{
    filtroActivo=boton.dataset.filtro;
    document.querySelectorAll(".filtro").forEach(b=>b.classList.remove("activo"));
    boton.classList.add("activo");actualizarInterfazBusqueda();
}));

function cambiarFotoTarjeta(evento,id,indice){
    evento.stopPropagation();const p=peluches.find(x=>x.id===id);if(!p)return;
    const fotos=obtenerFotos(p),img=document.getElementById(`foto-${id}`);
    if(img&&fotos[indice]){img.src=fotos[indice];img.onclick=()=>abrirVisorPorId(id,indice)}
    img?.closest(".tarjeta")?.querySelectorAll(".miniaturas img").forEach((m,i)=>m.classList.toggle("activa",i===indice));
}

function abrirVisorPorId(id,indice=0){
    const p=peluches.find(x=>x.id===id);if(!p)return;
    visorFotos=obtenerFotos(p);visorIndice=Math.max(0,Math.min(indice,visorFotos.length-1));actualizarVisor();
    document.getElementById("visorImagen")?.classList.add("abierto");
}
function actualizarVisor(){
    document.getElementById("imagenGrande").src=visorFotos[visorIndice]||"";
    document.getElementById("contadorImagenes").textContent=visorFotos.length>1?`${visorIndice+1} / ${visorFotos.length}`:"";
}
function cambiarVisor(direccion){
    if(visorFotos.length<2)return;
    visorIndice=(visorIndice+direccion+visorFotos.length)%visorFotos.length;actualizarVisor();
}
function cerrarVisor(){document.getElementById("visorImagen")?.classList.remove("abierto")}
document.getElementById("imagenAnterior")?.addEventListener("click",e=>{e.stopPropagation();cambiarVisor(-1)});
document.getElementById("imagenSiguiente")?.addEventListener("click",e=>{e.stopPropagation();cambiarVisor(1)});
document.getElementById("cerrarVisor")?.addEventListener("click",cerrarVisor);
document.getElementById("visorImagen")?.addEventListener("click",e=>{if(e.target.id==="visorImagen")cerrarVisor()});
document.addEventListener("keydown",e=>{
    if(e.key==="Escape"){cerrarVisor();cerrarScanner();cerrarMovimiento()}
    if(document.getElementById("visorImagen")?.classList.contains("abierto")){
        if(e.key==="ArrowLeft")cambiarVisor(-1);if(e.key==="ArrowRight")cambiarVisor(1)
    }
});

window.editarPeluche=editarPeluche;
window.eliminarPeluche=eliminarPeluche;
window.abrirMovimiento=abrirMovimiento;
window.cambiarFotoTarjeta=cambiarFotoTarjeta;
window.abrirVisorPorId=abrirVisorPorId;

cargarPeluches();
