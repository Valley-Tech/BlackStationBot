#!/usr/bin/env node
/**
 * MerkCentro24 · aplica la búsqueda de productos del CRM en el bot.
 *
 * Uso (desde la raíz del repo BlackStationBot):
 *   node scripts/aplicar-busqueda-productos.mjs
 *
 * Qué hace (deja copia .bak de cada archivo que toca):
 *  - src/services/messageHandler.js: reemplaza COMPLETOS los métodos
 *      handleAssistant · handleAssistantFlow · handleProductSelection · procesarRespuestaAsistente
 *    por la versión que usa /api/v1/bot/ai/products/search (IDs reales del catálogo),
 *    agrega el import de productSearchFlow y acepta las filas "prod:<id>" de la lista.
 *  - src/services/whatsappService.js: sendSingleProduct valida el id antes de llamar a Meta
 *    (nunca más se manda un texto de la IA como product_retailer_id).
 *
 * Es idempotente: si ya está aplicado, no cambia nada.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const MH = path.join(root, 'src/services/messageHandler.js');
const WS = path.join(root, 'src/services/whatsappService.js');

// ---------------------------------------------------------------------------
//  Localizar un método de clase por nombre (respeta cadenas, plantillas,
//  comentarios y expresiones regulares al contar llaves).
// ---------------------------------------------------------------------------
export function findMethod(src, name) {
  const re = new RegExp(`^([ \\t]*)(async[ \\t]+)?${name}[ \\t]*\\(`, 'm');
  const m = re.exec(src);
  if (!m) return null;
  const start = m.index;
  let i = m.index + m[0].length - 1; // en "("
  // Saltar la lista de parámetros
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) { i++; break; } }
  }
  while (i < src.length && src[i] !== '{') i++;
  const bodyStart = i;
  const end = matchBrace(src, bodyStart);
  if (end < 0) throw new Error(`No pude encontrar el final del método ${name}`);
  return { start, end: end + 1, indent: m[1] };
}

function matchBrace(src, open) {
  let depth = 0;
  let prevSignificant = '{';
  const stack = []; // para ${ } dentro de plantillas
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') { i = src.indexOf('\n', i); if (i < 0) return -1; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i + 2) + 1; if (i <= 0) return -1; continue; }
    if (c === '"' || c === "'") { i = skipQuoted(src, i, c); prevSignificant = 'x'; continue; }
    if (c === '`') { const r = skipTemplate(src, i); i = r; prevSignificant = 'x'; continue; }
    if (c === '/' && /[(,=:[!&|?{};+\-*%<>~^]/.test(prevSignificant)) { i = skipRegex(src, i); prevSignificant = 'x'; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
    if (!/\s/.test(c)) prevSignificant = c;
  }
  return -1;
}

function skipQuoted(src, i, q) {
  for (i++; i < src.length; i++) {
    if (src[i] === '\\') { i++; continue; }
    if (src[i] === q || src[i] === '\n') return i;
  }
  return i;
}

function skipTemplate(src, i) {
  for (i++; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { i++; continue; }
    if (c === '`') return i;
    if (c === '$' && src[i + 1] === '{') {
      // expresión dentro de la plantilla: contar llaves hasta cerrar
      let depth = 0;
      for (i++; i < src.length; i++) {
        const d = src[i];
        if (d === '"' || d === "'") { i = skipQuoted(src, i, d); continue; }
        if (d === '`') { i = skipTemplate(src, i); continue; }
        if (d === '{') depth++;
        else if (d === '}') { depth--; if (depth === 0) break; }
      }
    }
  }
  return i;
}

function skipRegex(src, i) {
  let inClass = false;
  for (i++; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { i++; continue; }
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) { while (/[a-z]/i.test(src[i + 1] ?? '')) i++; return i; }
    else if (c === '\n') return i;
  }
  return i;
}

function replaceMethod(src, name, code) {
  const loc = findMethod(src, name);
  const body = code.split('\n').map((l, k) => (k === 0 || !l ? l : (loc?.indent ?? '  ') + l)).join('\n');
  if (!loc) {
    // No existe: se agrega antes del cierre de la clase (antes de "export default").
    const idx = src.lastIndexOf('\n}', src.search(/\nexport default/));
    if (idx < 0) throw new Error(`No encontré dónde agregar ${name}`);
    return { src: `${src.slice(0, idx)}\n\n  ${body.replace(/\n {2}/g, '\n  ')}\n${src.slice(idx)}`, changed: 'agregado' };
  }
  return { src: src.slice(0, loc.start) + loc.indent + body + src.slice(loc.end), changed: 'reemplazado' };
}

// ---------------------------------------------------------------------------
//  Código nuevo
// ---------------------------------------------------------------------------
const METHODS = {
  handleAssistant: `async handleAssistant(userId, message) {
  // El cliente escribió una pregunta/búsqueda: el CRM devuelve los productos con sus IDs reales.
  try {
    await buscarProductos(userId, message, this.assistantState);
  } catch (error) {
    console.error('Error en handleAssistant:', error);
    printDetailedError(error);
    await whatsappService.sendMessage(userId, 'Lo siento, estoy teniendo problemas técnicos. Intenta nuevamente 🔧');
  }
}`,
  handleAssistantFlow: `async handleAssistantFlow(to, message) {
  const state = this.assistantState[to];
  delete this.assistantState[to];
  if (state?.step !== 'question') {
    await whatsappService.sendMessage(to, 'Lo siento 😔 no entendí tu respuesta\\nPor Favor, elige una de las opciones del menú.');
    return;
  }
  try {
    await buscarProductos(to, message, this.assistantState);
  } catch (error) {
    console.error('Error en handleAssistantFlow:', error);
    printDetailedError(error);
    await whatsappService.sendMessage(to, 'Lo siento, estoy teniendo problemas técnicos. Intenta nuevamente 🔧');
  }
}`,
  handleProductSelection: `async handleProductSelection(to, rowId) {
  // Fila "prod:<id>" de la lista de productos → tarjeta del producto del catálogo.
  const ok = await elegirProducto(to, rowId, this.assistantState);
  if (!ok) await this.handleMenuOption(to, rowId);
}`,
  procesarRespuestaAsistente: `async procesarRespuestaAsistente(to) {
  // Botón "Si, Gracias": envía los productos encontrados en la última búsqueda (IDs del CRM).
  try {
    await enviarProductosEncontrados(to);
  } catch (error) {
    console.error('Error en procesarRespuestaAsistente:', error);
    printDetailedError(error);
    await whatsappService.sendMessage(to, 'Lo siento, hubo un error procesando tu solicitud 🔧');
  }
}`,
};

const SEND_SINGLE = `async sendSingleProduct(to, id) {
  // Un product_retailer_id es un código sin espacios (ej. 69d5082a9bf0d32ae9a89dd9).
  // Si llega un texto (respuesta de la IA), no se manda a Meta: evitaba el error #131009.
  const productId = String(id ?? '').trim();
  if (!productId || /\\s/.test(productId) || productId.length > 100) {
    console.warn('[catalogo] product_retailer_id inválido, no se envía:', productId.slice(0, 80));
    return false;
  }
  try {
    const data = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "product",
        action: {
          catalog_id: "2277977052727019",
          product_retailer_id: productId
        }
      }
    };
    await sendToWhatsApp(data);
    return true;
  } catch (error) {
    printDetailedError(error);
    return false;
  }
}`;

const IMPORT_LINE = "import { buscarProductos, elegirProducto, enviarProductosEncontrados, ROW_PREFIX } from './productSearchFlow.js';";

// ---------------------------------------------------------------------------
export function patchMessageHandler(src) {
  const log = [];
  let out = src;
  if (!out.includes("from './productSearchFlow.js'")) {
    const lastImport = [...out.matchAll(/^import .*;$/gm)].pop();
    const at = lastImport ? lastImport.index + lastImport[0].length : 0;
    out = `${out.slice(0, at)}\n${IMPORT_LINE}${out.slice(at)}`;
    log.push('import de productSearchFlow agregado');
  }
  for (const [name, code] of Object.entries(METHODS)) {
    const r = replaceMethod(out, name, code);
    out = r.src;
    log.push(`${name}: ${r.changed}`);
  }
  // Filas de la lista con prefijo prod: (por si el estado se perdió con un reinicio)
  const oldCond = /if\s*\(\s*currentState\?\.step\s*===\s*'product_selection'\s*\)/;
  if (oldCond.test(out) && !out.includes('String(option).startsWith(ROW_PREFIX)')) {
    out = out.replace(oldCond, "if (currentState?.step === 'product_selection' || String(option).startsWith(ROW_PREFIX))");
    log.push('list_reply acepta filas prod:<id>');
  }
  return { src: out, log };
}

export function patchWhatsappService(src) {
  if (src.includes('product_retailer_id inválido')) return { src, log: ['sendSingleProduct ya validado'] };
  const r = replaceMethod(src, 'sendSingleProduct', SEND_SINGLE);
  return { src: r.src, log: [`sendSingleProduct: ${r.changed}`] };
}

// ---------------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [file, fn] of [[MH, patchMessageHandler], [WS, patchWhatsappService]]) {
    if (!fs.existsSync(file)) { console.error(`✘ No encontré ${path.relative(root, file)}. Ejecuta el script desde la raíz del repo.`); process.exit(1); }
    const before = fs.readFileSync(file, 'utf8');
    // Respeta los finales de línea del archivo (Windows CRLF o Unix LF).
    const crlf = before.includes('\r\n');
    const r = fn(crlf ? before.replace(/\r\n/g, '\n') : before);
    const src = crlf ? r.src.replace(/\r?\n/g, '\r\n') : r.src;
    const { log } = r;
    if (src === before) { console.log(`= ${path.relative(root, file)} sin cambios (ya estaba aplicado)`); continue; }
    fs.writeFileSync(`${file}.bak`, before);
    fs.writeFileSync(file, src);
    console.log(`✔ ${path.relative(root, file)} (copia en .bak)`);
    for (const l of log) console.log(`   · ${l}`);
  }
  for (const f of ['productSearchFlow.js', 'crmAdapter.js']) {
    if (!fs.existsSync(path.join(root, 'src/services', f))) console.warn(`⚠ Falta src/services/${f}: cópialo del zip antes de desplegar.`);
  }
  console.log('\nListo. Revisa con: node --check src/services/messageHandler.js');
}
