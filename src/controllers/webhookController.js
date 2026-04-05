import config from '../config/env.js';
import { decryptRequest, encryptResponse, FlowEndpointException } from "../services/encryption.js";
import { getNextScreen } from "../services/flow.js";
import { nextScreen } from "../services/flowReserva.js";
import { nextEncuesta } from "../services/flowEncuesta.js";
import messageHandler from '../services/messageHandler.js';
import crypto from "crypto";

const privateKey = config.PRIVATE_KEY;
function isRequestSignatureValid(req) {
  if(!config.APP_SECRET) {
    console.warn("App Secret is not set up. Please Add your app secret in /.env file to check for request validation");
    return true;
  }
  
  const signatureHeader = req.get("x-hub-signature-256");
  const signatureHeaderSha = signatureHeader.replace("sha256=", "");
  const signatureBuffer = Buffer.from(signatureHeaderSha, "utf-8");
  
  const hmac = crypto.createHmac("sha256", config.APP_SECRET);
  const digestString = hmac.update(req.rawBody).digest('hex');
  const digestBuffer = Buffer.from(digestString, "utf-8");

  if ( !crypto.timingSafeEqual(digestBuffer, signatureBuffer)) {
    return false;
  }
  return true;
}

let ventana;
let datosReserva;
let datosPedido = {};
let productos;
let precioTotal = 0;
let pedidoStr;
class WebhookController {  
  async handleIncoming(req, res) {
    const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];
    console.log(message);
    const recipientPhone = req.body.entry?.[0]?.changes[0]?.value?.metadata?.phone_number_id;
    
