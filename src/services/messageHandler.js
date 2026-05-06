import whatsappService from './whatsappService.js';
import appendToSheet from './googleSheetsService.js';
import geminiService from './geminiService.js';
import { createWompiPaymentLink, getWompiTransactionStatus } from './wompiService.js';
import { enviarPedidoALoggro } from './loggroService.js';
import { saveUserDataByNumber } from './googleSheetsService.js';
import { printDetailedError } from './printDetailError.js';
import { downloadImageFromMeta } from './httpRequest/sendToWhatsApp.js';
import { uploadToPublicStorage } from './awsS3Service.js';

function isWithinBusinessHours() {
  // Hora actual en Colombia (GMT-5)
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const colombiaTime = new Date(utc - (5 * 60 * 60000));
  const hour = colombiaTime.getHours();
  const minute = colombiaTime.getMinutes();

  // Horario: 12:00 (12 p.m.) a 22:00 (10 p.m.)
  const opening = 16 * 60; // 4:00 p.m. en minutos
  const closing = 22 * 60; // 10:00 p.m. en minutos
  const current = hour * 60 + minute;

  return current >= opening && current < closing;
}

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

  async handleIncomingMessage(message) {
    try {
      if (message?.type === 'text') {
        const incomingMessage = message.text.body.toLowerCase().trim();
        const userId = message.from;
        
        // Procesar con Gemini pasando el ID del usuario
        await this.handleAssistant(userId, incomingMessage);
        await whatsappService.markAsRead(message.id);
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

  isReservation(message) {
    const lower = message.toLowerCase();
    return (
      lower.includes('reservar') ||
      lower.includes('reserva') ||
      lower.includes('reservacion') ||
      lower.includes('reservación')
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

  async sendWelcomeMessage(to, messageId, senderInfo) {
    try {
        const name = this.getSenderName(senderInfo).match(/^(\w+)/)?.[1];
        const welcomeMessage = `¡Hola 👋 ${name}!\nBienvenid@ a *La Estación*🌭🍔🍟🍕\n\n¿Qué deseas disfrutar hoy? 😊\n\nEscribe *ayuda* si la necesitas`;
        await whatsappService.sendMessage(to, welcomeMessage, messageId);
    } catch (error) {
      printDetailedError(error);
    }
  }

  async sendWelcomeMenu(to) {
    const menuMessage = "¿Qué deseas hacer?";
    const buttons = [
      {
        type: 'reply', reply: { id: 'option_1', title: 'Pedir 🛒' }
      },
      // {
      //   type: 'reply', reply: { id: 'option_2', title: 'Reservar 📋' }
      // },
      // {
      //   type: 'reply', reply: { id: 'option_3', title: 'Preguntar 🤖' }
      // }
    ];

    await whatsappService.sendInteractiveButtons(to, menuMessage, buttons);
  }

  async menuOpcional(to) {
    const menuMessage = "Elige la categoría:";
    const buttons = [
      {
        type: 'reply', reply: { id: 'opt1', title: 'Comidas Rápidas🍔' }
      },
      {
        type: 'reply', reply: { id: 'opt2', title: 'Blacks Pizzas🍕' }
      },
      {
        type: 'reply', reply: { id: 'opt3', title: 'Heladería Yellow🍦' }
      }
    ];

    await whatsappService.sendInteractiveButtons(to, menuMessage, buttons);
  }

  async botonSi(to) {
    const menuMessage = "¿Deseas bebida🍹🍸 o postre? 🍨🥞 ";
    const buttons = [
      {
        type: 'reply', reply: { id: 'si', title: 'Sí ✅' }
      }
    ];

    await whatsappService.sendInteractiveButtons(to, menuMessage, buttons);
  }

  async menuPedido(to) {
    const action = {
      name: "flow",
      parameters: {
        "flow_message_version": "3",
        "flow_id": "992235826682822",
        "flow_cta": "Pedido"
      },
    }
    return await whatsappService.sendFlow(to, action);
  }
  
  async menuReserva(to) {
    idNumber["numero"] = to;
    const action = {
      name: "flow",
      parameters: {
        "flow_message_version": "3",
        "flow_id": "2158370944705175",
        "flow_cta": "Reserva"
      },
    }
    return await whatsappService.sendFlowReserva(to, action);
  }

  async getDia() {
    // Día de la semana
  const now = new Date();
  const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const diaSemana = dias[now.getDay()];

  return diaSemana
  }
  
async menuCarta(to) {
  let template;
  if (await this.getDia()==="Domingo") {
    template = { 
      name: "catalogo",
      language: { 
          code: "Es_Co" },
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
                  "title": "ASADOS AL BARRIL",
                  "product_items": [
                    {
                      "product_retailer_id": "6133f09d5af774183ce25e0f"
                    },
                    {
                      "product_retailer_id": "6133e891d145504ca38cbeeb"
                    },
                    {
                      "product_retailer_id": "6133f070d145504ca38cbf3a"
                    }
                  ]
                },
                {
                  "title": "PARA PICAR",
                  "product_items": [
                    {
                      "product_retailer_id": "5de86e87205aba0e1c990910"
                    },
                    {
                      "product_retailer_id": "654ffcee0779b105ec6ac3bd"
                    },
                    {
                      "product_retailer_id": "5dbcae51c557e50e67febfcc"
                    },
                    {
                      "product_retailer_id": "5dbcad3fc557e50e67febfac"
                    },
                    {
                      "product_retailer_id": "5dbcae00c557e50e67febfc0"
                    },
                    {
                      "product_retailer_id": "5dbcb083c557e50e67febfdb"
                    },
                  ]
                },
                {
                  "title": "PLATOS FUERTES",
                  "product_items": [
                    {
                      "product_retailer_id": "67981c57bd2f74e33cfce707"
                    },
                    {
                      "product_retailer_id": "66ef02fa4ff68adb785f09f8"
                    },
                    {
                      "product_retailer_id": "619e8bd01880235f6d5b27e5"
                    },
                    {
                      "product_retailer_id": "5dbcb308c557e50e67febff9"
                    },
                    {
                      "product_retailer_id": "5dc733ad7c14810dfd3fec3f"
                    },
                    {
                      "product_retailer_id": "6311736932c31c05fbf10f89"
                    },
                    {
                      "product_retailer_id": "68203e8d7f735e5e48b7ec3b"
                    },
                    {
                      "product_retailer_id": "5e5ae290338d200e065c3577"
                    },
                    {
                      "product_retailer_id": "5dbcb3d9c557e50e67fec005"
                    },
                    {
                      "product_retailer_id": "5dbcb5a6c557e50e67fec022"
                    },
                    {
                      "product_retailer_id": "5de84c6e205aba0e1c9907d0"
                    },
                    {
                      "product_retailer_id": "68203ef70ae0923d28d06765"
                    },
                    {
                      "product_retailer_id": "667f06fe23caaaaf0451a641"
                    },
                    {
                      "product_retailer_id": "5dbcb57ec557e50e67fec01f"
                    },
                    {
                      "product_retailer_id": "654ff6380779b105ec6ac20a"
                    },
                    {
                      "product_retailer_id": "654ff7ba33294a05ef9f32f7"
                    },
                    {
                      "product_retailer_id": "61a10ddf1fd14430485f8cb9"
                    },
                    {
                      "product_retailer_id": "61a2657c1fd14430485f9f0e"
                    },
                  ],
                },
                {
                  "title": "MENÚ INFANTIL",
                  "product_items": [ 
                    {
                      "product_retailer_id": "6550028ec2087c73f3b7775e"
                    },
                    {
                      "product_retailer_id": "61a118171fd14430485f8d78"
                    },
                  ]
                }
              ]
            }
          }
        ]
          }
      ] 
  }
}
else {
    template = { 
      name: "catalogo",
      language: { 
          code: "Es_Co" },
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
                  "title": "PARA PICAR",
                  "product_items": [
                    {
                      "product_retailer_id": "5de86e87205aba0e1c990910"
                    },
                    {
                      "product_retailer_id": "654ffcee0779b105ec6ac3bd"
                    },
                    {
                      "product_retailer_id": "5dbcae51c557e50e67febfcc"
                    },
                    {
                      "product_retailer_id": "5dbcad3fc557e50e67febfac"
                    },
                    {
                      "product_retailer_id": "5dbcae00c557e50e67febfc0"
                    },
                    {
                      "product_retailer_id": "5dbcb083c557e50e67febfdb"
                    },
                  ]
                },
                {
                  "title": "PLATOS FUERTES",
                  "product_items": [
                    {
                      "product_retailer_id": "67981c57bd2f74e33cfce707"
                    },
                    {
                      "product_retailer_id": "66ef02fa4ff68adb785f09f8"
                    },
                    {
                      "product_retailer_id": "619e8bd01880235f6d5b27e5"
                    },
                    {
                      "product_retailer_id": "5dbcb308c557e50e67febff9"
                    },
                    {
                      "product_retailer_id": "5dc733ad7c14810dfd3fec3f"
                    },
                    {
                      "product_retailer_id": "6311736932c31c05fbf10f89"
                    },
                    {
                      "product_retailer_id": "68203e8d7f735e5e48b7ec3b"
                    },
                    {
                      "product_retailer_id": "5e5ae290338d200e065c3577"
                    },
                    {
                      "product_retailer_id": "5dbcb3d9c557e50e67fec005"
                    },
                    {
                      "product_retailer_id": "5dbcb5a6c557e50e67fec022"
                    },
                    {
                      "product_retailer_id": "5de84c6e205aba0e1c9907d0"
                    },
                    {
                      "product_retailer_id": "68203ef70ae0923d28d06765"
                    },
                    {
                      "product_retailer_id": "667f06fe23caaaaf0451a641"
                    },
                    {
                      "product_retailer_id": "5dbcb57ec557e50e67fec01f"
                    },
                    {
                      "product_retailer_id": "654ff6380779b105ec6ac20a"
                    },
                    {
                      "product_retailer_id": "654ff7ba33294a05ef9f32f7"
                    },
                    {
                      "product_retailer_id": "61a10ddf1fd14430485f8cb9"
                    },
                    {
                      "product_retailer_id": "61a2657c1fd14430485f9f0e"
                    },
                  ],
                },
                {
                  "title": "MENÚ INFANTIL",
                  "product_items": [ 
                    {
                      "product_retailer_id": "6550028ec2087c73f3b7775e"
                    },
                    {
                      "product_retailer_id": "61a118171fd14430485f8d78"
                    },
                  ]
                }
              ]
            }
          }
        ]
          }
      ] 
  }
}
  return await whatsappService.sendMenu(to, template);
}

  async menuCarta2(to) {
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
                  "title": "PASTAS",
                  "product_items": [
                    {
                      "product_retailer_id": "67967092084e176a7d5855ba"
                    },
                    {
                      "product_retailer_id": "632df4983bcfe31bedde0e45"
                    },
                    {
                      "product_retailer_id": "5dd9dc26b928d20df3b63e49"
                    },
                  ]
                },
                {
                  "title": "PESCADOS Y MARISCOS",
                  "product_items": [
                    {
                      "product_retailer_id": "619d6d801880235f6d5b1c36"
                    },
                    {
                      "product_retailer_id": "5dcf187deea63f0df843be1e"
                    },
                    {
                      "product_retailer_id": "5e34ebb51ffca60e28d763ef"
                    },
                  ]
                },
                {
                  "title": "ARROCES",
                  "product_items": [
                    {
                      "product_retailer_id": "61a110b91880235f6d5b45a3"
                    },
                    {
                      "product_retailer_id": "5f9b5233ef1e265d296b0f8d"
                    },
                  ]
                },
                {
                  "title": "SÁNDWICHES",
                  "product_items": [
                    {
                      "product_retailer_id": "6796793106b0703ef18a9f72"
                    },
                  ]
                },
                {
                  "title": "ENSALADAS",
                  "product_items": [
                    {
                      "product_retailer_id": "61a119621880235f6d5b4644"
                    },
                    {
                      "product_retailer_id": "61a119421fd14430485f8d96"
                    },
                  ]
                },
                {
                  "title": "SUSHI",
                  "product_items": [
                    {
                      "product_retailer_id": "618b0decad2f690565ff0342"
                    },
                  ]
                },
                {
                  "title": "COMIDAS RÁPIDAS",
                  "product_items": [
                    {
                      "product_retailer_id": "67981d4d8460dcaf720f2284"
                    },
                    {
                      "product_retailer_id": "67981a7ca9cfd2df9753864e"
                    },
                    {
                      "product_retailer_id": "5f9b5636ef1e265d296b0fd3"
                    },
                    {
                      "product_retailer_id": "5dbcb612c557e50e67fec02b"
                    },
                    {
                      "product_retailer_id": "5dbcb645c557e50e67fec02e"
                    },
                    {
                      "product_retailer_id": "67981bf757fc699d06fbe11c"
                    },
                    {
                      "product_retailer_id": "5ef55e5619721c49eb8bb24a"
                    },
                    {
                      "product_retailer_id": "5dbcb6a5c557e50e67fec03e"
                    },
                    {
                      "product_retailer_id": "5dbcb67cc557e50e67fec031"
                    },
                    {
                      "product_retailer_id": "5dc7332e7c14810dfd3fec34"
                    },
                    {
                      "product_retailer_id": "5f9b3922ef1e265d296b0d95"
                    },
                    {
                      "product_retailer_id": "5dc7337b7c14810dfd3fec38"
                    },
                  ]
                },
                {
                  "title": "CAFÉS",
                  "product_items": [
                    {
                      "product_retailer_id": "62b0b0e63996f328856ad5c3",
                    },
                    {
                      "product_retailer_id": "62b0b10f3996f328856ad5c6"
                    },
                    {
                      "product_retailer_id": "66f990de998c13da021a89ac"
                    },
                    {
                      "product_retailer_id": "62b0b16b3996f328856ad5d1"
                    },
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

  async menuCarta3(to) {
    const template = { 
      name: "nuevomenu",
      language: { 
          code: "Es_Co" },
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
                  "title": "JUGOS NATURALES",
                    "product_items": [
                      {
                        "product_retailer_id": "5dc099e151aceb0dd757c620"
                      },
                      {
                        "product_retailer_id": "5dbe24b354eef30e209928e8"
                      },
                      {
                        "product_retailer_id": "624a2d5d07147a05f0bdab13"
                      },
                      {
                        "product_retailer_id": "5dc0a48751aceb0dd757c6fa"
                      },
                      {
                        "product_retailer_id": "5dc0a48751aceb0dd757c6fb"
                      },
                      {
                        "product_retailer_id": "5dc0a48751aceb0dd757c6fc"
                      },
                      {
                        "product_retailer_id": "5dc0a60f51aceb0dd757c70f"
                      },
                      {
                        "product_retailer_id": "5f6aafb5456d7550eef4510a"
                      },
                      {
                        "product_retailer_id": "5f9b4bb3ef1e265d296b0f1a"
                      },
                  ]
                },
                {
                  "title": "CÓCTELES",
                    "product_items": [
                      {
                        "product_retailer_id": "5e226a93641dd30e29531e11"
                      },
                      {
                        "product_retailer_id": "5dbcbb91c557e50e67fec108"
                      },
                      {
                        "product_retailer_id": "5dbcbb4ec557e50e67fec0ff"
                      },
                      {
                        "product_retailer_id": "5f836639e5d38924870320a5"
                      },
                      {
                        "product_retailer_id": "639c9ea052617c1b981ee5f4"
                      },
                      {
                        "product_retailer_id": "639c9e7352617c1b981ee5e1"
                      },
                      {
                        "product_retailer_id": "639c9e7352617c1b981ee5e4"
                      },
                      {
                        "product_retailer_id": "639c9e7352617c1b981ee5e2"
                      },
                      {
                        "product_retailer_id": "653859e9dc0e3f05d9fd5ccd"
                      },
                      {
                        "product_retailer_id": "639c9ef852617c1b981ee604"
                      },
                      {
                        "product_retailer_id": "639c9ef852617c1b981ee605"
                      },
                      {
                        "product_retailer_id": "64a1d25d9c7cb205f4f48a23"
                      },
                      {
                        "product_retailer_id": "639c9ef852617c1b981ee606"
                      },
                  ]
                },
                {
                  "title": "POSTRES",
                    "product_items": [
                      {
                        "product_retailer_id": "5dc4ce4651aceb0dd757e786"
                      },
                      {
                        "product_retailer_id": "639c9b7d3c1b5a05f0d8fb97"
                      },
                      {
                        "product_retailer_id": "5f9b455cef1e265d296b0eab"
                      },
                      {
                        "product_retailer_id": "639c9ba452617c1b981ee446"
                      },
                      {
                        "product_retailer_id": "65500860c2087c73f3b778a3"
                      },
                      {
                        "product_retailer_id": "6133e235d145504ca38cbd7e"
                      },
                      {
                        "product_retailer_id": "65550a945e11f905f75326f5"
                      },
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
        this.menuOpcional(to);
        idNumber["numero"] = to;
        break;
      case 'option_2':
        idNumber["numero"] = to;
        await this.sendMediaEvento(to);
        await this.menuReserva(to);
        break;
      case 'option_3':
        this.assistandState[to] = { step: 'question' };
        response = 'Realiza tu pregunta: ';
        break;
      case 'option_4':
        response = "Te esperamos en nuestro restaurante! 📍";
        await this.sendLocation(to);
        break;
      case 'option_5':
        response = "Es un placer para nosotros servirte, que disfrutes de tu pedido 😊👩‍🍳\nVuelve pronto!";
        break;
      case 'op_3':
        response = 'Escribe a nuestro Whatsapp personal🤗';
        await this.sendContact(to);
        break;
      case 'opt1':
        await this.encuesta(to);
        break;
      case 'si':
        await this.menuCarta3(to);
        break;
      default:
        response = "Oops😔\nPorfa, elige una de las opciones del menú o escribe *Hola* para volver a empezar\nTambién, escribe *Carta* para verla.";
    }
    if (response) {
      await whatsappService.sendMessage(to, response);
    }
  }

  async handleAppointmentFlow(to, message) {
    const state = this.appointmentState[to];
    delete this.appointmentState[to];
    let response;
  
    switch (state.step) {
      case 'reserva':
        await this.menuReserva(to);
        break;
      default:
        response = "Lo siento 😔 no entendí tu respuesta\nPor Favor, elige una de las opciones del menú.";
        await whatsappService.sendMessage(to, response);
      }
  }

  async handleHiringFlow(to, pedido, datosPedido) {
    let response;

    response = `*Pedido:*

${pedido}

Total: $${datosPedido.monto.toLocaleString('es-CO')} COP`;
    await this.menuPedido(to);

      await whatsappService.sendMessage(to, response);
  }

  async respFlow(to, screen, datosReserva, datosPedido, pedidoStr) {
    let response;
    if (screen === "SUMMARY") {
      if (datosPedido.datos.address) {
        (datosPedido.monto += 3000).toLocaleString('es-CO');
      }
      if (datosPedido.datos.pago === "Efectivo") {
        response = "✅¡Pedido recibido!\nPronto nos pondremos en contacto contigo! 🤗";
        await this.menuOpcionalHiring(to);
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
          response = `*Resumen de tu pedido*🛒:\n\n${pedidoStr}\n*Total:* $${datosPedido.monto.toLocaleString('es-CO')} COP\n\nUtiliza el siguiente *link de pago*:\n\nhttps://checkout.wompi.co/l/${idlink}\n\nLuego, al realizar el pago automáticamente te lo confirmamos! 😊`;
        } catch (error) {
          response = "Hubo un problema al generar el enlace de pago. Por favor, intenta nuevamente.";
        }
    } else if (datosPedido.datos.pago === "Transferencia") {
      userOrderDataMap[to] = {
        ...datosPedido.datos,
        monto: datosPedido.monto,
        pedidoStr
      };
        response = `*Resumen de tu pedido*🛒:\n\n${pedidoStr}\n*Total:* $${datosPedido.monto.toLocaleString('es-CO')} COP\n\n🏦Cuentas bancarias:\n\n*Nequi:* 3117445749\n*Mar** Ari***\n\n*Bancolombia Ahorros:* 70423175395\nMar** Pat** Ari**\n\n*Banco BBVA:* 0614001209\n\nLuego, envíanos el comprobante de la transferencia (captura) para confirmar tu pedido 😊`;
      }
   } else if (screen === "RESUMEN") {
    const horario = datosReserva.evento === "Festival Gastronomico" 
      ? 'hora' 
      : datosReserva.evento === "Cumpleaños" 
        ? 'horario'
        : datosReserva.evento === "Reserva normal"
        ? 'horanormal'
        : "";
    
        const calendario = datosReserva.evento === "Festival Gastronomico" 
      ? 'fechafestival' 
      : datosReserva.evento === "Cumpleaños" 
        ? 'fecha'
        : datosReserva.evento === "Reserva normal"
        ? 'fechanormal'
        : "";

    // Variables para la plantilla (en el orden del body)
  const templateVars = [
    datosReserva.nombre,
    datosReserva.celular,
    datosReserva.evento,
    datosReserva[calendario],
    datosReserva[horario],
    datosReserva.cuantos,
    datosReserva.donde
  ];
  
  const publicUrl = "https://micarta.s3.us-east-1.amazonaws.com/confirmacion_reserva.jpeg";
  const numerosOficiales = [
    to,
    "573153652520",
    "573137517489"
  ];
  
  for (const numero of numerosOficiales) {
    await whatsappService.sendTemplateMediaMessage(numero, "confirmacion_reserva", publicUrl, templateVars);
  }
  this.sendLocation(to);

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

  completeHiring(productos, data) {
    let fechayhora = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
    let userData;
    const spreadsheetId = process.env.SPREADSHEETID_PEDIDO;
    const numero = idNumber["numero"] || "No disponible";
      userData = [
        numero,
        data.name,
        productos,
        data.address,
        data.phone,
        data.pago,
        data.recomendacion,
        fechayhora,
      ]
    paymentRowMap[numero] = fechayhora;
    appendToSheet(userData, spreadsheetId);
  }
  
completeOrder(productos, data) {
  const waiterOrderArea = {
    // Barril
    "6134f560fd56a10e49c4f666": [
      "6133f09d5af774183ce25e0f",
      "6133e891d145504ca38cbeeb",
      "6133f070d145504ca38cbf3a",
    ],
    // Cocina
    "5da0e17b86a93953dd2763bc": [
      "5de86e87205aba0e1c990910",
      "654ffcee0779b105ec6ac3bd",
      "5dbcae51c557e50e67febfcc",
      "5dbcad3fc557e50e67febfac",
      "5dbcae00c557e50e67febfc0",
      "5dbcb083c557e50e67febfdb",
      "67981c57bd2f74e33cfce707",
      "66ef02fa4ff68adb785f09f8",
      "619e8bd01880235f6d5b27e5",
      "5dbcb308c557e50e67febff9",
      "5dc733ad7c14810dfd3fec3f",
      "68203e8d7f735e5e48b7ec3b",
      "5e5ae290338d200e065c3577",
      "67981d4d8460dcaf720f2284",
      "5dcf187deea63f0df843be1e",
      "5dbcb3d9c557e50e67fec005",
      "6311736932c31c05fbf10f89",
      "5dbcb5a6c557e50e67fec022",
      "5de84c6e205aba0e1c9907d0",
      "68203ef70ae0923d28d06765",
      "667f06fe23caaaaf0451a641",
      "5dbcb57ec557e50e67fec01f",
      "654ff6380779b105ec6ac20a",
      "654ff7ba33294a05ef9f32f7",
      "61a10ddf1fd14430485f8cb9",
      "61a2657c1fd14430485f9f0e",
      "6550028ec2087c73f3b7775e",
      "61a118171fd14430485f8d78",
      "67967092084e176a7d5855ba",
      "619d6d801880235f6d5b1c36",
      "632df4983bcfe31bedde0e45",
      "5dd9dc26b928d20df3b63e49",
      "5e34ebb51ffca60e28d763ef",
      "61a110b91880235f6d5b45a3",
      "5f9b5233ef1e265d296b0f8d",
      "6796793106b0703ef18a9f72",
      "61a119621880235f6d5b4644",
      "61a119421fd14430485f8d96",
      "618b0decad2f690565ff0342",
      "67981a7ca9cfd2df9753864e",
      "5f9b5636ef1e265d296b0fd3",
      "5dbcb612c557e50e67fec02b",
      "5dbcb645c557e50e67fec02e",
      "67981bf757fc699d06fbe11c",
      "5ef55e5619721c49eb8bb24a",
      "5dbcb6a5c557e50e67fec03e",
      "5dbcb67cc557e50e67fec031",
      "5dc7332e7c14810dfd3fec34",
      "5f9b3922ef1e265d296b0d95",
      "5dc7337b7c14810dfd3fec38",

    ],
    // Bar
    "5da0e1817511f32c929a0078": [
      "5dc099e151aceb0dd757c620",
      "5dbe24b354eef30e209928e8",
      "624a2d5d07147a05f0bdab13",
      "5dc0a48751aceb0dd757c6fa",
      "5dc0a48751aceb0dd757c6fb",
      "5dc0a48751aceb0dd757c6fc",
      "5dc0a60f51aceb0dd757c70f",
      "5f6aafb5456d7550eef4510a",
      "5f9b4bb3ef1e265d296b0f1a",
      "5e226a93641dd30e29531e11",
      "5dbcbb91c557e50e67fec108",
      "5dbcbb4ec557e50e67fec0ff",
      "5f836639e5d38924870320a5",
      "639c9ea052617c1b981ee5f4",
      "639c9e7352617c1b981ee5e1",
      "639c9e7352617c1b981ee5e4",
      "639c9e7352617c1b981ee5e2",
      "653859e9dc0e3f05d9fd5ccd",
      "639c9ef852617c1b981ee604",
      "639c9ef852617c1b981ee605",
      "64a1d25d9c7cb205f4f48a23",
      "639c9ef852617c1b981ee606",
      "5dc4ce4651aceb0dd757e786",
      "639c9b7d3c1b5a05f0d8fb97",
      "5f9b455cef1e265d296b0eab",
      "639c9ba452617c1b981ee446",
      "65500860c2087c73f3b778a3",
      "6133e235d145504ca38cbd7e",
      "65550a945e11f905f75326f5",
      "62b0b0e63996f328856ad5c3",
      "62b0b10f3996f328856ad5c6",
      "66f990de998c13da021a89ac",
      "62b0b16b3996f328856ad5d1"
    ]
  };

  function getWaiterOrderArea(productId) {
    for (const [areaId, productIds] of Object.entries(waiterOrderArea)) {
      if (productIds.includes(productId)) {
        return areaId;
      }
    }
    return null;
  }

  // Construye el array de orders con waiterOrderArea y solo la recomendación del cliente
  const orders = productos.map(item => ({
    product: item.product_retailer_id,
    locationStock: "5d4619b4a8337b56866de6ff",
    waiterOrderArea: getWaiterOrderArea(item.product_retailer_id),
    quantity: item.quantity,
    unit_price: item.item_price,
    notes: data.recomendacion || ""
  }));

  // Si hay domicilio, agrégalo como un producto más (puedes asignar área si lo deseas)
  if (data.address) {
    orders.push({
      product: "677ad5b1b4797f0dcba09e41",
      locationStock: "5d4619b4a8337b56866de6ff",
      quantity: 1,
      unit_price: 3000,
      notes: "Domicilio"
    });
  }

  const pedidoLoggro = {
    table: "6939640ddf7998fb29e63fab",
    groupName: `Nombre: ${data.name}\nTeléfono: ${data.phone}\nDirección: ${data.address}`,
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

  completeAppointment(data) {
    let fechayhora = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
    const spreadsheetId = process.env.SPREADSHEETID_RESERVA;
    const number = idNumber["numero"] || "No disponible";
    const horario = data.evento === "Festival Gastronomico" 
      ? 'hora' 
      : data.evento === "Cumpleaños" 
        ? 'horario'
        : data.evento === "Reserva normal"
        ? 'horanormal'
        : "";
    const calendario = data.evento === "Festival Gastronomico" 
      ? 'fechafestival' 
      : data.evento === "Cumpleaños" 
        ? 'fecha'
        : data.evento === "Reserva normal"
        ? 'fechanormal'
        : "";
    const userData = [
      number,
      data.nombre,
      data.celular,
      data.evento,
      data[calendario],
      data[horario],
      data.cuantos,
      data.donde,
      fechayhora
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
