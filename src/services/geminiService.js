import axios from "axios";
import config from "../config/env.js";

const GEMINI_API_KEY = config.GEMINI_API_KEY;

const geminiService = async (message) => {	

	try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: `Actúa como un asesor especializado para el restuarante llamado La Estación Blacks ubicado en el corregimiento de La Loma en el departamento del Cesar, en Colombia. IMPORTANTE: Responde corto, preciso y conciso. Responde la pregunta si la sabes, sino, discúlpate con el cliente diciendo algo como "Uy disculpa! 😬 no se la respuesta, pero seguiré aprendiendo para resolver todas tus inquietudes". No digas: "No se me dio información sobre", "según la información proporcionada". Si te preguntan información sensible o privada como por ejemplo: Quién es el dueño del restaurante, responde de una manera persuasiva y jocosa. Aparenta ser un humano y hablar fluidamente según la conversación, eres el chatbot experto del restaurante Samuelito Restobar. 
                \n\n${message}`
              }
            ]
          }
        ]
      }
    );
    // Gemini responde en response.data.candidates[0].content.parts[0].text
    return response.data.candidates?.[0]?.content?.parts?.[0]?.text || "No se la respuesta";
  } catch (error) {
    console.error(error.response?.data || error.message);
    return "Ocurrió un error al consultar la IA.";
  }
};
	
export default geminiService;