    // Solo responde si el mensaje es para el número de este bot
    if (recipientPhone !== process.env.BUSINESS_PHONE) {
      return res.sendStatus(200); // Ignora el mensaje
    }
    const senderInfo = req.body.entry?.[0]?.changes[0]?.value?.contacts?.[0];
    if (message) {
      if (message?.type === 'interactive' && message?.interactive.type === 'nfm_reply') {
        await messageHandler.handleIncomingMessage(message, senderInfo, ventana, datosReserva, datosPedido, pedidoStr);
      }
      else if (message?.type === 'order') {
      const product_names = {
        "69c218e91a3df39f11010adb": "Acetaminofén Jarabe x 60ml",
        "69c21386f055928f6ddab2eb": "Acetaminofén x 500mg",
        "69c2104f817aaac0ae5feb60": "Advil Max",
        "69c36847fd71b5f79f0423f2": "Ajo Revuelto",
        "69c36b2420de4f254d316291": "Ají Picante x 100ml",
        "69c36b146a7528a70c1d8a3c": "Ají Picante x 165ml",
        "69c218ba7bff33f4a31fd7c5": "Alcohol 70% MK x 350ml",
        "69c217e1335b9ea55fece1cf": "Algodón x 20gr",
        "69c2134b7896dea20a6de140": "Alkasetser",
        "69c2150b7bff33f4a31e489a": "Alkasetser Xtreme",
        "69c226dbfd71b5f79f61d16b": "Almendra Natural x 150gr",
        "69c2146919d90721373bacdd": "Amoxicilina x 500mg",
        "69c2147b817aaac0ae621f7b": "Ampicilina x 500mg",
        "69c3677ffd71b5f79f040165": "Anís En Grano",
        "69c3676dbfb27e5db666fa9a": "Anís Estrellado",
        "69c21021fd71b5f79f5bc57a": "Apronax",
        "69c3723e1b70fbcf1bc67a83": "Aromax x 10gr",
        "69c22250fd71b5f79f615912": "Arándanos Deshidratados x 150gr",
        "69c212f5b5b1d14e317dbf5e": "Aspirina 100",
        "69c21359b5b1d14e317df5f1": "Aspirina Efervescente",
        "69c374a2a88b9bc519bf3251": "Axion x 235gr",
        "69c3682675e6fcf877e21b7a": "Azúcar De Leche",
        "69c372a37896dea20a094364": "Barra De Detergente Dersa x 250gr",
        "69c36801a88b9bc519bbc966": "Bicarbonato",
        "69c212467bff33f4a31d16ef": "Bonfiest",
        "69c376d920de4f254d32fb19": "Brillo Chino",
        "69c376ce1b70fbcf1bc6f723": "Brillo Fino",
        "69c211a7b5b1d14e317d0743": "Buscapina Compuesta",
        "69c2129efd71b5f79f5d45eb": "Buscapina Fem",
        "69c368a07896dea20a07269e": "Canela",
        "69c36812bfb27e5db6671111": "Canela En Polvo",
        "69c4bcb67362d1fe0b8b6221": "Cepillo Colgate Medio",
        "69c4bca3cfdc708e20239bfe": "Cepillo Dental Platino Medio",
        "69c226571a3df39f1103359e": "Cheetos Boliqueso x 34gr",
        "69c223cf1a3df39f1102f5d7": "Cheetos Natural x 40gr",
        "69c223e2335b9ea55fef2c33": "Cheetos Picantes x 34gr",
        "69c2283df055928f6dde88c4": "Chicharrón BBQ x 50gr",
        "69c228677896dea20a71f4b8": "Chicharrón Limón x 50gr",
        "69c228241a3df39f110363d3": "Chicharrón Natural x 50gr",
        "69c2284e1a3df39f11036503": "Chicharrón Picante x 50gr",
        "69c227bc7bff33f4a3232df4": "Choco Krispis x 30gr",
        "69c367f07896dea20a0714a5": "Clavito",
        "69c4b5f31b70fbcf1b6db8cd": "Colgate Doble Frescura x 60ml",
        "69c4b86d1b70fbcf1b6eca0f": "Colgate Triple Acción x 22ml",
        "69c4b808cfdc708e20219966": "Colgate Triple Acción x 75ml",
        "69c4b7b5309b847b30a2d4b8": "Colgate x 60ml",
        "69c36c7c6a7528a70c1df41d": "Completísimo Desmenuzado",
        "69c215ec9d3d408699650a87": "Condones Tulip",
        "69c2152bb5b1d14e317ea6b1": "Curitas",
        "69c2233c7bff33f4a32253bd": "De Todito BBQ Mega",
        "69c228a81a3df39f1103714a": "De Todito BBQ x 165gr",
        "69c222bf19d90721373eeb73": "De Todito BBQ x 50gr",
        "69c222f17bff33f4a3224ce7": "De Todito Flamit Hot x 50gr",
        "69c228bc7896dea20a71fafe": "De Todito Limón x 165gr",
        "69c22273b5b1d14e31819fff": "De Todito Limón x 50gr",
        "69c22327335b9ea55fef1534": "De Todito Mix Mega",
        "69c22898f055928f6dde8aed": "De Todito Mix x 165gr",
        "69c222da335b9ea55fef097d": "De Todito Mix x 50gr",
        "69c22310fd71b5f79f61659e": "De Todito Natural Mega",
        "69c22886335b9ea55ff03046": "De Todito Natural x 165gr",
        "69c222889d3d40869967bb05": "De Todito Natural x 50gr",
        "69c213199d3d40869963b864": "Descongel Gripa",
        "69c36fd8872399ad64754151": "Detergente Dersa Floral x 1000gr",
        "69c36e617896dea20a088c7e": "Detergente Dersa Floral x 125gr",
        "69c36e7a6a7528a70c1e9c10": "Detergente Dersa Floral x 250gr",
        "69c36e5075e6fcf877e38f55": "Detergente Dersa Manzana x 125gr",
        "69c21443817aaac0ae61faef": "Diclofenaco x 100mg",
        "69c228d7fd71b5f79f62036b": "Doritos x 185gr",
        "69c226bc7bff33f4a32302cd": "Doritos x 43gr",
        "69c36c4c872399ad64747ae6": "Doña Gallina Cubo",
        "69c36c591b70fbcf1bc535dc": "Doña Gallina Desmenuzado",
        "69c212cef055928f6dda5831": "Duraflex Muscular Advance",
        "69c376a1872399ad64761319": "Esponja Oro Plata",
        "69c376bebfb27e5db6699d7e": "Esponja Verde y Amarillo",
        "69c3716ebfb27e5db669239f": "Exterminador En Aceite x 240ml",
        "69c3718afd71b5f79f0696fe": "Exterminador Liquido x 500ml",
        "69c36efb872399ad64751bfc": "Fabulav Citronela x 1000ml",
        "69c374766a7528a70c1f5dba": "Fabuloso Floral x 180ml",
        "69c374663cce32fbe56dcee0": "Fabuloso Lavanda x 180ml",
        "69c373a4a88b9bc519bf23c1": "Fama Bebe x 250gr",
        "69c373896a7528a70c1f313f": "Fama Total x 250gr",
        "69c376f73cce32fbe56e2443": "Fibra Clasica",
        "69c36ec83cce32fbe56d16c3": "Fábulav Citronela x 500ml",
        "69c36f11bfb27e5db6689e3b": "Fábulav Floral x 1000ml",
        "69c36edffd71b5f79f061959": "Fábulav Floral x 500ml",
        "69c36f221b70fbcf1bc5c85b": "Fábulav Limón x 1000ml",
        "69c215b0fd71b5f79f5eb610": "Gastrofast",
        "69c2155a7bff33f4a31e5b16": "Gaviscon Doble Acción",
        "69c4bd04fd71b5f79fb1f51d": "Gillette Venus Suave 3 Hojas",
        "69c3703c6a7528a70c1ec3f4": "Glade Campos de Lavanda x 400ml",
        "69c370c93cce32fbe56d5292": "Glade Paraíso Azul x 400ml",
        "69c21d5e7896dea20a70a2e9": "Golpe Con Todo BBQ x 45gr",
        "69c21a527896dea20a701c05": "Golpe Con Todo Limón x 140gr",
        "69c21d841a3df39f110203a4": "Golpe Con Todo Limón x 45gr",
        "69c21da2fd71b5f79f609c2e": "Golpe Con Todo Mayonesa x 140gr",
        "69c21d481a3df39f1101fd6e": "Golpe Con Todo Mayonesa x 45gr",
        "69c21d367896dea20a709b9b": "Golpe Con Todo Natural x 45gr",
        "69c21a36817aaac0ae64710f": "Golpe Con Todo Ranchero x 250gr",
        "69c22941f055928f6dde94a6": "Gomita Trululu Sabores x 70gr",
        "69c2292d335b9ea55ff03f29": "Gomita Trululu Splash x 70gr",
        "69c229861a3df39f1103940a": "Gomitas Trululu Aros x 70gr",
        "69c22974f055928f6ddeaf79": "Gomitas Trululu Feroz x 70gr",
        "69c229c17bff33f4a3236ae3": "Gomitas Trululu Fresitas x 70gr",
        "69c229591a3df39f11038692": "Gomitas Trululu Gusanos x 70gr",
        "69c2299a7896dea20a720b75": "Gomitas Trululu Lenguas x 70gr",
        "69c229aefd71b5f79f6223dc": "Gomitas Trululu Oro x 70gr",
        "69c3767efd71b5f79f071be2": "Guante Doméstico Talla M",
        "69c2103d7896dea20a6c422c": "Ibuflash Migraña",
        "69c2142019d90721373b83f2": "Ibuprofeno x 800mg",
        "69c3726620de4f254d329f66": "Insecticida Katori x 25gr",
        "69c2160a19d90721373c246e": "Jeringa x 5ml",
        "69c4bc4acfdc708e20238321": "Johnson's Almendras Y Avena x 110gr",
        "69c4bc79e61fb4357fc3b5d1": "Johnson's Aloe Y Vitamina E x 110gr",
        "69c4bb101b70fbcf1b6fd2eb": "Johnson's Rosas Y Sándalo x 110gr",
        "69c4bb2e7362d1fe0b8acef8": "Johnson's x 110gr",
        "69c215d5b5b1d14e317ede7d": "Kola Granulada MK",
        "69c2272d335b9ea55ff00c70": "La Especial Mix Arándanos x 180gr",
        "69c227447bff33f4a3232346": "La Especial Mix Nueces x 180gr",
        "69c22759fd71b5f79f61eb82": "La Especial Mix Pasas x 180gr",
        "69c2277ab5b1d14e3182ae9e": "La Especial Mix Sal x 180gr",
        "69c375551b70fbcf1bc6de23": "Limpido x 2000ml",
        "69c37540872399ad6475fb58": "Limpido x 460ml",
        "69c2136c335b9ea55feb5687": "Loratadina x 10mg",
        "69c2139c1a3df39f11ff88f1": "Lumbal Forte",
        "69c36c6f3cce32fbe56caa6c": "Maggie Ricontodo Desmenuzado",
        "69c368367896dea20a071cd7": "Manzanilla",
        "69c214907bff33f4a31e2a0c": "Mareol",
        "69c2212a9d3d408699676377": "Margarita Limón x 36gr",
        "69c220e8b5b1d14e31816ce2": "Margarita Mayonesa x 35gr",
        "69c22138817aaac0ae65a6e3": "Margarita Pollo x 36gr",
        "69c370f66a7528a70c1ed222": "Maxilin Limón x 450gr",
        "69c3661cbfb27e5db666ad95": "Mayonesa Bary x 150gr",
        "69c369da3cce32fbe56bf103": "Mayonesa Bary x 40gr",
        "69c214069d3d408699643684": "Metronidazol x 500mg",
        "69c21543335b9ea55febfce1": "Mieltertos",
        "69c3698cfd71b5f79f0473f8": "Mostaza",
        "69c36adc7896dea20a07a0f2": "Mostaza San Jorge x 7ml",
        "69c366e63cce32fbe56b2d46": "Mostaza x 140gr",
        "69c21122fd71b5f79f5c5747": "Movidol",
        "69c213d47896dea20a6e041f": "Naproxeno x 500mg",
        "69c213341a3df39f11ff6603": "Next Gel",
        "69c2116a19d90721373a4a40": "Noraver Día",
        "69c211401a3df39f11fe31df": "Noraver Fast Total",
        "69c2118c7bff33f4a31c8411": "Noraver Garganta",
        "69c2115219d90721373a4231": "Noraver Noche",
        "69c4be17e61fb4357fc43b4b": "Nosotras Buenas Noches",
        "69c4bdeba88b9bc5196aaa7e": "Nosotras Buenas Noches x 24 Unidades",
        "69c4be081b70fbcf1b7095e5": "Nosotras Buenas Noches x 4 Unidades",
        "69c4be81e61fb4357fc449e5": "Nosotras Normal x 10 Unidades",
        "69c4be67126013bf1f5ab65f": "Nosotras Rapigel",
        "69c4be52fd71b5f79fb2575a": "Nosotras Rapigel x 10 Unidades",
        "69c4be3ecfdc708e20244625": "Nosotras Rapigel x 30 Unidades",
        "69c212de1a3df39f11ff4702": "Noxpirin",
        "69c4b8f106882b0566572f95": "Palmolive Avena x 75gr",
        "69c4ba6e7362d1fe0b8a9408": "Palmolive Frescura Purificante x 110gr",
        "69c4b9b91dcfb49c18acc596": "Palmolive Renovación Intensa x 110gr",
        "69c226a1335b9ea55feff903": "Palomitas Caramelo x 68gr",
        "69c21519fd71b5f79f5e6b4a": "Pangetan",
        "69c36793872399ad64732db2": "Pimienta De Olor",
        "69c36c23bfb27e5db667eadb": "Pimienta x 1gr",
        "69c36c32fd71b5f79f05681c": "Pimienta x 50 sobres",
        "69c226fbf055928f6dde602b": "Pistachos x 70gr",
        "69c229007896dea20a71ff28": "Platanitos Caseros",
        "69c21ec7fd71b5f79f60e11d": "Popetas Caramelo x 165gr",
        "69c21a8c1a3df39f110186d9": "Popetas Caramelo x 44gr",
        "69c21aa1f055928f6ddccea7": "Popetas Mix Caramelo Queso x 44gr",
        "69c4bd58cfdc708e2023ee39": "Prestobarba Bic Confort 3 Hojas",
        "69c4bd35e61fb4357fc405b8": "Prestobarba Dorco 2 Hojas",
        "69c4bcde126013bf1f5a1ff4": "Prestobarba Gillette 3 Hojas",
        "69c4bd1f126013bf1f5a34a8": "Prestobarba Shick 2 Hojas",
        "69c4bdb0309b847b30a48d28": "Protectores Diarios Extra Largos x 15 Unidades",
        "69c4bdc106882b05665890aa": "Protectores Diarios Nosotras Extra Largos",
        "69c4bdd31dcfb49c18ae4170": "Protectores Diarios Nosotras Normal",
        "69c4bd88fd71b5f79fb212f6": "Protectores Diarios Nosotras Normal x 150 unidades",
        "69c4b93b1b70fbcf1b6f323e": "Protex Avena x 110gr",
        "69c4b89406882b0566570039": "Protex Avena x 75gr",
        "69c4b8d3e61fb4357fc253fc": "Protex Carbón x 75gr",
        "69c4b96a1b70fbcf1b6f3c1d": "Protex Herbal x 110 gr",
        "69c4b999e61fb4357fc29a84": "Protex Limpieza Profunda x 110gr",
        "69c4b8bd1b70fbcf1b6edcfe": "Protex Limpieza Profunda x 75gr",
        "69c4b95106882b0566575551": "Protex Nutrit Protect x 110gr",
        "69c36f9620de4f254d31fbfc": "Raid Max x 174gr",
        "69c36fbd3cce32fbe56d3332": "Raid Max x 244gr",
        "69c36f66872399ad647527b2": "Raid x 174gr",
        "69c36f831b70fbcf1bc5e15e": "Raid x 244gr",
        "69c2179cf055928f6ddc177b": "Recipiente Coprologico",
        "69c21767335b9ea55fecb407": "Recipiente De Orina",
        "69c36c8f872399ad64748db7": "Ricostilla Desmenuzado",
        "69c21cf419d90721373dff0d": "Rizadas Limón x 105gr",
        "69c219c37896dea20a6ff600": "Rizadas Limón x 250gr",
        "69c21ca57896dea20a707d24": "Rizadas Limón x 36gr",
        "69c21cce19d90721373dfa55": "Rizadas Mayonesa x 105gr",
        "69c21a0419d90721373d56d4": "Rizadas Mayonesa x 250gr",
        "69c21c7af055928f6ddd2b44": "Rizadas Mayonesa x 36gr",
        "69c21d06817aaac0ae64ef6d": "Rizadas Pollo x 105gr",
        "69c21cbb9d3d40869966cedb": "Rizadas Pollo x 36gr",
        "69c2122f19d90721373aa785": "Sal De Fruta Lua Plus",
        "69c2121a9d3d408699630a83": "Sal De Frutas Lua",
        "69c3699e872399ad6473ba11": "Salsa 54",
        "69c36708bfb27e5db666e687": "Salsa BBQ x 170gr",
        "69c36a71872399ad6473e5ee": "Salsa Con Ají Bary x 165gr",
        "69c36a25872399ad6473d106": "Salsa De Soya Selecto x 165ml",
        "69c369c31b70fbcf1bc4a8a7": "Salsa De Tomate Bary x 40gr",
        "69c36a391b70fbcf1bc4c1e1": "Salsa Inglesa Selecto x 165ml",
        "69c36981bfb27e5db6675521": "Salsa Negra",
        "69c36acdfd71b5f79f04cfe9": "Salsa Negra San Jorge x 7ml",
        "69c36a046a7528a70c1d3960": "Salsa Negra Selecto x 165ml",
        "69c366a620de4f254d3081e4": "Salsa Rosada Bary x 140gr",
        "69c365f7872399ad6472c350": "Salsa Tomate Bary x 150gr",
        "69c36b92a88b9bc519bcfa4a": "Salsita Color x 1gr",
        "69c36ba5bfb27e5db667aa24": "Salsita Color x 50 sobres",
        "69c2100b9d3d408699612213": "Sevedol Extra Fuerte",
        "69c37523fd71b5f79f06fcc1": "Sofflin x 500ml",
        "69c4beb27362d1fe0b8c1f15": "Stayfree x 12 Unidades",
        "69c375177896dea20a099a95": "Suavitel x 180ml",
        "69c2158f19d90721373c0005": "Tapabocas",
        "69c223fff055928f6dde02cc": "Ticos Natural x 38gr",
        "69c225bc9d3d408699683816": "Ticos Picante x 38gr",
        "69c225cf817aaac0ae665a33": "Ticos Pollo x 38gr",
        "69c225a119d90721373f4c9f": "Ticos Queso x 38gr",
        "69c22682f055928f6dde4f5b": "Tocinetas x 25gr",
        "69c372d2a88b9bc519bf0921": "Top Terra x 230gr",
        "69c221b97bff33f4a322034d": "Tosti Limón x 28gr",
        "69c221a7fd71b5f79f613ac3": "Tosti Nacho x 28gr",
        "69c36b6d7896dea20a07c555": "Trifogon x 24 sobres",
        "69c36b5175e6fcf877e2d105": "Trifogon x 2gr",
        "69c374e175e6fcf877e49277": "Vanish Blanco Total x 130ml",
        "69c374d0bfb27e5db6697fd0": "Vanish Color x 130ml",
        "69c37214bfb27e5db6693290": "Varsol Con Aroma x 150ml",
        "69c371ec7896dea20a092424": "Varsol Con Aroma x 400ml",
        "69c37207872399ad647584d6": "Varsol Puro x 150ml",
        "69c371da20de4f254d327b69": "Varsol Puro x 400ml",
        "69c214f2335b9ea55febed87": "Vick Vaporub",
        "69c211f6f055928f6dd9e6fd": "X Ray Dol",
        "69c227a3335b9ea55ff0199f": "Zucaritas x 36gr",
        "69c3734b20de4f254d32b1a7": "Único Plus Lavanda x 220gr",
        "69c373733cce32fbe56da967": "Único Plus Limón x 280gr"
      };
      const order = message.order;
      productos = order.product_items;

      // Calcula el total usando reduce
      precioTotal = productos.reduce((total, item) => total + (item.item_price * item.quantity),0);

      // 2. Renombra los productos usando el diccionario
      const productosNombres = productos.map(item => {
        const nombre = product_names[item.product_retailer_id] || item.product_retailer_id;
        return `${nombre} x${item.quantity}`;
      });

      // 3. Construye el string del pedido para mostrarlo bonito
      pedidoStr = productosNombres.join('\n');

      datosPedido['monto'] = precioTotal;
      // 4. Pasa el string de nombres a handleHiringFlow
      await messageHandler.handleHiringFlow(message.from, pedidoStr, datosPedido);
    }
    else {
      await messageHandler.handleIncomingMessage(message, senderInfo);
    }
  }
  res.sendStatus(200);
}

  async handleFlow(req, res) {
    if (!privateKey) {
      throw new Error(
        'Private key is empty. Please check your env variable "PRIVATE_KEY".'
      );
    }

    if(!isRequestSignatureValid(req)) {
      return res.status(432).send();
    }

    let decryptedRequest = null;
    try {
      decryptedRequest = decryptRequest(req.body, privateKey, config.PASSPHRASE);
    } catch (err) {
      console.error(err);
      if (err instanceof FlowEndpointException) {
        return res.status(err.statusCode).send();
      }
      return res.status(500).send();
    }
    
    const { aesKeyBuffer, initialVectorBuffer, decryptedBody } = decryptedRequest;
    let screenResponse;
    if (decryptedBody.screen === 'DETAILS' || decryptedBody.screen === "SUMMARY") {
      screenResponse = await getNextScreen(decryptedBody, productos, datosPedido.monto, pedidoStr);
    }
    if (decryptedBody.screen === 'RESERVA' || decryptedBody.screen === "RESUMEN") {
      screenResponse = await nextScreen(decryptedBody);
    } else if (decryptedBody.screen === 'RECOMMEND' || decryptedBody.screen === "RATE") {
      screenResponse = await nextEncuesta(decryptedBody);
    }
    // handle health check request
    if (decryptedBody.action === "ping") {
      screenResponse = await getNextScreen(decryptedBody);
    }
    ventana = decryptedBody.screen
    if (ventana === "RESUMEN") {
      datosReserva = decryptedBody.data
    } else if (ventana === "SUMMARY") {
      datosPedido["datos"] = decryptedBody.data
    }

    res.send(encryptResponse(screenResponse, aesKeyBuffer, initialVectorBuffer));
    
  };

  async handleEvent(req, res) {
    try {
      const event = req.body;
      if (event && event.data && event.data.transaction) {
        await messageHandler.handleWompiEvent(event.data.transaction);
      }
      res.status(200).send('Evento recibido');
    } catch (error) {
      console.error("Error procesando evento de Wompi:", error);
      res.status(500).send('Error procesando evento');
    }
  }

  verifyWebhook(req, res) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === config.WEBHOOK_VERIFY_TOKEN) {
      res.status(200).send(challenge);
      console.log('Webhook verified successfully!');
    } else {
      res.sendStatus(403);
    }
  }
}

export default new WebhookController();