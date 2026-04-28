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

class MessageHandler {

  constructor() {
    this.appointmentState = {};
    this.assistandState = {};
  }

  async handleIncomingMessage(message, senderInfo, screen, datosPedido, pedidoStr) {
    try {
      if (message?.type === 'text') {
        const incomingMessage = message.text.body.toLowerCase().trim();
        const userId = message.from;
        if (this.isGreeting(incomingMessage)) {
          await this.sendWelcomeMessage(userId, senderInfo);
          await this.sendWelcomeMenu(userId);
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
      }
    } catch (error) {
      printDetailedError(error);
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

  async sendWelcomeMenu(to) {
  const listMessage = {
    type: "interactive",
    interactive: {
      type: "list",
      body: {
        text: "Da clic abajo para ver los productos"
      },
      action: {
        button: "Comprar",
        sections: [
          {
            title: "Mercado 🛒🛍️",
            rows: [
              {
                id: "option_1",
                title: "Salsas🥫 y Condimentos🧂"
              },
              {
                id: "option_2",
                title: "Carnes frías🥩 y Frutas🍎🍓"
              },
              {
                id: "option_3",
                title: "Bebidas🧃 y Gaseosas🥤"
              }
            ]
          },
          {
            title: "Cuidado Personal🧴y Hogar",
            rows: [
              {
                id: "opcion_1",
                title: "Personal🧴🧼"
              },
              {
                id: "opcion_2",
                title: "Medicamentos 💊",
              }
            ]
          }
        ]
      }
    }
  };

  await whatsappService.sendListMessage(to, listMessage);
}

  async otrasCategorias(to) {
    const menuMessage = "Elige la subcategoría: ";
    const buttons = [
      {
        type: 'reply', reply: { id: 'opt1', title: 'Pasabocas🍭y Mekatos🍿' }
      },
      {
        type: 'reply', reply: { id: 'opt2', title: 'Gaseosas🥤' }
      }
    ];

    await whatsappService.sendInteractiveButtons(to, menuMessage, buttons);
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
          text: "Da clic aquí"
        },
        action: {
          catalog_id: "2277977052727019",
          sections: [
          {
            "title": "CUIDADO PERSONAL",
            "product_items": [
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
              },
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
                "product_retailer_id": "69c4bdb0309b847b30a48d28"
              },
              {
                "product_retailer_id": "69c4bd88fd71b5f79fb212f6"
              },
              {
                "product_retailer_id": "69d3b73d719c4da024d31223"
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
            ]
          },
        ]
      }
  }
    return await whatsappService.sendProductList(to, template);
  }

