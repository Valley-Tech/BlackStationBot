import { GoogleGenerativeAI } from "@google/generative-ai";
import config from "../config/env.js";

const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);

// Almacenar sesiones de chat por usuario
const userSessions = {};

const systemPrompt = `Eres un asesor especializado para el restaurante "La Estación Blacks" ubicado en el corregimiento de La Loma en el departamento del Cesar, Colombia.

INSTRUCCIONES IMPORTANTES:
- Responde de manera corta, precisa y concisa
- Sé amable y usa emojis ocasionalmente para ser más humano
- Si no conoces la respuesta, disculpate diciendo algo como: "disculpa! no se la respuesta, pero seguiré aprendiendo para resolver todas tus inquietudes"
- NUNCA digas: "No se me dio información sobre", "según la información proporcionada"
- Si preguntan sobre información sensible (dueño, finanzas), responde de manera jocosa y persuasiva
- Aparenta ser un humano hablando naturalmente
- Recuerda el contexto de conversaciones anteriores
- Si el usuario pregunta sobre pedidos, reservas o servicios, ofrece ayuda

INFORMACIÓN DEL RESTAURANTE:
- Horario: 12:00 PM a 10:00 PM
- Ubicación: Calle 10 #9-133, La Loma, El Paso, Cesar
- Teléfono: +573113509246
- Especialidades: Carnes asadas, mariscos, pizzas, comidas rápidas
- Servicios: Pedidos a domicilio, reservas de mesa, encuestas de satisfacción`;

const geminiService = async (userMessage, userId) => {
  try {
    // Inicializar sesión del usuario si no existe
    if (!userSessions[userId]) {
      userSessions[userId] = {
        history: [],
        createdAt: new Date(),
        lastMessage: new Date()
      };
    }

    const session = userSessions[userId];
    session.lastMessage = new Date();

    // Crear modelo con streaming deshabilitado para mejor control
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    // Construir historial de chat
    const chatHistory = session.history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.content }]
    }));

    // Iniciar chat con historial
    const chat = model.startChat({
      history: chatHistory,
      generationConfig: {
        maxOutputTokens: 150,
        temperature: 0.7,
        topP: 0.9,
        topK: 40
      }
    });

    // Enviar mensaje
    const result = await chat.sendMessage(userMessage);
    const response = result.response.text();

    // Guardar en historial
    session.history.push({
      role: "user",
      content: userMessage
    });

    session.history.push({
      role: "model",
      content: response
    });

    // Mantener solo últimos 20 mensajes para no sobrecargar memoria
    if (session.history.length > 20) {
      session.history = session.history.slice(-20);
    }

    return response;
  } catch (error) {
    console.error("Error en Gemini:", error.message);
    return "Disculpa, estoy teniendo problemas técnicos momentáneamente. Intenta nuevamente en unos segundos 🔧";
  }
};

// Función para limpiar sesiones antiguas (>1 hora)
const cleanOldSessions = () => {
  const now = new Date();
  const ONE_HOUR = 60 * 60 * 1000;

  Object.keys(userSessions).forEach(userId => {
    const session = userSessions[userId];
    if (now - session.lastMessage > ONE_HOUR) {
      delete userSessions[userId];
    }
  });
};

// Ejecutar limpieza cada 30 minutos
setInterval(cleanOldSessions, 30 * 60 * 1000);

export default geminiService;