import whatsappService from './whatsappService.js';
import appendToSheet from './googleSheetsService.js';
import geminiService from './geminiService.js';
import { createWompiPaymentLink, getWompiTransactionStatus } from './wompiService.js';
import { enviarPedidoALoggro } from './loggroService.js';
import { saveUserDataByNumber } from './googleSheetsService.js';
import { printDetailedError } from './printDetailError.js';
import { downloadImageFromMeta } from './httpRequest/sendToWhatsApp.js';
import { uploadToPublicStorage } from './awsS3Service.js';

const transactionToPhoneMap = {}; // Memoria para mapear transactionId a número de teléfono
const idNumber = {}
const accion = {}
const paymentRowMap = {};
const userOrderDataMap = {};
const assistantResponseMap = {}; // Memoria para guardar respuestas de Gemini por usuario

class MessageHandler {

  constructor() {
    this.appointmentState = {};
    this.assistantState = {};
  }

  async handleIncomingMessage(message, senderInfo, screen, datosPedido, pedidoStr) {
    try {
      if (message?.type === 'text' && message.text) {
        const incomingMessage = message.text.body.toLowerCase().trim();
        const userId = message.from;
        if (this.isGreeting(incomingMessage)) {
          await this.sendWelcomeMessage(userId, senderInfo);
          await this.sendWelcomeMenu(userId);
          await this.buscadorProductos(userId);
        } else if (this.assistantState[message.from]) {
          await this.handleAssistantFlow(message.from, incomingMessage);
        } else if (this.isQuestion(incomingMessage)) {
          await this.handleAssistant(userId, incomingMessage);
        } else {
          await this.handleMenuOption(message.from, incomingMessage);
        }
        await whatsappService.markAsRead(message.id);
      } else if (message?.type === 'interactive') {
        if (message?.interactive.type === 'nfm_reply') {
          await this.respFlow(message.from, screen, datosPedido, pedidoStr);
          await whatsappService.markAsRead(message.id);
          accion["pantalla"] = screen;
        } else if (message?.interactive.type === 'list_reply') {
          // <-- Aquí manejas la respuesta de la lista
          const option = message?.interactive?.list_reply?.id;
          await this.handleMenuOption(message.from, option);
          await whatsappService.markAsRead(message.id);
        } else {
          const option = message?.interactive?.button_reply?.id;
          await this.handleMenuOption(message.from, option);
          await whatsappService.markAsRead(message.id);
        }        
      } else if (message?.type === 'image' && accion["pantalla"] === 'SUMMARY') {
        const datosUsuario = userOrderDataMap[message.from] || {};
        const imageBuffer = await downloadImageFromMeta(message.image.url);
        
        // 2. Subir a S3
        const publicUrl = await uploadToPublicStorage(imageBuffer, message.image.mime_type);
        
        // 3. Enviar la imagen al número oficial
        const nombre = datosUsuario.name || "";
        const direccion = datosUsuario.address || "";
        const monto = datosUsuario.monto || "";
        const pedido = datosUsuario.pedidoStr || "";

        const templateVars = [
          nombre,
          direccion,
          pedido,
          monto ? monto.toLocaleString('es-CO') : "",
        ];

        await whatsappService.sendTemplateMediaMessage(
          publicUrl,         // URL pública de la imagen en S3
          templateVars
        );
        
        const msg = "Gracias por compartirnos el comprobante de tu pago ✅\n\nPronto nos pondremos en contacto contigo para confirmar tu compra 😊";
        await whatsappService.sendMessage(message.from, msg);
      }
      
    } catch (error) {
      console.log(error);
    }
  }

  isGreeting(message) {
    const greetings = ["hola", "hi", "ok", "listo", "bien", "bueno", "hello", "HL", "Oe", "buenas", "buenos dias", "buenas tardes", "buenas noches", "saludos", "como estás", "hl", "gracias", "muchas gracias"];
    return greetings.includes(message);
  }

  async getDay() {
    // Día de la semana
  const now = new Date();
  const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const diaSemana = dias[now.getDay()];

  return diaSemana;
  }

  isOrder(message) {
    const lower = message.toLowerCase();
    return (
      lower.includes('pedir') ||
      lower.includes('pedido') ||
      lower.includes('orden') ||
      lower.includes('comprar')
    );
  }

  isQuestion(message) {
  const lower = message.toLowerCase();
  return (
    lower.includes('que') ||
    lower.includes('qué') ||
    lower.includes('quien') ||
    lower.includes('quién') ||
    lower.includes('cual') ||
    lower.includes('cuál') ||
    lower.includes('cuando') ||
    lower.includes('cuándo') ||
    lower.includes('porque') ||
    lower.includes('por que') ||
    lower.includes('porqué') ||
    lower.includes('por qué') ||
    lower.includes('para que') ||
    lower.includes('para qué') ||
    lower.includes('donde') ||
    lower.includes('dónde') ||
    lower.includes('como') ||
    lower.includes('cómo') ||
    lower.includes('cuanto') ||
    lower.includes('cuánto') ||
    lower.includes('pregunta') ||
    lower.includes('¿') ||
    lower.includes('?')
  );
}

  getSenderName(senderInfo) {
    return senderInfo.profile?.name || senderInfo.wa_id || "Cliente";
  }

  async sendWelcomeMessage(to, senderInfo) {
    try {
        const name = this.getSenderName(senderInfo).match(/^(\w+)/)?.[1];
        const welcomeMessage = `¡Hola 👋 ${name}!\nBienvenid@ a *MerkaCentro 24 Horas*🏪🛒\n\n¿Qué deseas comprar hoy?`;
        await whatsappService.sendMessage(to, welcomeMessage);
    } catch (error) {
      printDetailedError(error);
    }
  }

  async buscadorProductos(to) {
    const menuMessage = "¿Quieres que te ayude a buscar algo?";
    const buttons = [
      { type: 'reply', reply: { id: 'buscar', title: "Si, por favor" } },
      // { type: 'reply', reply: { id: '', title: 'Hacer otra pregunta' } },
      // { type: 'reply', reply: { id: '', title: 'Hablar con asesor 🤵' } }
    ];

    await whatsappService.sendInteractiveButtons(to, menuMessage, buttons);
  }

  async sendWelcomeMenu(to) {
  const listMessage = {
    type: "interactive",
    interactive: {
      type: "list",
      body: {
        text: "Da clic en *Comprar* para ver los productos"
      },
      action: {
        button: "Comprar",
        sections: [
          {
            title: "Mercado 🛒🛍️",
            rows: [
              {
                id: "option_1",
                title: "Despensa🍚🥚🥫🧂",
                description: "Arroz, Aceite, Huevos, Salsas, Condimentos y más"
              },
              {
                id: "option_2",
                title: "Carnes frías🥩 y Frutas🍎",
                description: "Carne, Pollo, Pescado y Más"
              },
              {
                id: "option_3",
                title: "Lácteos Y Refrigeración🥛",
                description: "Leche, Queso, Yogurt y Más"
              },
              {
                id: "option_4",
                title: "Bebidas🧃 y Gaseosas🥤",
                description: "Refrescos, Jugos, Gaseosas, Agua y Más"
              },
              {
                id: "option_5",
                title: "Desechables 🍴🗑️",
                description: "Platos, Tazas, Utensilios y Más"
              }
            ]
          },
          {
            title: "Cuidado Personal🧴y Hogar",
            rows: [
              {
                id: "opcion_1",
                title: "Personal🧴🧼",
                description: "Jabones, Champús, Cremas y Más"
              },
              {
                id: "opcion_2",
                title: "Medicamentos 💊",
                description: "Medicamentos de venta libre y cuidado de la salud"
              },
              {
                id: "opcion_3",
                title: "Del Hogar 🧤🧼",
                description: "Detergentes, Desinfectantes, Suavizantes y Más"
              }
            ]
          },
          {
            title: "Dulces, Mekatos y Snacks",
            rows: [
              {
                id: "opt1",
                title: "Mekatos y confitería🍬🍭",
                description: "Mekatos, chocolates, galletas y más"
              }
            ]
          }
        ]
      }
    }
  };

  await whatsappService.sendListMessage(to, listMessage);
}

  async menuPedido(to) {
    const action = {
      name: "flow",
      parameters: {
        "flow_message_version": "3",
        "flow_id": "1293383568429390",
        "flow_cta": "Enviar datos"
      },
    }
    return await whatsappService.sendFlow(to, action);
  }

  async getDia() {
    // Día de la semana
  const now = new Date();
  const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const diaSemana = dias[now.getDay()];

  return diaSemana
  }
  
