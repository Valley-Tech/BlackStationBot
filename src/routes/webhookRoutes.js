import express from 'express';
import webhookController from '../controllers/webhookController.js';
import { createCrmEventsRouter } from '../services/crmAdapter.js';

const router = express.Router();

<<<<<<< HEAD
router.post('/flow', webhookController.handleFlow);
router.post('/webhook', (req, res) => webhookController.handleIncoming(req, res)); // función flecha: conserva 'this'
=======
router.post('/webhook', (req, res) => webhookController.handleIncoming(req, res)); // arrow: conserva 'this'
>>>>>>> 633f577d1142dd6e095c32ee0ff2a4f98da729ea
router.get('/webhook', webhookController.verifyWebhook);
router.post('/flow', webhookController.handleFlow);
router.post('/wompi', express.json({ type: '*/*' }), webhookController.handleEvent);

// Modo gateway: el CRM entrega aquí los mensajes (endpointUrl = https://<bot>/crm/events).
router.use('/crm', createCrmEventsRouter((event) => webhookController.handleCrmEvent(event)));

export default router;