// Punto de entrada para Vercel: expone la app Express (ya configurada en src/server.js)
// como Serverless Function. El proyecto es ESM ("type": "module"), por eso se usa import.
import app from '../src/server.js';

export default app;