  async catalogoSubMercado3(to) {
    const template = {
      type: "product_list",
      header: { 
          type: "text",
          text: "Cuidado Personal 🧴🧼"
        },
        body: {
          text: "Jabones, Champús y Tratamientos"
        },
        action: {
          catalog_id: "2277977052727019",
          sections: [
          {
            "title": "JABONES",
            "product_items": [
              {
                "product_retailer_id": "69c4b8f106882b0566572f95"
              },
              {
                "product_retailer_id": "69c4ba6e7362d1fe0b8a9408"
              },
              {
                "product_retailer_id": "69c4b9b91dcfb49c18acc596"
              },
              {
                "product_retailer_id": "69c4b93b1b70fbcf1b6f323e"
              },
              {
                "product_retailer_id": "69c4b89406882b0566570039"
              },
              {
                "product_retailer_id": "69c4b8d3e61fb4357fc253fc"
              },
              {
                "product_retailer_id": "69c4b96a1b70fbcf1b6f3c1d"
              },
              {
                "product_retailer_id": "69c4b999e61fb4357fc29a84"
              },
              {
                "product_retailer_id": "69c4b8bd1b70fbcf1b6edcfe"
              },
              {
                "product_retailer_id": "69c4b95106882b0566575551"
              },
              { 
                "product_retailer_id": "69c4bc4acfdc708e20238321" 
              },
              { 
                "product_retailer_id": "69c4bc79e61fb4357fc3b5d1" 
              },
              { 
                "product_retailer_id": "69c4bb101b70fbcf1b6fd2eb" 
              },
              { 
                "product_retailer_id": "69c4bb2e7362d1fe0b8acef8" 
              }
            ]
          },
          {
            "title": "SHAMPÚS",
            "product_items": [
              {
                "product_retailer_id": "69d3b50549248df9f806115d"
              },
              {
                "product_retailer_id": "69d3b4e25e7da3a2f6ffdf8a"
              },
              {
                "product_retailer_id": "69d3b61cdeafcfb1d1e78e37"
              },
              {
                "product_retailer_id": "69d3b38bdeafcfb1d1e4e15d"
              },
              { 
                "product_retailer_id": "69d3b3d149248df9f804d8eb" 
              },
              { 
                "product_retailer_id": "69d3b59c337ef3c0ce152e3d" 
              },
              { 
                "product_retailer_id": "69d3b6344cb3c5886206bea0" 
              },
              { 
                "product_retailer_id": "69d3b5312440c8c5971d6527" 
              },
              { 
                "product_retailer_id": "69d3b23fdeafcfb1d1e3fbc3" 
              },
            ]
          },
          {
            "title": "TRATAMIENTOS",
            "product_items": [
              { 
                "product_retailer_id": "69d3ba02524001f94ec82743" 
              },
              { 
                "product_retailer_id": "69d3b4936d06a3361b4bd476" 
              },
              { 
                "product_retailer_id": "69d3b4494cb3c5886204f58e" 
              },
              { 
                "product_retailer_id": "69d3b470deafcfb1d1e5ccab" 
              },
              { 
                "product_retailer_id": "69d3b434337ef3c0ce1391d9" 
              },
              { 
                "product_retailer_id": "69d3b4152440c8c5971c5732" 
              },
              { 
                "product_retailer_id": "69d3b5c66b3269bbe44161ce" 
              },
            ]
          },
        ]
      }
  }
    const template1 = {
      type: "product_list",
      header: { 
          type: "text",
          text: "Cuidado bucal y capilar 🧴"
        },
        body: {
          text: "Cremas, Desodorantes y Acondicionadores"
        },
        action: {
          catalog_id: "2277977052727019",
          sections: [
          {
            "title": "CREMAS",
            "product_items": [
              { 
                "product_retailer_id": "69d3b5e3524001f94ec45c0c" 
              },
              { 
                "product_retailer_id": "69d3b54d6d06a3361b4d59b6" 
              },
              { 
                "product_retailer_id": "69d3b2db5e7da3a2f6fda87b" 
              },
              { 
                "product_retailer_id": "69d3b27549248df9f8033791" 
              },
              { 
                "product_retailer_id": "69d3b25c5e7da3a2f6fd5b54" 
              },
              { 
                "product_retailer_id": "69d3b8b82440c8c59720a64a" 
              },
              { 
                "product_retailer_id": "69d3b75e337ef3c0ce16b0ee" 
              },
              { 
                "product_retailer_id": "69d3b7735e7da3a2f60226d0" 
              },
            ]
          },
          {
            "title": "COLGATE Y LIMPIEZA",
            "product_items": [
              { 
                "product_retailer_id": "69c4bcb67362d1fe0b8b6221" 
              },
              { 
                "product_retailer_id": "69d3bac4337ef3c0ce19aabe" 
              },
              { 
                "product_retailer_id": "69c4bca3cfdc708e20239bfe" 
              },
              { 
                "product_retailer_id": "69c4b5f31b70fbcf1b6db8cd" 
              },
              { 
                "product_retailer_id": "69c4b86d1b70fbcf1b6eca0f" 
              },
              { 
                "product_retailer_id": "69c4b808cfdc708e20219966" 
              },
              { 
                "product_retailer_id": "69c4b7b5309b847b30a2d4b8" 
              },
              { 
                "product_retailer_id": "69d3b6956b3269bbe44250f9"
              },
              { 
                "product_retailer_id": "69d3ba9a6b3269bbe4466255" 
              },
            ]
          },
          {
            "title": "DESODORANTES",
            "product_items": [
              { 
                "product_retailer_id": "69d3b80f5e7da3a2f602b880" 
              },
              { 
                "product_retailer_id": "69d3b82249248df9f807fe87" 
              },
              { 
                "product_retailer_id": "69d3b8d75e7da3a2f603f359" 
              },
              { 
                "product_retailer_id": "69d3b7b6deafcfb1d1e898e8" 
              },
              { 
                "product_retailer_id": "69d3ba33524001f94ec83be9" 
              },
              { 
                "product_retailer_id": "69d3b8f7524001f94ec77112" 
              },
              { 
                "product_retailer_id": "69d3b7a04cb3c58862080ed8" 
              },
              { 
                "product_retailer_id": "69d3b7e9deafcfb1d1e8b9bd" 
              },
            ]
          },
          {
            "title": "INTIMO/A",
            "product_items": [
              { 
                "product_retailer_id": "69c4bd04fd71b5f79fb1f51d" 
              },
              { 
                "product_retailer_id": "69d3bb122440c8c59722a650" 
              },
              { 
                "product_retailer_id": "69d3bae7524001f94ec8bc59" 
              },
            ]
          }
        ]
      }
  }
    const template2 = {
      type: "product_list",
      header: { 
          type: "text",
          text: "Otros Cuidado Personal 🧴🧼"
        },
        body: {
          text: "Papel higiénico, Toallas higiénicas y Pañales"
        },
        action: {
          catalog_id: "2277977052727019",
          sections: [
          {
            "title": "PAÑALES",
            "product_items": [
              {
                "product_retailer_id": "69d3bbf86b3269bbe44811f2"
              },
              {
                "product_retailer_id": "69d3bc615e7da3a2f6073e2c"
              },
              {
                "product_retailer_id": "69d3bc73524001f94eca0054"
              },
              {
                "product_retailer_id": "69d3bc9a5e7da3a2f607a8be"
              },
              {
                "product_retailer_id": "69d3bcbbdeafcfb1d1ed53eb"
              },
              {
                "product_retailer_id": "69d3ba66deafcfb1d1ea89a9"
              },
              {
                "product_retailer_id": "69d3ba836b3269bbe4465231"
              }
            ]
          },
          {
            "title": "TOALLAS HIGIÉNICAS",
            "product_items": [
              {
                "product_retailer_id": "69c4bdb0309b847b30a48d28"
              },
              {
                "product_retailer_id": "69c4bdc106882b05665890aa"
              },
              {
                "product_retailer_id": "69c4bdd31dcfb49c18ae4170"
              },
              {
                "product_retailer_id": "69c4bd88fd71b5f79fb212f6"
              },
              { 
                "product_retailer_id": "69c4be17e61fb4357fc43b4b" 
              },
              { 
                "product_retailer_id": "69c4bdeba88b9bc5196aaa7e" 
              },
              { 
                "product_retailer_id": "69c4be081b70fbcf1b7095e5" 
              },
              { 
                "product_retailer_id": "69c4be81e61fb4357fc449e5" 
              },
              { 
                "product_retailer_id": "69c4be67126013bf1f5ab65f" 
              },
              { 
                "product_retailer_id": "69c4be52fd71b5f79fb2575a" 
              },
              { 
                "product_retailer_id": "69c4be3ecfdc708e20244625" 
              },
              { 
                "product_retailer_id": "69c4beb27362d1fe0b8c1f15" 
              },
            ]
          },
          {
            "title": "OTROS CUIDADOS",
            "product_items": [
              {
                "product_retailer_id": "69c4bd58cfdc708e2023ee39"
              },
              {
                "product_retailer_id": "69c4bd35e61fb4357fc405b8"
              },
              {
                "product_retailer_id": "69c4bcde126013bf1f5a1ff4"
              },
              {
                "product_retailer_id": "69c4bd1f126013bf1f5a34a8"
              },
              { 
                "product_retailer_id": "69d3ba195e7da3a2f604e744" 
              },
              { 
                "product_retailer_id": "69d3b7ce6d06a3361b4f8aa5" 
              },
              { 
                "product_retailer_id": "69d3b6802440c8c5971ea9de" 
              },
              {
                "product_retailer_id": "69d3b73d719c4da024d31223"
              },
            ]
          },
        ]
      }
  }
    const templates = [template, template1, template2];
    for (const temp of templates) {
       await whatsappService.sendProductList(to, temp);
    }
  }