  async catalogoMercado2(to) {
    try {
      const template = {
        name: "menucarta",
        language: {
          code: "Es_Co"
        },
        components: [
          {
            type: "button",
            sub_type: "MPM",
            index: 0,
            "parameters": [
          {
            "type": "action",
            "action": {
              "sections": [
                {
                  "title": "Pasabocas Mekatos",
                  "product_items": [
                    {
                      "product_retailer_id": "69c226dbfd71b5f79f61d16b"
                    },
                    {
                      "product_retailer_id": "69c22250fd71b5f79f615912"
                    },
                    {
                      "product_retailer_id": "69c226571a3df39f1103359e"
                    },
                    {
                      "product_retailer_id": "69c223cf1a3df39f1102f5d7"
                    },
                    {
                      "product_retailer_id": "69c223e2335b9ea55fef2c33"
                    },
                    {
                      "product_retailer_id": "69c2283df055928f6dde88c4"
                    },
                    {
                      "product_retailer_id": "69c228677896dea20a71f4b8"
                    },
                    {
                      "product_retailer_id": "69c228241a3df39f110363d3"
                    },
                    {
                      "product_retailer_id": "69c2284e1a3df39f11036503"
                    },
                    {
                      "product_retailer_id": "69c227bc7bff33f4a3232df4"
                    },
                    {
                      "product_retailer_id": "69c2233c7bff33f4a32253bd"
                    },
                    {
                      "product_retailer_id": "69c228a81a3df39f1103714a"
                    },
                    {
                      "product_retailer_id": "69c222bf19d90721373eeb73"
                    },
                    {
                      "product_retailer_id": "69c222f17bff33f4a3224ce7"
                    },
                    {
                      "product_retailer_id": "69c228bc7896dea20a71fafe"
                    },
                    {
                      "product_retailer_id": "69c22273b5b1d14e31819fff"
                    },
                    {
                      "product_retailer_id": "69c22327335b9ea55fef1534"
                    },
                    {
                      "product_retailer_id": "69c22898f055928f6dde8aed"
                    },
                    {
                      "product_retailer_id": "69c222da335b9ea55fef097d"
                    },
                    {
                      "product_retailer_id": "69c22310fd71b5f79f61659e"
                    },
                    {
                      "product_retailer_id": "69c22886335b9ea55ff03046"
                    },
                    {
                      "product_retailer_id": "69c222889d3d40869967bb05"
                    },
                    {
                      "product_retailer_id": "69c228d7fd71b5f79f62036b"
                    },
                    {
                      "product_retailer_id": "69c226bc7bff33f4a32302cd"
                    },
                    {
                      "product_retailer_id": "69c21d5e7896dea20a70a2e9",
                    },
                    {
                      "product_retailer_id": "69c21a527896dea20a701c05"
                    },
                    {
                      "product_retailer_id": "69c21d841a3df39f110203a4"
                    },
                    {
                      "product_retailer_id": "69c21da2fd71b5f79f609c2e"
                    },
                    {
                      "product_retailer_id": "69c21d481a3df39f1101fd6e"
                    },
                    {
                      "product_retailer_id": "69c21d367896dea20a709b9b"
                    }
                  ]
                }
              ]
            }
          }
        ]
          }
      ] 
  }
    return await whatsappService.sendMenu(to, template);
  }
  catch (error) {
      printDetailedError(error);
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
            ]
          },
          // {
          //   "title": "Cuidado Y Aseo Del Hogar",
          //     "product_items": [
          //       {
          //         "product_retailer_id": "69c3723e1b70fbcf1bc67a83"
          //       },
          //       {
          //         "product_retailer_id": "69c374a2a88b9bc519bf3251"
          //       },
          //       {
          //         "product_retailer_id": "69c372a37896dea20a094364"
          //       },
          //       {
          //         "product_retailer_id": "69c376d920de4f254d32fb19"
          //       },
          //       {
          //         "product_retailer_id": "69c376ce1b70fbcf1bc6f723"
          //       },
          //       {
          //         "product_retailer_id": "69c4bcb67362d1fe0b8b6221"
          //       },
          //       {
          //         "product_retailer_id": "69c4bca3cfdc708e20239bfe"
          //       },
          //       {
          //         "product_retailer_id": "69c4b5f31b70fbcf1b6db8cd"
          //       },
          //       {
          //         "product_retailer_id": "69c4b86d1b70fbcf1b6eca0f"
          //       },
          //       {
          //         "product_retailer_id": "69c4b808cfdc708e20219966"
          //       },
          //       {
          //         "product_retailer_id": "69c4b7b5309b847b30a2d4b8"
          //       },
          //       {
          //         "product_retailer_id": "69c215ec9d3d408699650a87"
          //       },
          //       {
          //         "product_retailer_id": "69c2152bb5b1d14e317ea6b1"
          //       },
          //       {
          //         "product_retailer_id": "69c36fd8872399ad64754151"
          //       },
          //       {
          //         "product_retailer_id": "69c36e617896dea20a088c7e"
          //       },
          //       {
          //         "product_retailer_id": "69c36e7a6a7528a70c1e9c10"
          //       },
          //       {
          //         "product_retailer_id": "69c36e5075e6fcf877e38f55"
          //       },
          //       {
          //         "product_retailer_id": "69c36f9620de4f254d31fbfc"
          //       }
          //   ]
          // }
        ]
      }
  }
    return await whatsappService.sendProductList(to, template);
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
    
    return await whatsappService.sendProductList(to, template);
  }

  async catalogoSubMercado(to) {
    const template = { 
      type: "product_list",
      header: { 
          type: "text",
          text: "Carnes Frías🥩 y Frutas🍎🍓"
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
          }
        ]
    }
  }
    
    return await whatsappService.sendProductList(to, template);
  }
  
  async catalogoSubMercado2(to) {
    const template = { 
      type: "product_list",
      header: { 
          type: "text",
          text: "Bebidas y Gaseosas"
        },
        body: {
          text: "Gaseosas"
        },
        action: {
          catalog_id: "2277977052727019",
          sections: [
          {
            "title": "Gaseosas",
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
                  "product_retailer_id": "69d8f409681205cd21d38f87"
                },
                {
                  "product_retailer_id": "69d7aba3dde5ad53159e73d7"
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
                // MEKATOS 
                // {
                //   "product_retailer_id": "69c21a36817aaac0ae64710f"
                // },
                // {
                //   "product_retailer_id": "69c22941f055928f6dde94a6"
                // },
                // {
                //   "product_retailer_id": "69c2292d335b9ea55ff03f29"
                // },
                // {
                //   "product_retailer_id": "69c229861a3df39f1103940a"
                // },
                // {
                //   "product_retailer_id": "69c22974f055928f6ddeaf79"
                // },
                // {
                //   "product_retailer_id": "69c229c17bff33f4a3236ae3"
                // },
                // {
                //   "product_retailer_id": "69c229591a3df39f11038692"
                // },
                // {
                //   "product_retailer_id": "69c2299a7896dea20a720b75"
                // },
                // {
                //   "product_retailer_id": "69c229aefd71b5f79f6223dc"
                // },
                // {
                //   "product_retailer_id": "69c2272d335b9ea55ff00c70"
                // },
                // {
                //   "product_retailer_id": "69c227447bff33f4a3232346"
                // },
                // {
                //   "product_retailer_id": "69c22759fd71b5f79f61eb82"
                // },
                // {
                //   "product_retailer_id": "69c2277ab5b1d14e3182ae9e"
                // },
                // {
                //   "product_retailer_id": "69c2212a9d3d408699676377"
                // },
                // {
                //   "product_retailer_id": "69c220e8b5b1d14e31816ce2"
                // },
                // {
                //   "product_retailer_id": "69c22138817aaac0ae65a6e3"
                // },
                // {
                //   "product_retailer_id": "69c226a1335b9ea55feff903"
                // },
                // {
                //   "product_retailer_id": "69c226fbf055928f6dde602b"
                // },
                // {
                //   "product_retailer_id": "69c229007896dea20a71ff28"
                // },
                // {
                //   "product_retailer_id": "69c21ec7fd71b5f79f60e11d"
                // },
                // {
                //   "product_retailer_id": "69c21a8c1a3df39f110186d9"
                // },
                // {
                //   "product_retailer_id": "69c21aa1f055928f6ddccea7"
                // },
                // {
                //   "product_retailer_id": "69c21cf419d90721373dff0d"
                // },
                // {
                //   "product_retailer_id": "69c219c37896dea20a6ff600"
                // },
                // {
                //   "product_retailer_id": "69c21ca57896dea20a707d24"
                // },
                // {
                //   "product_retailer_id": "69c21cce19d90721373dfa55"
                // },
                // {
                //   "product_retailer_id": "69c21a0419d90721373d56d4"
                // },
                // {
                //   "product_retailer_id": "69c21c7af055928f6ddd2b44"
                // },
                // {
                //   "product_retailer_id": "69c21d06817aaac0ae64ef6d"
                // },
                // {
                //   "product_retailer_id": "69c21cbb9d3d40869966cedb"
                // }
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
    switch (option) {
      case 'option_1':
        idNumber["numero"] = to;
        this.catalogoMercado(to);
        break;
      case 'option_2':
        idNumber["numero"] = to;
        this.catalogoSubMercado(to);
        break;
      case 'option_3':
        this.catalogoSubMercado2(to);
        break;
      case 'opcion_1':
        this.catalogoSubMercado3(to);
        break;
      case 'opcion_2':
        this.catalogoSubMercado4(to);
        break;
      case 'opcion_3':
        // this.catalogoSubMercado2(to);
        break;
      case 'opt1':
        this.catalogoMercado2(to);
        break;
      case 'opt2':
        this.catalogoGaseosas(to);
        break;
      default:
        response = "Oops😔\nPorfa, elige una de las opciones del menú o escribe *Hola* para volver a empezar\nTambién, escribe *Carta* para verla.";
    }
    if (response) {
      await whatsappService.sendMessage(to, response);
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
        response = "✅¡Pedido recibido!\nPronto nos pondremos en contacto contigo! 🤗";
        // await this.menuOpcionalHiring(to);
      } else if (datosPedido.datos.pago === "PSE") {
        try {
          // Generar enlace de pago WOMPi
          const idlink = await createWompiPaymentLink(
            datosPedido.monto * 100, // Monto en centavos
            "COP",
            pedidoStr
          );
          transactionToPhoneMap[idlink] = to;
          // Enviar mensaje con el enlace de pago
          response = `*Resumen de tu compra*🛒:\n\n${pedidoStr}\n*Total:* $${datosPedido.monto.toLocaleString('es-CO')} COP\n\nUtiliza el siguiente *link de pago*:\n\nhttps://checkout.wompi.co/l/${idlink}\n\nLuego, al realizar el pago automáticamente te lo confirmamos! 😊`;
        } catch (error) {
          response = "Hubo un problema al generar el enlace de pago. Por favor, intenta nuevamente.";
        }
    } else if (datosPedido.datos.pago === "Transferencia") {
      userOrderDataMap[to] = {
        ...datosPedido.datos,
        monto: datosPedido.monto,
        pedidoStr
      };
        response = `*Resumen de tu compra*🛒:\n\n${pedidoStr}\n*Total:* $${datosPedido.monto.toLocaleString('es-CO')} COP\n\n🏦Cuentas bancarias:\n\n*Nequi:* \n\n*Bancolombia Ahorros:* \n\n🚨 Luego, envíanos el comprobante de la transferencia (captura) para confirmar tu pedido 😊`;
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
  
  async sendMediaEvento(to) {
    const mediaUrl = 'https://micarta.s3.us-east-1.amazonaws.com/Reserva+tu+mesa.jpg';
    // const caption = '¡Reserva tu mesa!';
    const type = 'image';

    await whatsappService.sendMediaMessage(to, type, mediaUrl);
  }

  completeHiring(productos, data, total) {
    let fechayhora = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
    let userData;
    const spreadsheetId = process.env.SPREADSHEETID_PEDIDO;
    const numero = idNumber["numero"] || "No disponible";
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
    const state = this.assistandState[to];
    let response;

    const menuMessage = "¿Resolví tu pregunta?";
    const buttons = [
      { type: 'reply', reply: { id: 'option_4', title: "Si, Gracias 😊" } },
      { type: 'reply', reply: { id: 'option_3', title: 'Hacer otra pregunta' } },
      { type: 'reply', reply: { id: 'op_3', title: 'Hablar con asesor 🤵' } }
    ];

    switch (state.step) {
      case 'question':
        response = await geminiService(message);
        break;
      default:
        response = "Lo siento 😔 no entendí tu respuesta\nPor Favor, elige una de las opciones del menú.";
    }

    delete this.assistandState[to];
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
