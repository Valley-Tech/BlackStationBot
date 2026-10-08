import sendToWhatsApp from "../services/httpRequest/sendToWhatsApp.js";
import { printDetailedError } from './printDetailError.js';

class WhatsAppService {
  async sendMessage(to, body) {
    try {
      const data = {
        messaging_product: 'whatsapp',
        to,
        text: { body },
      };

      await sendToWhatsApp(data);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }

  async markAsRead(messageId) {
    try {
      const data = {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      };
  
      await sendToWhatsApp(data);
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  }

  async sendListMessage(to, listMessage) {
    try {
      const data = {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: listMessage
      };
      await sendToWhatsApp(data);
    } catch (error) {
      console.log("Error: ", error);
    }
  }

  async sendInteractiveButtons(to, bodyText, buttons) {
    try {
      const data = {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: "button",
          body: { text: bodyText },
          action: {
            buttons: buttons,
          },
        },
      };

      await sendToWhatsApp(data);
    } catch (error) {
      console.log("Error: ", error);
    }
  }

  async sendFlow(to, action) {
    try {
      const data = {
        recipient_type: 'individual',
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: "flow",
          header: {
            type: "text",
            text: "Dame tus datos para el domicilio: "
          },
          body: { 
            text: "Haz clic aquí 👇" 
          },
          action
        },
      };
      
    await sendToWhatsApp(data);
    } catch (error) {
      console.log("Error: ", error);
    }
  }

  async sendTemplatePedidoMessage(to, template, imageUrl, variables) {
    try {
      const safeVariables = variables.map(v =>
        String(v ?? '')
          .replace(/[\n\t]/g, ' ')      // saltos de línea y tabs -> espacio
          .replace(/ {2,}/g, ' ')       // colapsa espacios múltiples
          .trim()
      );

      const data = {
        messaging_product: 'whatsapp',
        to: to,
        type: 'template',
        template: {
          name: template,
          language: { code: "es_CO" },
          components: [
            {
              type: "header",
              parameters: [
                {
                  type: "image",
                  image: { link: imageUrl }
                }
              ]
            },
            {
              type: "body",
              parameters: safeVariables.map(text => ({ type: "text", text }))
            }
          ]
        }
      };
      await sendToWhatsApp(data);
    } catch (error) {
      console.log(error);
    }
  }

  async sendTemplateMediaMessage(to, imageUrl, variables) {
    try {
      const safeVariables = variables.map(v =>
      String(v ?? '')
        .replace(/[\n\t]/g, ' ')      // saltos de línea y tabs -> espacio
        .replace(/ {2,}/g, ' ')       // colapsa espacios múltiples
        .trim()
      );
      
      const data = {
        messaging_product: 'whatsapp',
        to: to,
        type: 'template',
        template: {
          name: "comprobante_pago",
          language: { code: "es_CO" },
          components: [
            {
              type: "header",
              parameters: [
                {
                  type: "image",
                  image: { link: imageUrl }
                }
              ]
            },
            {
              type: "body",
              parameters: safeVariables.map(text => ({ type: "text", text }))
            }
          ]
        }
      };
      await sendToWhatsApp(data);
    } catch (error) {
      console.log(error);
    }
  }

  async sendFlowReserva(to, action) {
    try {
      const data = {
        recipient_type: 'individual',
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: "flow",
          header: {
            type: "text",
            text: "Reserva tu mesa:"
          },
          body: { 
            text: "Haz clic aquí 👇" 
          },
          action
        },
      };
  
    await sendToWhatsApp(data);
    } catch (error) {
      console.log("Error: ", error);
    }
  }
  
  async sendMenu(to, template) {
    try {
      const data = {
        recipient_type: 'individual',
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: template
      };
  
    await sendToWhatsApp(data);
    } catch (error) {
      printDetailedError(error);
    }
  }

  async sendProductList(to, template) {
    try {
      const data = {
        recipient_type: 'individual',
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: template
      };
  
    await sendToWhatsApp(data);
    } catch (error) {
      printDetailedError(error);
    }
  }
  
  async sendSingleProduct(to, id) {
    // Un product_retailer_id es un código sin espacios (ej. 69d5082a9bf0d32ae9a89dd9).
    // Si llega un texto (respuesta de la IA), no se manda a Meta: evitaba el error 31009.
    const productId = String(id ?? '').trim();
    if (!productId || /\s/.test(productId) || productId.length > 100) {
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
  }
  
  async sendFlowEncuesta(to, action) {
    try {
      const data = {
        recipient_type: 'individual',
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: "flow",
          header: {
            type: "text",
            text: "Encuesta de satisfacción:"
          },
          body: { 
            text: "Diligenciala aquí 👇" 
          },
          action
        },
      };
  
    await sendToWhatsApp(data);
    } catch (error) {
      console.log("Error: ", error);
    }
  }

  async sendMediaMessage(to, type, mediaUrl, caption) {
    try {
      
      const mediaObject = {};
  
      switch (type) {
        case 'image':
          mediaObject.image = { link: mediaUrl, caption: caption };
          break;
        case 'audio':
          mediaObject.audio = { link: mediaUrl };
          break;
        case 'video':
          mediaObject.video = { link: mediaUrl, caption: caption };
          break;
        case 'document':
          mediaObject.document = { link: mediaUrl, caption: caption, filename: 'carta-SamuelitoRestoBar.pdf' };
          break;
        default:
          throw new Error('Not Supported Media Type');
      }
  
      const data = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: type,
        ...mediaObject,
      };
  
      await sendToWhatsApp(data);
    } catch (error) {
      console.log("Error: ", error);
    }
  }

  async sendContactMessage(to, contact) {
    try {
      const data = {
        messaging_product: 'whatsapp',
        to,
        type: 'contacts',
        contacts: [contact],
      };
  
      await sendToWhatsApp(data);
      
    } catch (error) {
      console.log("Error: ", error);
    }
  }

  async sendLocationMessage(to, latitude, longitude, name, address) {
    try {
      
      const data = {
        messaging_product: 'whatsapp',
        to,
        type: 'location',
        location: {
          latitude: latitude,
          longitude: longitude,
          name: name,
          address: address
        }
      };
      
      await sendToWhatsApp(data);
    } catch (error) {
      console.log("Error: ", error);
    }
  }
}

export default new WhatsAppService();