  async catalogoMercado2(to) {
    const template = {
      type: "product_list",
      header: { 
          type: "text",
          text: "Mekatos y confitería🍬🍭"
        },
        body: {
          text: "Da clic aquí"
        },
        action: {
          catalog_id: "2277977052727019",
          sections: [
          {
                  "title": "CONFITERÍA",
                  "product_items": [
                    {
                      "product_retailer_id": "69d68e002af86b6d19fd009f"
                    },
                    {
                      "product_retailer_id": "69d68e242af86b6d19fd552e"
                    },
                    {
                      "product_retailer_id": "69d68e115f0010c7d1f9af40"
                    },
                    {
                      "product_retailer_id": "69d689d82af86b6d19f20b24"
                    },
                    {
                      "product_retailer_id": "69d689c0b1a817c41928605d"
                    },
                    {
                      "product_retailer_id": "69d68de6bedddfd69ad1df84"
                    },
                    {
                      "product_retailer_id": "69d6891e42a93f3786c68848"
                    },
                    {
                      "product_retailer_id": "69d68a0ecced254ef4334c43"
                    },
                    {
                      "product_retailer_id": "69d689f82c4e357a854b2186"
                    },
                    {
                      "product_retailer_id": "69d68ecbbedddfd69ad37fe8"
                    },
                    {
                      "product_retailer_id": "69d68ebc8ca23c3471c0738b"
                    },
                    {
                      "product_retailer_id": "69d68c4d42a93f3786cf8b94"
                    },
                    {
                      "product_retailer_id": "69d68c23cced254ef43a9cd5"
                    },
                    {
                      "product_retailer_id": "69d68d7c2c4e357a85535971"
                    },
                    {
                      "product_retailer_id": "69d68c5fbedddfd69acdf5a2"
                    },
                    {
                      "product_retailer_id": "69d68c352c4e357a8551027d"
                    }
                  ]
                }
              ]
            }
          }
    const template1 = {
      type: "product_list",
      header: { 
          type: "text",
          text: "Confitería🍬🍭"
        },
        body: {
          text: "Da clic aquí"
        },
        action: {
          catalog_id: "2277977052727019",
          sections: [
            {
                "title": "CONFITERÍA",
                "product_items": [
                  {
                    "product_retailer_id": "69d68f7b2af86b6d19008ccb"
                  },
                  {
                    "product_retailer_id": "69d68f5a8ca23c3471c1d245"
                  },
                  {
                    "product_retailer_id": "69d6889142a93f3786c577c1"
                  },
                  {
                    "product_retailer_id": "69d6882e8ca23c3471b0b1c9"
                  },
                  {
                    "product_retailer_id": "69d688e4cced254ef4307f06"
                  },
                  {
                    "product_retailer_id": "69d688ce8dab334394e96682"
                  },
                  {
                    "product_retailer_id": "69d69383b1a817c41940c1a2"
                  },
                  {
                    "product_retailer_id": "69d69216bedddfd69ada4b40"
                  },
                  {
                    "product_retailer_id": "69d690ed42a93f3786d8f736"
                  },
                  {
                    "product_retailer_id": "69d693a92af86b6d190810b6"
                  },
                  {
                    "product_retailer_id": "69d689605f0010c7d1ee7582"
                  },
                  {
                    "product_retailer_id": "69d6896d8ca23c3471b2a72c"
                  },
                  {
                    "product_retailer_id": "69d686bb8ca23c3471add12a"
                  },
                  {
                    "product_retailer_id": "69d686a38dab334394e4e803"
                  },
                  {
                    "product_retailer_id": "69d69017cced254ef4447d84"
                  },
                  {
                    "product_retailer_id": "69d6900742a93f3786d739c8"
                  },
                  {
                    "product_retailer_id": "69d687e08ca23c3471b027e6"
                  },
                  {
                    "product_retailer_id": "69d68753bedddfd69ac17766"
                  },
                  {
                    "product_retailer_id": "69d68ef98dab334394f962f8"
                  },
                  {
                    "product_retailer_id": "69d68ee5125e0f8053baedb5"
                  },
                  {
                    "product_retailer_id": "69d68b7abedddfd69acb6b68"
                  },
                  {
                    "product_retailer_id": "69d68bc9cced254ef439f4d7"
                  },
                  {
                    "product_retailer_id": "69d68add2c4e357a854d62e2"
                  },
                  {
                    "product_retailer_id": "69d68a27125e0f8053ae7179"
                  },
                  {
                    "product_retailer_id": "69d68ba88dab334394f20308"
                  },
                  {
                    "product_retailer_id": "69d68fe9b1a817c419383c1d"
                  },
                  {
                    "product_retailer_id": "69d68fd4bedddfd69ad5bdb5"
                  },
                  {
                    "product_retailer_id": "69d68dd8b1a817c419332d5f"
                  },
                  {
                    "product_retailer_id": "69d686f9cced254ef42d1e3d"
                  },
                  {
                    "product_retailer_id": "69d686e242a93f3786c1a735"
                  },
                  // MEKATOS 
                  {
                    "product_retailer_id": "69c21a36817aaac0ae64710f"
                  },
                  {
                    "product_retailer_id": "69c22941f055928f6dde94a6"
                  },
                  {
                    "product_retailer_id": "69c2292d335b9ea55ff03f29"
                  },
                  {
                    "product_retailer_id": "69c229861a3df39f1103940a"
                  },
                  {
                    "product_retailer_id": "69c22974f055928f6ddeaf79"
                  },
                  {
                    "product_retailer_id": "69c229c17bff33f4a3236ae3"
                  },
                  {
                    "product_retailer_id": "69c229591a3df39f11038692"
                  },
                  {
                    "product_retailer_id": "69c2299a7896dea20a720b75"
                  },
                  {
                    "product_retailer_id": "69c229aefd71b5f79f6223dc"
                  },
                  {
                    "product_retailer_id": "69c2272d335b9ea55ff00c70"
                  },
                  {
                    "product_retailer_id": "69c227447bff33f4a3232346"
                  },
                  {
                    "product_retailer_id": "69c22759fd71b5f79f61eb82"
                  },
                  {
                    "product_retailer_id": "69c2277ab5b1d14e3182ae9e"
                  },
                  {
                    "product_retailer_id": "69c2212a9d3d408699676377"
                  }
                  ]
                }
              ]
            }
          }
    //hacer un for para enviar ambos templates
    const templates = [template, template1, ];
    for (const temp of templates) {
       await whatsappService.sendProductList(to, temp);
    }
  }

  async catalogoSubMercado4(to) {
    const template = {
      type: "product_list",
      header: { 
          type: "text",
          text: "Medicamentos"
        },
        body: {
          text: "Da clic aquí"
        },
        action: {
          catalog_id: "2277977052727019",
          sections: [
          {
            "title": "MEDICAMENTOS",
              "product_items": [
                {
                  "product_retailer_id": "69c218e91a3df39f11010adb"
                },
                {
                  "product_retailer_id": "69c21386f055928f6ddab2eb"
                },
                {
                  "product_retailer_id": "69c2104f817aaac0ae5feb60"
                },
                {
                  "product_retailer_id": "69c218ba7bff33f4a31fd7c5"
                },
                {
                  "product_retailer_id": "69c217e1335b9ea55fece1cf"
                },
                {
                  "product_retailer_id": "69c2134b7896dea20a6de140"
                },
                {
                  "product_retailer_id": "69c212467bff33f4a31d16ef"
                },
                {
                  "product_retailer_id": "69c2146919d90721373bacdd"
                },
                {
                  "product_retailer_id": "69c211a7b5b1d14e317d0743"
                },
                {
                  "product_retailer_id": "69c21021fd71b5f79f5bc57a"
                },
                {
                  "product_retailer_id": "69c212f5b5b1d14e317dbf5e"
                },
                {
                  "product_retailer_id": "69c21359b5b1d14e317df5f1"
                },
                {
                  "product_retailer_id": "69c2129efd71b5f79f5d45eb"
                },
                {
                  "product_retailer_id": "69c2152bb5b1d14e317ea6b1"
                },
                {
                  "product_retailer_id": "69c213199d3d40869963b864"
                },
                {
                  "product_retailer_id": "69c21443817aaac0ae61faef"
                },
                {
                  "product_retailer_id": "69c212cef055928f6dda5831"
                },
                {
                  "product_retailer_id": "69c2155a7bff33f4a31e5b16"
                },
                {
                  "product_retailer_id": "69c2103d7896dea20a6c422c"
                },
                {
                  "product_retailer_id": "69c2142019d90721373b83f2"
                },
                {
                  "product_retailer_id": "69c2160a19d90721373c246e"
                },
                {
                  "product_retailer_id": "69c215d5b5b1d14e317ede7d"
                },
                {
                  "product_retailer_id": "69c2136c335b9ea55feb5687"
                },
                {
                  "product_retailer_id": "69c2139c1a3df39f11ff88f1"
                },
                {
                  "product_retailer_id": "69c214907bff33f4a31e2a0c"
                },
                // {
                //   "product_retailer_id": "69c214069d3d408699643684" //Metronidazol
                // },
                {
                  "product_retailer_id": "69c21543335b9ea55febfce1"
                },
                {
                  "product_retailer_id": "69c21122fd71b5f79f5c5747"
                },
                {
                  "product_retailer_id": "69c213d47896dea20a6e041f"
                },
                {
                  "product_retailer_id": "69c213341a3df39f11ff6603"
                },
                {
                  "product_retailer_id": "69c2116a19d90721373a4a40"
                }
            ]
          }
        ]
      }
  }
    return await whatsappService.sendProductList(to, template);
  }

