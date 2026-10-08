import whatsappService from './whatsappService.js';
import { searchProducts } from './crmAdapter.js';

/**
 * Flujo "buscar producto" de MerkCentro24 con la lista de productos del CRM.
 *
 * Antes: geminiService.js tenía quemado el diccionario product_names
 * (id → nombre) y se le pedía a Gemini dos veces (nombres para el cliente y
 * luego IDs para el "[SISTEMA]"). Ahora el CRM devuelve en UNA llamada los
 * productos que coinciden con sus IDs reales (product_retailer_id), y la lista
 * se edita en el CRM → Chatbots → IA y conocimiento → Catálogo de productos.
 *
 * Uso en messageHandler.js (ver GUIA-BUSQUEDA-PRODUCTOS.md):
 *   import { buscarProductos, elegirProducto, enviarProductosEncontrados } from './productSearchFlow.js';
 */

const NO_AI = 'Por ahora no puedo buscar productos 🙈\nElige una opción del menú o escribe *Hola* para volver a empezar.';
const NOT_FOUND = 'Lo siento, no encontré ningún producto relacionado con tu búsqueda 😔\nIntenta con otra palabra clave (marca, sabor o presentación).';
const CONFIRM = '¿Esto es lo que buscas?\n\nToca un producto de la lista para verlo, o *Sí, gracias* para recibir todos.';

const CONFIRM_BUTTONS = [
  { type: 'reply', reply: { id: 'finalizar', title: 'Si, Gracias 😊' } },
  { type: 'reply', reply: { id: 'buscar', title: 'No, corregir' } },
];

/** Prefijo de las filas de la lista: así se distingue de las opciones del menú. */
export const ROW_PREFIX = 'prod:';

/** Memoria corta: productos encontrados por número, para "Sí, gracias". */
const found = new Map();

// ---- Títulos de fila (WhatsApp: título ≤ 24, descripción ≤ 72) ----
const TITLE_MAX = 24;
const DESC_MAX = 72;
/** Palabras que se pueden quitar del nombre sin perder el sentido (nunca la primera). */
const FILLER = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'con', 'para', 'y', 'en', 'a', 'al', 'sabor']);
const ABBR = {
  acondicionador: 'Acond.', tratamiento: 'Trat.', desodorante: 'Desod.', detergente: 'Deterg.',
  protectores: 'Protect.', protector: 'Protect.', mantequilla: 'Mantq.', chocolate: 'Choc.',
  galletas: 'Gall.', mayonesa: 'Mayon.', unidades: 'und', unidad: 'und', paquete: 'Paq.',
  extra: 'Ext.', original: 'Orig.', tradicional: 'Trad.', clásico: 'Clás.', clasico: 'Clás.',
};
const SIZE_RE = /\s+x\s*((?:\d+(?:[.,]\d+)?\s*[a-záéíóú]*\.?)|unidad(?:es)?)\s*$/i;

/** "x 110 gr" → "110gr" · "x 15 Unidades" → "15und" · "x Unidad" → "und" */
function sizeOf(name) {
  const m = SIZE_RE.exec(name);
  if (!m) return { base: name, size: '' };
  const size = m[1].replace(/\s+/g, '').replace(/unidad(es)?/i, 'und');
  return { base: name.slice(0, m.index).trim(), size };
}
const join = (base, size) => (size ? `${base} ${size}` : base);
const cut = (s, max) => {
  if (s.length <= max) return s;
  const words = s.slice(0, max).split(' ');
  // Corta en el último espacio si no se pierde demasiado; si no, corta la palabra.
  const byWord = words.length > 1 ? words.slice(0, -1).join(' ') : '';
  return byWord.length >= max - 6 ? byWord : s.slice(0, max).trim();
};

/**
 * Título corto que conserva la presentación (110gr, 75gr, 1.5L…):
 *   "Jabón Protex Avena x 110gr"                       → "Jabón Protex Avena 110gr"
 *   "Tratamiento Nutribela 15 Con Células Madres x 27ml" → "Trat. Nutribela 15… 27ml"
 * El nombre completo va en la descripción de la fila.
 */