  async catalogoSubMercado5(to) {
    const template = {
      type: "product_list",
      header: { 
          type: "text",
          text: "Cuidado del Hogar🧼"
        },
        body: {
          text: "Da clic aquí"
        },
        action: {
          catalog_id: "2277977052727019",
          sections: [
          {
            "title": "HOGAR",
              "product_items": [
                {
                  "product_retailer_id": "69c3723e1b70fbcf1bc67a83"
                },
                {
                  "product_retailer_id": "69c374a2a88b9bc519bf3251"
                },
                {
                  "product_retailer_id": "69c372a37896dea20a094364"
                },
                {
                  "product_retailer_id": "69c376d920de4f254d32fb19"
                },
                {
                  "product_retailer_id": "69c376ce1b70fbcf1bc6f723"
                },
                {
                  "product_retailer_id": "69c36fd8872399ad64754151"
                },
                {
                  "product_retailer_id": "69c36e617896dea20a088c7e"
                },
                {
                  "product_retailer_id": "69c36e7a6a7528a70c1e9c10"
                },
                {
                  "product_retailer_id": "69c36e5075e6fcf877e38f55"
                },
                {
                  "product_retailer_id": "69c376a1872399ad64761319"
                },
                {
                  "product_retailer_id": "69c376bebfb27e5db6699d7e"
                },
                {
                  "product_retailer_id": "69c3716ebfb27e5db669239f"
                },
                {
                  "product_retailer_id": "69c3718afd71b5f79f0696fe"
                },
                {
                  "product_retailer_id": "69c36efb872399ad64751bfc"
                },
                {
                  "product_retailer_id": "69c374766a7528a70c1f5dba"
                },
                {
                  "product_retailer_id": "69c374663cce32fbe56dcee0"
                },
                {
                  "product_retailer_id": "69c373a4a88b9bc519bf23c1"
                },
                {                  
                  "product_retailer_id": "69c373896a7528a70c1f313f"
                },
                {                  
                  "product_retailer_id": "69c376f73cce32fbe56e2443"
                },
                {                  
                  "product_retailer_id": "69c36ec83cce32fbe56d16c3"
                },
                {
                  "product_retailer_id": "69c36f11bfb27e5db6689e3b"
                },
                {
                  "product_retailer_id": "69c36edffd71b5f79f061959"
                },
                {
                  "product_retailer_id": "69c36f221b70fbcf1bc5c85b"
                },
                {
                  "product_retailer_id": "69c3703c6a7528a70c1ec3f4"
                },
                {
                  "product_retailer_id": "69c370c93cce32fbe56d5292"
                },
                {
                  "product_retailer_id": "69c3767efd71b5f79f071be2"
                },
                {
                  "product_retailer_id": "69c3726620de4f254d329f66"
                },
                {
                  "product_retailer_id": "69c375551b70fbcf1bc6de23"
                },
                {
                  "product_retailer_id": "69c37540872399ad6475fb58"
                },
                {
                  "product_retailer_id": "69c370f66a7528a70c1ed222"
                }
                // {
                //   "product_retailer_id": "69d7afb94dbce094f848f152"
                // },
                // {
                //   "product_retailer_id": "69d7b17fdde5ad5315a54e60"
                // },
                // {
                //   "product_retailer_id": "69d7afa7788108078f407223"
                // },
                // {
                //   "product_retailer_id": "69d7b01742a93f37862c5a6f"
                // },
                // {
                //   "product_retailer_id": "69d7afcd8dab33439457994c"
                // },
                // {
                //   "product_retailer_id": "69d7aff495734f580fe418ff"
                // },
                // {
                //   "product_retailer_id": "69d7b1b14dbce094f84bb3f1"
                // }
              ]
            }
        ]
      }
  }

    const template1 = {
      type: "product_list",
      header: { 
          type: "text",
          text: "Omnilife y Otros Cuidado del Hogar🧤"
        },
        body: {
          text: "Da clic aquí"
        },
        action: {
          catalog_id: "2277977052727019",
          sections: [
            {
            "title": "OMNILIFE",
              "product_items": [
              {
                "product_retailer_id": "69d7b1c995734f580fe64e44"
              },
              {
                "product_retailer_id": "69d7b1968dab3343945ac8d4"
              },
              {
                "product_retailer_id": "69d7b006556e9821476a9f1c"
              },
              {
                "product_retailer_id": "69d7aef6788108078f3f6b2f"
              },
              {
                "product_retailer_id": "69d7afb94dbce094f848f152"
              },
              {
                "product_retailer_id": "69d7b17fdde5ad5315a54e60"
              },
              {
                "product_retailer_id": "69d7afa7788108078f407223"
              },
              {
                "product_retailer_id": "69d7b01742a93f37862c5a6f"
              },
              {
                "product_retailer_id": "69d7afcd8dab33439457994c"
              },
              {
                "product_retailer_id": "69d7aff495734f580fe418ff"
              },
              {
                "product_retailer_id": "69d7b1b14dbce094f84bb3f1"
              },
            ]
          },
          {
            "title": "HOGAR",
              "product_items": [
                {
                  "product_retailer_id": "69c36f9620de4f254d31fbfc"
                },
                {
                  "product_retailer_id": "69c36fbd3cce32fbe56d3332"
                },
                {
                  "product_retailer_id": "69c36f66872399ad647527b2"
                },
                {
                  "product_retailer_id": "69c36f831b70fbcf1bc5e15e"
                },
                {
                  "product_retailer_id": "69c37523fd71b5f79f06fcc1"
                },
                {
                  "product_retailer_id": "69c375177896dea20a099a95"
                },
                {
                  "product_retailer_id": "69c372d2a88b9bc519bf0921"
                },
                {
                  "product_retailer_id": "69c374e175e6fcf877e49277"
                },
                {
                  "product_retailer_id": "69c374d0bfb27e5db6697fd0"
                },
                {
                  "product_retailer_id": "69c37214bfb27e5db6693290"
                },
                {
                  "product_retailer_id": "69c371ec7896dea20a092424"
                },
                {
                  "product_retailer_id": "69c37207872399ad647584d6"
                },
                {
                  "product_retailer_id": "69c371da20de4f254d327b69"
                },
                {
                  "product_retailer_id": "69c3734b20de4f254d32b1a7"
                },
                {
                  "product_retailer_id": "69c373733cce32fbe56da967"
                }
              ]
            },
            {
            "title": "MASCOTAS",
              "product_items": [
                {
                  "product_retailer_id": "69d50c45d35d817d1e9466a6"
                },
                {
                  "product_retailer_id": "69d50c682440c8c597a7976b"
                },
                {
                  "product_retailer_id": "69d50bdcc7687b049a2495be"
                },
                {
                  "product_retailer_id": "69d50c2c2440c8c597a71d71"
                },
            ]
          }
        ]
      }
  }
    //hacer un for para enviar ambos templates
    const templates = [template, template1, ];
    for (const temp of templates) {
       await whatsappService.sendProductList(to, temp);
    }
  }

  async catalogoMercado(to) {
    const template = { 
      type: "product_list",
      header: { 
          type: "text",
          text: "Salsas🥫 y Condimentos🧂"
        },
        body: {
          text: "da clic aquí"
        },
        action: {
          catalog_id: "2277977052727019",
          sections: [
          {
            "title": "SALSAS",
            "product_items": [
              {
                "product_retailer_id": "69c3661cbfb27e5db666ad95"
              },
              {
                "product_retailer_id": "69c369da3cce32fbe56bf103"
              },
              {
                "product_retailer_id": "69c3698cfd71b5f79f0473f8"
              },
              {
                "product_retailer_id": "69c36adc7896dea20a07a0f2"
              },
              {
                "product_retailer_id": "69c366e63cce32fbe56b2d46"
              },
              // {
              //   "product_retailer_id": "69c3699e872399ad6473ba11"
              // },
              // {
              //   "product_retailer_id": "69c36708bfb27e5db666e687"
              // },
              // {
              //   "product_retailer_id": "69c36a71872399ad6473e5ee"
              // },
              // {
              //   "product_retailer_id": "69c36a25872399ad6473d106"
              // },
              // {
              //   "product_retailer_id": "69c369c31b70fbcf1bc4a8a7"
              // },
              // {
              //   "product_retailer_id": "69c36a391b70fbcf1bc4c1e1"
              // },
              // {
              //   "product_retailer_id": "69c36981bfb27e5db6675521"
              // },
              {
                "product_retailer_id": "69c36acdfd71b5f79f04cfe9"
              },
              {
                "product_retailer_id": "69c36a046a7528a70c1d3960"
              },
              {
                "product_retailer_id": "69c366a620de4f254d3081e4"
              },
              {
                "product_retailer_id": "69c365f7872399ad6472c350"
              },
              {
                "product_retailer_id": "69c36b92a88b9bc519bcfa4a"
              },
              {
                "product_retailer_id": "69c36ba5bfb27e5db667aa24"
              }
            ]
          },
          {
            "title": "CONDIMENTOS",
              "product_items": [
                {
                "product_retailer_id": "69c36847fd71b5f79f0423f2"
              },
              {
                "product_retailer_id": "69c36b2420de4f254d316291"
              },
              {
                "product_retailer_id": "69c36b146a7528a70c1d8a3c"
              },
              {
                "product_retailer_id": "69c3677ffd71b5f79f040165"
              },
              {
                "product_retailer_id": "69c3676dbfb27e5db666fa9a"
              },
              {
                "product_retailer_id": "69c3682675e6fcf877e21b7a"
              },
              {
                "product_retailer_id": "69c36801a88b9bc519bbc966"
              },
              {
                "product_retailer_id": "69c368a07896dea20a07269e"
              },
              {
                "product_retailer_id": "69c36812bfb27e5db6671111"
              },
              {
                "product_retailer_id": "69c367f07896dea20a0714a5"
              },
              {
                "product_retailer_id": "69c36c7c6a7528a70c1df41d"
              },
              {
                "product_retailer_id": "69c36c4c872399ad64747ae6"
              },
              {
                "product_retailer_id": "69c36c591b70fbcf1bc535dc"
              },
              // {
              //   "product_retailer_id": "69c36c6f3cce32fbe56caa6c"
              // },
              {
                "product_retailer_id": "69c368367896dea20a071cd7"
              },
              {
                "product_retailer_id": "69c36793872399ad64732db2"
              },
              // {
              //   "product_retailer_id": "69c36c23bfb27e5db667eadb"
              // },
              {
                "product_retailer_id": "69c36c32fd71b5f79f05681c"
              },
              {
                "product_retailer_id": "69c36c8f872399ad64748db7"
              },
              {
                "product_retailer_id": "69c36b6d7896dea20a07c555"
              },
              {
                "product_retailer_id": "69c36b5175e6fcf877e2d105"
              }
            ]
          }
        ]
    }
    }
    const template1 = { 
      type: "product_list",
      header: { 
          type: "text",
          text: "Despensa 🍚🥚"
        },
        body: {
          text: "da clic aquí"
        },
        action: {
          catalog_id: "2277977052727019",
          sections: [
          {
            "title": "DESPENSA",
            "product_items": [
                {
                  "product_retailer_id": "69d5082a9bf0d32ae9a89dd9"
                },
                {
                  "product_retailer_id": "69d515d46b3269bbe4d22121"
                },
                {
                  "product_retailer_id": "69d515be49248df9f89af34c"
                },
                {
                  "product_retailer_id": "69d5159e337ef3c0ceb57793"
                },
                {
                  "product_retailer_id": "69d515396b3269bbe4d1468e"
                },
                {
                  "product_retailer_id": "69d516051e65c66f59c2b41b"
                },
                {
                  "product_retailer_id": "69d3c34649248df9f813421f"
                },
                {
                  "product_retailer_id": "69d51fb7337ef3c0cec20bf6"
                },
                {
                  "product_retailer_id": "69d54fc5c7687b049a9ab2a3"
                },
                {
                  "product_retailer_id": "69d51489d35d817d1e9d375b"
                },
                {
                  "product_retailer_id": "69d52151d35d817d1eadacb0"
                },
                {
                  "product_retailer_id": "69d521c46e4f7183de98964f"
                },
                {
                  "product_retailer_id": "69d54debc7687b049a962f65"
                },
                {
                  "product_retailer_id": "69d66ae82af86b6d19bdb6d0"
                },
                {
                  "product_retailer_id": "69d66c31bedddfd69a983531"
                },
                {
                  "product_retailer_id": "69d66c4e8ca23c347187357b"
                },
                {
                  "product_retailer_id": "69d51bd0c7687b049a355544"
                },
                // {
                //   "product_retailer_id": "69d66c848dab334394bd56ef" Café Sello Rojo x 425gr
                // },
                {
                  "product_retailer_id": "69d3c3a5524001f94ed19b3b"
                },
                {
                  "product_retailer_id": "69d66b9d2af86b6d19be9c3a"
                },
                {
                  "product_retailer_id": "69d54dbd9bf0d32ae9206c90"
                },
                {
                  "product_retailer_id": "69d7a6e9788108078f3727e8"
                },
                {
                  "product_retailer_id": "69d66bea8ca23c347186d446"
                },
                {
                  "product_retailer_id": "69d66c022c4e357a851cb95f"
                },
                {
                  "product_retailer_id": "69d66b45125e0f80537bfe1d"
                },
                {
                  "product_retailer_id": "69d50844d35d817d1e901ec3"
                },
                {
                  "product_retailer_id": "69d3c2f36b3269bbe44ec2fc"
                },
                {
                  "product_retailer_id": "69d3c302337ef3c0ce225f56"
                },
                {
                  "product_retailer_id": "69d3c1d05e7da3a2f60d01fd"
                },
                {
                  "product_retailer_id": "69d66a75125e0f80537b3814"
                },
                {
                  "product_retailer_id": "69d66a8842a93f3786982901"
                }
            ]
          }
        ]
      }
    }
    const template2 = { 
      type: "product_list",
      header: { 
          type: "text",
          text: "Panaderia 🍞🥐"
        },
        body: {
          text: "da clic aquí"
        },
        action: {
          catalog_id: "2277977052727019",
          sections: [
          {
            "title": "PANADERÍA",
            "product_items": [
                {
                  "product_retailer_id": "69d7a54b95734f580fdab370"
                },
                {
                  "product_retailer_id": "69d7a55a7a48182babe56ee0"
                },
                {
                  "product_retailer_id": "69d3c2db337ef3c0ce222874"
                },
                {
                  "product_retailer_id": "69d7a6a6dde5ad531599cc65"
                },
                {
                  "product_retailer_id": "69d7a72095734f580fdc70e3"
                },
                {
                  "product_retailer_id": "69d7a619788108078f366a2e"
                },
                {
                  "product_retailer_id": "69d7a7058dab3343944dff95"
                },
                {
                  "product_retailer_id": "69d7a51e4dbce094f83f186e"
                },
                {
                  "product_retailer_id": "69d90cafb200cc804d9bc648"
                },
                {
                  "product_retailer_id": "69d7a6f84dbce094f8408770"
                },
                {
                  "product_retailer_id": "69d7a737dde5ad53159a272d"
                },
                {
                  "product_retailer_id": "69d90c8cb200cc804d9b6e8b"
                },
                {
                  "product_retailer_id": "69d7a65d05edc105d44e4923"
                },
                {
                  "product_retailer_id": "69d7a642556e98214761ae63"
                },
                {
                  "product_retailer_id": "69d7a72c7a48182babe7e790"
                },
                {
                  "product_retailer_id": "69d7a52bdde5ad5315989943"
                },
                {
                  "product_retailer_id": "69d7a5398dab3343944be118"
                },
                {
                  "product_retailer_id": "69d7a6d6dde5ad531599fe40"
                },
                {
                  "product_retailer_id": "69d7a68842a93f37862277dc"
                },
                {
                  "product_retailer_id": "69d7a67c556e982147620314"
                },
                {
                  "product_retailer_id": "69d90d58def710fb3c879107"
                },
                {
                  "product_retailer_id": "69d7a698788108078f36f872"
                },
                {
                  "product_retailer_id": "69d90cf069b309cf44a57e06"
                }
            ]
          }
        ]
    }
    }
    //hacer un for para enviar ambos templates
    const templates = [template, template1, template2];
    for (const temp of templates) {
       await whatsappService.sendProductList(to, temp);
    }
  }

  async catalogoSubMercado(to) {
    const template = { 
      type: "product_list",
      header: { 
          type: "text",
          text: "Carnes Frías🥩 y Pescado🐟"
        },
        body: {
          text: "Da clic aquí"
        },
        action: {
          catalog_id: "2277977052727019",
          sections: [
          {
            "title": "CARNES FRÍAS",
              "product_items": [
                {
                  "product_retailer_id": "69d9139f69b309cf44adc8b4"
                },
                {
                  "product_retailer_id": "69d912def2b6880f9d9d4771"
                },
                {
                  "product_retailer_id": "69d913703393eb999423cfc9"
                },
                {
                  "product_retailer_id": "69d90f0fb200cc804d9de1a6"
                },
                {
                  "product_retailer_id": "69d90efd69b309cf44a7b8cb"
                },
                {
                  "product_retailer_id": "69d90ec7af2108383d2710a6"
                },
                {
                  "product_retailer_id": "69d90eda65d4204c37031c2d"
                },
                {
                  "product_retailer_id": "69d90f8bdef710fb3c89d069"
                },
                {
                  "product_retailer_id": "69d90f2cf600f1b5793c17f3"
                },
                {
                  "product_retailer_id": "69d911cd65d4204c3706ccdf"
                },
                {
                  "product_retailer_id": "69d90f71f2b6880f9d996971"
                },
                {
                  "product_retailer_id": "69d90eb7f2b6880f9d9882fb"
                },
                {
                  "product_retailer_id": "69d912482ec32e3834785f6c"
                },
                {
                  "product_retailer_id": "69d911f77da5b1ef28b7e997"
                },
                {
                  "product_retailer_id": "69d9128765d4204c3707b9c3"
                },
                {
                  "product_retailer_id": "69d912713393eb999422d717"
                },
                {
                  "product_retailer_id": "69d51ec1c7687b049a3995a7"
                },
                {
                  "product_retailer_id": "69d51ea26b3269bbe4dd2d29"
                }
            ]
          },
          {
            "title": "PESCADO",
              "product_items": [
                {
                  "product_retailer_id": "69d51cb71e65c66f59ca4ae7"
                },
                {
                  "product_retailer_id": "69d51f7049248df9f8a75233"
                },
                {
                  "product_retailer_id": "69d51f7f6b3269bbe4de4882"
                },
                {
                  "product_retailer_id": "69d521fdd35d817d1eae5554"
                }
              ]
          },
          {
            "title": "FRUTAS",
              "product_items": [
                {
                  "product_retailer_id": "69d8ff7d42a93f3786d6c182"
                },
                {
                  "product_retailer_id": "69d8ff93695e2ef9f7c05ffb"
                },
                {
                  "product_retailer_id": "69d90a85af2108383d22ab9b"
                },
                {
                  "product_retailer_id": "69d90a75f2b6880f9d93c142"
                },
                {
                  "product_retailer_id": "69d8feea681205cd21dd39f2"
                },
                {
                  "product_retailer_id": "69d8ff0442a93f3786d66d24"
                },
                {
                  "product_retailer_id": "69d8ff1858479361019fd609"
                }
              ]
          },
          // {
          //   "title": "CHOCOLATES",
          //     "product_items": [
          //       {
          //         "product_retailer_id": "69d90bfe7da5b1ef28b1fb68"
          //       },
          //       {
          //         "product_retailer_id": "69d9062e681205cd21e472e1"
          //       },
          //       {
          //         "product_retailer_id": "69d90b9df600f1b57937fecf"
          //       },
          //       {
          //         "product_retailer_id": "69d90be065d4204c37004155"
          //       },
          //       {
          //         "product_retailer_id": "69d90b51def710fb3c858ed7"
          //       },
          //       {
          //         "product_retailer_id": "69d906bee4843af3b4ff5d2b"
          //       },
          //       {
          //         "product_retailer_id": "69d9070bb0fb5071dcac759a"
          //       }
          //     ]
          // }
        ]
    }
  }
    return await whatsappService.sendProductList(to, template);
  }
  