export function shortTitle(name) {
  const full = String(name ?? '').replace(/\s+/g, ' ').trim();
  if (full.length <= TITLE_MAX) return full;
  const { base, size } = sizeOf(full);
  let t = join(base, size);
  if (t.length <= TITLE_MAX) return t;
  // Quitar conectores ("de", "con", "y"…) y abreviar palabras largas.
  const words = base.split(' ');
  const compact = words.filter((w, i) => i === 0 || !FILLER.has(w.toLowerCase()));
  t = join(compact.join(' '), size);
  if (t.length <= TITLE_MAX) return t;
  const abbr = compact.map((w) => ABBR[w.toLowerCase()] ?? w).join(' ');
  t = join(abbr, size);
  if (t.length <= TITLE_MAX) return t;
  // Último recurso: recortar el nombre pero dejar siempre la presentación al final.
  const room = TITLE_MAX - (size ? size.length + 1 : 0) - 1;
  return join(`${cut(abbr, room)}…`, size);
}

const money = (p) => (p.price != null && p.price !== '' && !Number.isNaN(Number(p.price))
  ? `$${Number(p.price).toLocaleString('es-CO', { maximumFractionDigits: 0 })}` : '');

/** Descripción de la fila: nombre completo + precio (≤ 72). */
export function rowDescription(p) {
  const full = String(p.name ?? '').replace(/\s+/g, ' ').trim();
  const price = money(p);
  const tail = price ? ` · ${price}` : '';
  const room = DESC_MAX - tail.length;
  return `${full.length > room ? `${full.slice(0, room - 1).trim()}…` : full}${tail}`;
}

/**
 * Busca lo que escribió el cliente y le muestra la lista de coincidencias.
 * Devuelve true si mostró productos (y deja al cliente en product_selection).
 */
export async function buscarProductos(to, message, assistantState) {
  const result = await searchProducts(to, message);
  if (!result) {
    await whatsappService.sendMessage(to, NO_AI);
    return false;
  }
  if (result.none || !result.items?.length) {
    await whatsappService.sendMessage(to, NOT_FOUND);
    await whatsappService.sendInteractiveButtons(to, '¿Quieres intentar con otra palabra?', [
      { type: 'reply', reply: { id: 'buscar', title: 'Buscar de nuevo 🔎' } },
    ]);
    return false;
  }

  found.set(to, result.items);

  // WhatsApp admite 10 filas por lista: se parte en varias si hace falta.
  for (let i = 0; i < result.items.length; i += 10) {
    const chunk = result.items.slice(i, i + 10);
    await whatsappService.sendListMessage(to, {
      type: 'list',
      body: { text: i === 0 ? 'Productos encontrados:' : 'Más productos:' },
      action: {
        button: 'Productos',
        sections: [{
          rows: chunk.map((p) => ({
            id: `${ROW_PREFIX}${p.id}`.slice(0, 200),
            title: shortTitle(p.name),          // ≤ 24: conserva la presentación (110gr, 75gr…)
            description: rowDescription(p),    // ≤ 72: nombre completo + precio
          })),
        }],
      },
    });
  }
  if (assistantState) assistantState[to] = { step: 'product_selection' };
  await whatsappService.sendInteractiveButtons(to, CONFIRM, CONFIRM_BUTTONS);
  return true;
}

/** El cliente tocó una fila de la lista: se envía ese producto del catálogo. */
export async function elegirProducto(to, rowId, assistantState) {
  if (assistantState) delete assistantState[to];
  const id = String(rowId ?? '').startsWith(ROW_PREFIX) ? rowId.slice(ROW_PREFIX.length) : null;
  if (!id) return false;
  await whatsappService.sendSingleProduct(to, id);
  found.delete(to);
  return true;
}

/** "Sí, gracias": se envían todos los productos encontrados. */
export async function enviarProductosEncontrados(to) {
  const items = found.get(to);
  if (!items?.length) {
    await whatsappService.sendMessage(to, 'No encontré tu búsqueda anterior. Escríbeme de nuevo lo que necesitas.');
    return false;
  }
  for (const p of items) await whatsappService.sendSingleProduct(to, p.id);
  found.delete(to);
  return true;
}