  async catalogoSubMercado1(to) {
    const template = {
      type: "product_list",
      header: { 
          type: "text",
          text: "Lácteos 🥛"
        },
        body: {
          text: "Da clic aquí"
        },
        action: {
          catalog_id: "2277977052727019",
          sections: [
          {
            "title": "LÁCTEOS",
              "product_items": [
                {
                  "product_retailer_id": "69d90dbef2b6880f9d976373"
                },
                {
                  "product_retailer_id": "69d90d7ef600f1b5793a1334"
                },
                {
                  "product_retailer_id": "69d90d98f2b6880f9d9731d9"
                },
                {
                  "product_retailer_id": "69d8febd4dbce094f8ef84cf"
                },
                {
                  "product_retailer_id": "69d9083cf600f1b57933e64c"
                },
                {
                  "product_retailer_id": "69d908df2ec32e38346eea3e"
                },
                {
                  "product_retailer_id": "69d9082bdef710fb3c81f282"
                },
                {
                  "product_retailer_id": "69d8f9f6681205cd21d8bbaf"
                },
                {
                  "product_retailer_id": "69d8fa26b36510b69a645b18"
                },
                {
                  "product_retailer_id": "69d8f9dd531e7250784db28f"
                },
                {
                  "product_retailer_id": "69d90a62af2108383d22394c"
                },
                {
                  "product_retailer_id": "69d909bc3393eb999419af14"
                },
                {
                  "product_retailer_id": "69d909c965d4204c37fdd6a0"
                },
                {
                  "product_retailer_id": "69d90adab200cc804d99d6b6"
                },
                {
                  "product_retailer_id": "69d90b2c2ec32e38347174ed"
                },
                {
                  "product_retailer_id": "69d90b1969b309cf44a39ac0"
                },
                {
                  "product_retailer_id": "69d908eeb200cc804d975c74"
                },
                {
                  "product_retailer_id": "69d8fcaa4dbce094f8ee2454"
                },
                {
                  "product_retailer_id": "69d5198d49248df9f89f4016"
                },
                {
                  "product_retailer_id": "69d5196c337ef3c0ceb9b31f"
                },
                {
                  "product_retailer_id": "69d519269bf0d32ae9bac1cb"
                },
                {
                  "product_retailer_id": "69d51912deafcfb1d18dc905"
                },
                {
                  "product_retailer_id": "69d900755847936101a0b948"
                },
                {
                  "product_retailer_id": "69d90139376bb5d93eb4f576"
                },
                {
                "product_retailer_id": "69d8ffc8e4843af3b4f8896b"
                },
                {
                  "product_retailer_id": "69d90e4bf2b6880f9d982400"
                },
                {
                  "product_retailer_id": "69d90e59af2108383d26aef3"
                },
                {
                  "product_retailer_id": "69d90e34def710fb3c88c92c"
                },
                {
                  "product_retailer_id": "69d90a263393eb99941a3552"
                },
              ]
            }
        ]
    }
  }    
  const template1 = {
      type: "product_list",
      header: { 
          type: "text",
          text: "Yogures, Gelatinas🍧🍵"
        },
        body: {
          text: "Da clic aquí"
        },
        action: {
          catalog_id: "2277977052727019",
          sections: [
          {
            "title": "YOGURT",
              "product_items": [
              {
                "product_retailer_id": "69d8faeeb36510b69a6511fa"
              },
              {
                "product_retailer_id": "69d8fb01e4843af3b4f4c89c"
              },
              {
                "product_retailer_id": "69d8fb5ab36510b69a657b6d"
              },
              {
                "product_retailer_id": "69d8fa844dbce094f8ec9cbe"
              },
              {
                "product_retailer_id": "69d8fa9542a93f3786d28315"
              },
              {
                "product_retailer_id": "69d8fab1376bb5d93eae95db"
              },
              {
                "product_retailer_id": "69d90904f2b6880f9d92216c"
              },
              {
                "product_retailer_id": "69d9098165d4204c37fd94e7"
              },
              {
                "product_retailer_id": "69d91507f2b6880f9d9fd3fa"
              },
              {
                "product_retailer_id": "69d90e8b7da5b1ef28b49843"
              },
              {
                "product_retailer_id": "69d90e6af2b6880f9d98327d"
              },
              {
                "product_retailer_id": "69d90e783393eb99941ed516"
              },
              {
                "product_retailer_id": "69d90997def710fb3c838f37"
              },
              {
                "product_retailer_id": "69d8fa5d681205cd21d8f037"
              },
              {
                "product_retailer_id": "69d909a7b200cc804d983b8c"
              },
              {
                "product_retailer_id": "69d90a3bf2b6880f9d935a46"
              },
              {
                "product_retailer_id": "69d90de5f2b6880f9d97a3d1"
              },
              {
                "product_retailer_id": "69d90e0cb200cc804d9d0650"
              },
              {
                "product_retailer_id": "69d90df5af2108383d262841"
              },
              {
                "product_retailer_id": "69d8fb94531e7250784ecc1b"
              },
              {
                "product_retailer_id": "69d900d642a93f3786d7d7aa"
              },
              {
                "product_retailer_id": "69d900c9b0fb5071dca5d5d8"
              },
              {
                "product_retailer_id": "69d90dce3393eb99941de30d"
              }
            ]
          }
        ]
    }
  }    
    const templates = [template, template1];
    for (const temp of templates) {
       await whatsappService.sendProductList(to, temp);
    }
  }

  async catalogoSubMercado2(to) {
    const template = {
      type: "product_list",
      header: { 
          type: "text",
          text: "Bebidas🧃 y Jugos🥤"
        },
        body: {
          text: "Da clic aquí"
        },
        action: {
          catalog_id: "2277977052727019",
          sections: [
          {
            "title": "BEBIDAS",
              "product_items": [
                {
                  "product_retailer_id": "69d7abe5788108078f3bccc2"
                },
                {
                  "product_retailer_id": "69d8f716e4843af3b4f20bb4"
                },
                {
                  "product_retailer_id": "69d8f8484dbce094f8ea6794"
                },
                {
                  "product_retailer_id": "69d8f51642a93f3786ce4dad"
                },
                {
                  "product_retailer_id": "69d8f43a42a93f3786cda868"
                },
                {
                  "product_retailer_id": "69d8f4224dbce094f8e6e87a"
                },
                {
                  "product_retailer_id": "69d8f4634dbce094f8e74bd7"
                },
                {
                  "product_retailer_id": "69d7aba3dde5ad53159e73d7"
                },
                {
                  "product_retailer_id": "69d7c025dde5ad5315b2ea90"
                },
                {
                  "product_retailer_id": "69d8f34bb0fb5071dc9991f5"
                },
                {
                  "product_retailer_id": "69d7aec04dbce094f8484472"
                },
                {
                  "product_retailer_id": "69d7ae70dde5ad5315a0fcf2"
                },
                {
                  "product_retailer_id": "69d7ae997a48182babee925f"
                },
                {
                  "product_retailer_id": "69d8f48d681205cd21d4526c"
                },
                {
                  "product_retailer_id": "69d7d9fa8dab33439493075e"
                },
                {
                  "product_retailer_id": "69d7c09f788108078f540a43"
                },
                {
                  "product_retailer_id": "69d8f5ec695e2ef9f7b7009f"
                },
                {
                  "product_retailer_id": "69d8f254b0fb5071dc990c2f"
                },
                {
                  "product_retailer_id": "69d8f303584793610195e4bf"
                },
                {
                  "product_retailer_id": "69d8f59f695e2ef9f7b6bd98"
                },
                {
                  "product_retailer_id": "69d8f26942a93f3786cc0340"
                },
                {
                  "product_retailer_id": "69d8f2a0681205cd21d2565d"
                },
                {
                  "product_retailer_id": "69d8f56f42a93f3786cebf3c"
                },
                {
                  "product_retailer_id": "69d8f242681205cd21d218e3"
                },
                {
                  "product_retailer_id": "69d8f2dc681205cd21d29b03"
                },
                {
                  "product_retailer_id": "69d8f58c695e2ef9f7b6bca9"
                },
                {
                  "product_retailer_id": "69d8f2794dbce094f8e5ae37"
                },
                {
                  "product_retailer_id": "69d8f2b3e4843af3b4ef64a2"
                },
                {
                  "product_retailer_id": "69d907a0b200cc804d95c1f2"
                },
                {
                  "product_retailer_id": "69d907b17da5b1ef28ac78d2"
                }
            ]
          }
        ]
    }
  }
    const template1 = {
      type: "product_list",
      header: { 
          type: "text",
          text: "Gaseosas 🥤"
        },
        body: {
          text: "Da clic aquí"
        },
        action: {
          catalog_id: "2277977052727019",
          sections: [
          {
            "title": "GASEOSAS",
              "product_items": [
                {
                  "product_retailer_id": "69d8f409681205cd21d38f87"
                },
                {
                  "product_retailer_id": "69d7c00a42a93f37863d02b2"
                },
                {
                  "product_retailer_id": "69d7dc3e42a93f378669a0b2"
                },
                {
                  "product_retailer_id": "69d7dc3142a93f3786697f27"
                },
                {
                  "product_retailer_id": "69d7dc4b05edc105d4932f51"
                },
                {
                  "product_retailer_id": "69d7c07e05edc105d4689411"
                },
                {
                  "product_retailer_id": "69d8f69e58479361019907df"
                },
                {
                  "product_retailer_id": "69d7c0e54dbce094f85b9dc2"
                },
                {
                  "product_retailer_id": "69d7c040431c7881507665a5"
                },
                {
                  "product_retailer_id": "69d8f60db0fb5071dc9c7a90"
                },
                {
                  "product_retailer_id": "69d8f4d1b36510b69a601371"
                },
                {
                  "product_retailer_id": "69d8f4b9e4843af3b4f0be88"
                },
                {
                  "product_retailer_id": "69d8f6b8681205cd21d60138"
                },
                {
                  "product_retailer_id": "69d7ab92dde5ad53159e681e"
                },
                {
                  "product_retailer_id": "69d7ab7a7a48182babeb72c0"
                },
                {
                  "product_retailer_id": "69d7aaf042a93f3786274006"
                },
                {
                  "product_retailer_id": "69d7a79b05edc105d44f323f"
                },
                {
                  "product_retailer_id": "69d7a7b2788108078f379589"
                },
                {
                  "product_retailer_id": "69d7a78e8dab3343944e3d26"
                },
                {
                  "product_retailer_id": "69d7c554788108078f59a08d"
                },
                {
                  "product_retailer_id": "69d7c0ad4dbce094f85b63e2"
                },
                {
                  "product_retailer_id": "69d8f3c658479361019639b9"
                },
                {
                  "product_retailer_id": "69d8f83442a93f3786d0cf76"
                },
                {
                  "product_retailer_id": "69d8f31b42a93f3786cca375"
                },
                {
                  "product_retailer_id": "69d8f367695e2ef9f7b50525"
                },
                {
                  "product_retailer_id": "69d7c5634dbce094f861204d"
                },
                {
                  "product_retailer_id": "69d7c0d1431c78815076d218"
                },
                {
                  "product_retailer_id": "69d8f915376bb5d93ead1c42"
                },
                {
                  "product_retailer_id": "69d8f92842a93f3786d19ef5"
                },
                {
                  "product_retailer_id": "69d8f822e4843af3b4f2b521"
                }
            ]
          }
        ]
    }
  }    
  const template2 = {
      type: "product_list",
      header: { 
          type: "text",
          text: "Frutiños y Jugos"
        },
        body: {
          text: "Da clic aquí"
        },
        action: {
          catalog_id: "2277977052727019",
          sections: [
          {
            "title": "FRUTIÑOS",
              "product_items": [
                {
                  "product_retailer_id": "69d3c0854cb3c588620feb86"
                },
                {
                  "product_retailer_id": "69d3c03449248df9f80fca9b"
                },
                {
                  "product_retailer_id": "69d3c109719c4da024db4995"
                },
                {
                  "product_retailer_id": "69d3be276d06a3361b55decb"
                },
                {
                  "product_retailer_id": "69d3c1454cb3c588621092ec"
                },
                {
                  "product_retailer_id": "69d3c0b96b3269bbe44caf05"
                },
                {
                  "product_retailer_id": "69d3be4f4cb3c588620d5485"
                },
                {
                  "product_retailer_id": "69d3be3d719c4da024d90f26"
                },
                {
                  "product_retailer_id": "69d3c0d8337ef3c0ce207988"
                },
                {
                  "product_retailer_id": "69d3c1585e7da3a2f60c85e9"
                },
                {
                  "product_retailer_id": "69d3be956b3269bbe44aeca2"
                },
                {
                  "product_retailer_id": "69d3c16f49248df9f810d687"
                },
                {
                  "product_retailer_id": "69d3c06e6b3269bbe44c7d76"
                }
              ]
            },
            {
              "title": "GELATINAS",
              "product_items": [
              {
                "product_retailer_id": "69d508a12440c8c597a39a62"
              },
              {
                "product_retailer_id": "69d508b8d35d817d1e9078a2"
              },
              {
                "product_retailer_id": "69d508782440c8c597a38a79"
              },
              {
                "product_retailer_id": "69d50888d35d817d1e9052ab"
              },
              {
                "product_retailer_id": "69d509486b3269bbe4c55cce"
              },
              {
                "product_retailer_id": "69d508611e65c66f59b52f2a"
              }
            ]
          },
          {
            "title": "TÉS",
            "product_items": [
              {
                "product_retailer_id": "69d3bd97337ef3c0ce1cf54b"
              },
              {
                "product_retailer_id": "69d3bdf86d06a3361b55ce41"
              },
              {
                "product_retailer_id": "69d3bdba337ef3c0ce1d0cee"
              },
              {
                "product_retailer_id": "69d3bdcc4cb3c588620ca58f"
              }
            ]
          }
        ]
    }
  }    
    const templates = [template, template1, template2];
    for (const temp of templates) {
       await whatsappService.sendProductList(to, temp);
    }
  }

  async catalogoMercado4(to) {
    const template = { 
      type: "product_list",
      header: { 
          type: "text",
          text: "Desechables 🍴🗑️"
        },
        body: {
          text: "Da clic aquí"
        },
        action: {
          catalog_id: "2277977052727019",
          sections: [
          {
            "title": "DESECHABLES",
              "product_items": [
                {
                  "product_retailer_id": "69d50c951e65c66f59ba2702"
                },
                {
                  "product_retailer_id": "69d50cd9deafcfb1d180b2e3"
                },
                {
                  "product_retailer_id": "69d50d172440c8c597a86e99"
                },
                {
                  "product_retailer_id": "69d677378ca23c3471951fac"
                },
                {
                  "product_retailer_id": "69d677632c4e357a852bcf5f"
                },
                {
                  "product_retailer_id": "69d6774bcced254ef40ff5a8"
                },
                {
                  "product_retailer_id": "69d676fd8dab334394ca6f98"
                },
                {
                  "product_retailer_id": "69d6770cbedddfd69aa67dff"
                },
                {
                  "product_retailer_id": "69d6777b8dab334394cb2ec0"
                },
                {
                  "product_retailer_id": "69d50ed66e4f7183de842050"
                },
                {
                  "product_retailer_id": "69d677d0cced254ef4109640"
                },
                {
                  "product_retailer_id": "69d677fd2c4e357a852c7ed8"
                },
                {
                  "product_retailer_id": "69d50cafd35d817d1e94e831"
                },
                {
                  "product_retailer_id": "69d50dcb337ef3c0cead1612"
                },
                {
                  "product_retailer_id": "69d50cf5337ef3c0ceac84c8"
                },
                {
                  "product_retailer_id": "69d678638dab334394cc241e"
                },
                {
                  "product_retailer_id": "69d674d52c4e357a8528f30c"
                },
                {
                  "product_retailer_id": "69d67529b1a817c4190456a6"
                },
                {
                  "product_retailer_id": "69d674b22c4e357a852863d6"
                },
                {
                  "product_retailer_id": "69d6748fb1a817c41903407c"
                },
                // {
                //   "product_retailer_id": "69d674725f0010c7d1cc93ba"
                // },
                // {
                //   "product_retailer_id": "69d5154cdeafcfb1d1892f09"
                // },
                // {
                //   "product_retailer_id": "69d677e742a93f3786a7eaf9"
                // },
                // {
                //   "product_retailer_id": "69d6754dcced254ef40db883"
                // },
                // {
                //   "product_retailer_id": "69d675dccced254ef40e61be"
                // },
                // {
                //   "product_retailer_id": "69d675c65f0010c7d1ce7e41"
                // },
                // {
                //   "product_retailer_id": "69d6756442a93f3786a44867"
                // },
                // {
                //   "product_retailer_id": "69d676d1125e0f80538c8dec"
                // },
                // {
                //   "product_retailer_id": "69d67643bedddfd69aa5608d"
                // },
                // {
                //   "product_retailer_id": "69d675ed8ca23c3471936b2b"
                // },
              ]
          }, 
          {
            "title": "PAPELERÍA",
            "product_items": [
              {
                "product_retailer_id": "69d91b9bdef710fb3c98d280"
              },
              {
                "product_retailer_id": "69d91b843393eb99942cf57b"
              },
              {
                "product_retailer_id": "69d91bdc7da5b1ef28c4ba4a"
              },
            ]
          }
        ]
    }
  }
    return await whatsappService.sendProductList(to, template);
  }

  async encuesta(to) {
    const action = {
      name: "flow",
      parameters: {
        "flow_message_version": "3",
        "flow_id": "921146500280480",
        "flow_cta": "Encuesta"
      },
    }
    return await whatsappService.sendFlowEncuesta(to, action);
  }

  async catalogo(to) {
    const template = { 
      name: "catalogosamuelito ",
      language: { 
          code: "Es_Co" },
      components: [
          {
            type: "button",
            sub_type: "CATALOG",
            index: 0
          }
      ]
    };
    await whatsappService.sendMenu(to, template);
  }

  waiting = (delay, callback) => {
    setTimeout(callback, delay);
  };
  
  async handleMenuOption(to, option) {
    let response;
    idNumber["numero"] = to;
    switch (option) {
      case 'option_1':
        this.catalogoMercado(to);
        break;
      case 'option_2':
        this.catalogoSubMercado(to);
        break;
      case 'option_3':
        this.catalogoSubMercado1(to);
        break;
      case 'option_4':
        this.catalogoSubMercado2(to);
        break;
      case 'option_5':
        this.catalogoMercado4(to);
        break;
      case 'opcion_1':
        this.catalogoSubMercado3(to);
        break;
      case 'opcion_2':
        this.catalogoSubMercado4(to);
        break;
      case 'opcion_3':
        this.catalogoSubMercado5(to);
        break;
      case 'opt1':
        this.catalogoMercado2(to);
        break;
      case 'finalizar':
        await this.procesarRespuestaAsistente(to);
        break;
      case 'buscar':
        this.assistantState[to] = { step: 'question' };
        response = 'Dime que quieres comprar, por favor sé específico: ';
        break;
      default:
        response = "Oops😔\nPorfa, elige una de las opciones del menú o escribe *Hola* para volver a empezar";
    }
    if (response) {
      await whatsappService.sendMessage(to, response);
    }
  }

  async procesarRespuestaAsistente(to) {
    try {
      const respuestaAnterior = assistantResponseMap[to];
      
      if (!respuestaAnterior) {
        await whatsappService.sendMessage(to, "No encontré tu solicitud anterior. Por favor, intenta nuevamente.");
        return;
      }

      // Crear un prompt para que Gemini extraiga los IDs de los productos de la respuesta anterior
      const promptExtraccion = `
      [SISTEMA]: Basándote en la siguiente respuesta de una IA que sugirió productos, extrae SOLO los IDs de los productos que menciona a continuación:

"${respuestaAnterior}"

Responde ÚNICAMENTE con los IDs de los productos, uno por línea, sin explicaciones adicionales.
Si no hay IDs, responde: "No hay productos disponibles"
`;

      // Enviar a Gemini para extraer los IDs
      const idsProductos = await geminiService(promptExtraccion, to);
      // Si idsProductos es un string, convertirlo a un array dividiéndolo por saltos de línea
      let idsArray = [];
      if (typeof idsProductos === "string") {
        idsArray = idsProductos.split("\n").filter(id => id.trim() !== "");
      } else if (Array.isArray(idsProductos)) {
        idsArray = idsProductos;
      }
      for (const ids of idsArray) {
        await whatsappService.sendSingleProduct(to, ids);
      }
      // Limpiar la memoria
      delete assistantResponseMap[to];
    } catch (error) {
      console.error("Error en procesarRespuestaAsistente:", error);
      printDetailedError(error);
      await whatsappService.sendMessage(to, "Lo siento, hubo un error procesando tu solicitud 🔧");
    }
  }

  async handleHiringFlow(to, pedido, datosPedido) {
    let response;

    response = `*Tu compra:*

${pedido}

Total: $${datosPedido.monto.toLocaleString('es-CO')} COP`;
  await this.menuPedido(to);
  await whatsappService.sendMessage(to, response);
  }

  async respFlow(to, screen, datosPedido, pedidoStr) {
    let response;
    if (screen === "SUMMARY") {
      if (datosPedido.datos.address) {
        (datosPedido.monto += 3000).toLocaleString('es-CO');
      }
      if (datosPedido.datos.pago === "Efectivo") {
        const templateVars = [
          datosPedido.datos.name,
          datosPedido.datos.address,
          pedidoStr,
          datosPedido.monto
        ];
        await whatsappService.sendTemplateMediaMessage(
          "https://sorteo-chatbot.s3.us-east-1.amazonaws.com/descarga.jfif",
          templateVars
        );
        response = "✅¡Pedido recibido!\nPronto nos pondremos en contacto contigo! 🤗";
        // await this.menuOpcionalHiring(to);
      } else if (datosPedido.datos.pago === "Codigo QR") { //Era antes PSE
        try {
          userOrderDataMap[to] = {
            ...datosPedido.datos,
            monto: datosPedido.monto,
            pedidoStr
          };
          // Enviar imagen de codigo QR con sendmediaMessage
          response = `*Resumen de tu compra*🛒:\n\n${pedidoStr}\n*Total:* $${datosPedido.monto.toLocaleString('es-CO')} COP`;
          await this.sendMediaQR(to);
        } catch (error) {
          response = "Hubo un problema al enviar el código QR. Por favor, intenta nuevamente.";
        }
    } else if (datosPedido.datos.pago === "Transferencia") {
      userOrderDataMap[to] = {
        ...datosPedido.datos,
        monto: datosPedido.monto,
        pedidoStr
      };
        response = `*Resumen de tu compra*🛒:\n\n${pedidoStr}\n*Total:* $${datosPedido.monto.toLocaleString('es-CO')} COP\n\n🏦Cuentas bancarias:\n\n*Nequi/Daviplata:* 3233082273\n\n*Bancolombia Ahorros:* 70416357747\n\n*Llave (Bre-B):* 0089662634\n\n🚨 Luego, envíanos el comprobante de la transferencia (captura) para confirmar tu pago 😊`;
      }
   } else if (screen === "RATE") {
    response = "¡Recibido!\nMuchas gracias por tu opinión! 🤗";
  }
  if (response) {
    await whatsappService.sendMessage(to, response);
  }
}

async handleWompiEvent(transaction) {
    try {
      const transactionId = transaction.id;
      const paymentLinkId = transaction.payment_link_id;
      const phone = transactionToPhoneMap[paymentLinkId];
      const spreadsheetId = process.env.SPREADSHEETID_PEDIDO;
      
      if (!phone) {
      console.error("No se encontró el número de WhatsApp para la transacción:", paymentLinkId);
      return;
      }
      let status;
      try {
        status = await getWompiTransactionStatus(transactionId);
      } catch (error) {
        console.error("Error consultando el estado de la transacción:", error);
        return;
      }

      let estadoPago;
    if (status === "APPROVED") {
      estadoPago = "Pagado";
    }
    if (status === "DECLINED" || status === "VOIDED") {
      estadoPago = "Rechazado";
    } else {
      estadoPago = "Pendiente";
    }
    const fechayhora = paymentRowMap[phone]
    await saveUserDataByNumber({ numero: phone, fechayhora, estado: estadoPago }, spreadsheetId);

      let statusMsg = "";
      if (status === "APPROVED") {
        statusMsg = "✅ ¡Pago aprobado!\nTu pedido está confirmado.\nPronto nos pondremos en contacto contigo.";
        await this.menuOpcionalHiring(phone);
      } else if (status === "DECLINED") {
        statusMsg = "❌ El pago fue rechazado\nPor favor, revisa tu medio de pago. Si deseas reintentar, utiliza el mismo link de pago que te enviamos anteriormente.";
      } else if (status === "VOIDED") {
        statusMsg = "⚠️ El pago fue anulado\nSi tienes dudas, contáctanos. Si deseas reintentar, utiliza el mismo link de pago que te enviamos anteriormente.";
      } else if (status === "ERROR") {
        statusMsg = "⚠️ Tu método de pago está presentando Error.\nPor favor, revísalo e intenta nuevamente.";
      } else if (status === "PENDING") {
        statusMsg = "⏳ Tu pago está pendiente de confirmación.\nTe avisaremos cuando se apruebe.";
      } else {
        statusMsg = `El estado de tu transacción es: ${status}`;
      }
 
        await whatsappService.sendMessage(phone, statusMsg);

    } catch (error) {
      console.error("Error en handleWompiEvent:", error);
    }
  }

  async helpMenu(to) {
    const response = "Bienvenido al menú de ayuda de *La Estación*\n\nPara solicitar la carta escribe *Carta*\nPara hablar con un asesor escribe *Asesor*\nPara solicitar la ubicación escribe *Ubicacion*\n\nEspero te sirva! 😊"
  
    await whatsappService.sendMessage(to, response);
  }

  async sendMedia(to) {
    const mediaUrl = 'https://micarta.s3.us-east-1.amazonaws.com/menu%CC%81+nuevo+Samuelito+Agosto+2025.pdf';
    const caption = '¡Aquí tienes la carta!';
    const type = 'document';

    await whatsappService.sendMediaMessage(to, type, mediaUrl, caption);
  }
  
  async sendMediaQR(to) {
    const mediaUrl = 'https://sorteo-chatbot.s3.us-east-1.amazonaws.com/Codigo-QR.jpeg';
    const caption = '¡Envíanos el comprobante de la transferencia (captura) para confirmar tu pedido 😊!';
    const type = 'image';

    await whatsappService.sendMediaMessage(to, type, mediaUrl, caption);
  }

  completeHiring(productos, data, total, numero) {
    let fechayhora = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
    let userData;
    const spreadsheetId = process.env.SPREADSHEETID_PEDIDO;
    (total += 3000).toLocaleString('es-CO');
      userData = [
        numero,
        data.name,
        productos,
        data.address,
        data.pago,
        total.toLocaleString('es-CO'),
        data.recomendacion,
        fechayhora,
      ]
    paymentRowMap[numero] = fechayhora;
    appendToSheet(userData, spreadsheetId);
  }
  
completeOrder(productos, data) {
  const orders = productos.map(item => ({
    product: item.product_retailer_id,
    locationStock: "69c0dcf5e903bd1b34167345",
    quantity: item.quantity,
    unit_price: item.item_price,
    notes: data.recomendacion || ""
  }));

  // Si hay domicilio, agrégalo como un producto más (puedes asignar área si lo deseas)
  // if (data.address) {
  //   orders.push({
  //     product: "677ad5b1b4797f0dcba09e41",
  //     locationStock: "5d4619b4a8337b56866de6ff",
  //     quantity: 1,
  //     unit_price: 3000,
  //     notes: "Domicilio"
  //   });
  // }

  const pedidoLoggro = {
    table: "69d2d1a47647733152bb5d48",
    groupName: `Nombre: ${data.name}\nDirección: ${data.address}\n`,
    orders
  };

  enviarPedidoALoggro(pedidoLoggro);
}

  completeSurvey(data) {
    let fechayhora = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
    let userData;
    const spreadsheetId = process.env.SPREADSHEETID_SURVEY;
    const numero = idNumber["numero"] || "No disponible";
      userData = [
        numero,
        data.experiencia_cliente,
        data.servicio_cliente,
        data.calidad_comida,
        data.recomendacion,
        data.comentarios,
        fechayhora,
      ]

    appendToSheet(userData, spreadsheetId);
  }

  async handleAssistantFlow(to, message) {
    const state = this.assistantState[to];
    let response;

    const menuMessage = "¿Esto es lo que quieres?";
    const buttons = [
      { type: 'reply', reply: { id: 'finalizar', title: "Si, Gracias 😊" } },
      { type: 'reply', reply: { id: 'buscar', title: 'No, corregir' } },
      // { type: 'reply', reply: { id: '', title: 'Hablar con asesor 🤵' } }
    ];

    switch (state.step) {
      case 'question':
        response = await geminiService(message, to);
        // Guardar la respuesta de Gemini en memoria para procesarla después
        assistantResponseMap[to] = response;
        break;
      default:
        response = "Lo siento 😔 no entendí tu respuesta\nPor Favor, elige una de las opciones del menú.";
    }

    delete this.assistantState[to];
    await whatsappService.sendMessage(to, response);
    await whatsappService.sendInteractiveButtons(to, menuMessage, buttons);
  }

  async handleAssistant(userId, message) {
    try {
      // Obtener respuesta de Gemini con memoria de conversación
      const response = await geminiService(message, userId);
      
      // Enviar respuesta al usuario
      await whatsappService.sendMessage(userId, response);
    } catch (error) {
      console.error("Error en handleAssistant:", error);
      printDetailedError(error);
      await whatsappService.sendMessage(userId, "Lo siento, estoy teniendo problemas técnicos. Intenta nuevamente 🔧");
    }
  }

  async sendContact(to) {
    const contact = {
      addresses: [
        {
          street: "Calle 10 #9-133",
          city: "La Loma",
          state: "Cesar",
          zip: "201038",
          country: "Colombia",
          country_code: "CO",
          type: "WORK"
        }
      ],
      emails: [
        {
          email: "samuelitorestobar@gmail.com",
          type: "WORK"
        }
      ],
      name: {
        formatted_name: "La Estación Blacks",
        first_name: "La Estación",
        last_name: "Blacks",
        middle_name: "",
        suffix: "",
        prefix: ""
      },
      org: {
        company: "La Estación",
        department: "Atención al Cliente",
        title: "Representante"
      },
      phones: [
        {
          phone: "+573113509246",
          wa_id: "573113509246",
          type: "WORK"
        }
      ],
      urls: [
        {
          url: "https://www.samuelitorestobar.com/",
          type: "WORK"
        }
      ]
    };

    await whatsappService.sendContactMessage(to, contact);
  }

  async sendLocation(to) {
    const latitude = 9.619971;
    const longitude = -73.592176;
    const name = 'La Estación';
    const address = 'Cll 10 #9-133, La Loma, El Paso, Cesar'

    await whatsappService.sendLocationMessage(to, latitude, longitude, name, address);
  }

}

export default new MessageHandler();
