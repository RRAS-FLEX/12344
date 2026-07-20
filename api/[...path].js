// Vercel entry point: forwards every /api/* request to the same Express app
// used for local dev (server/index.mjs) and the Netlify function
// (netlify/functions/api.js). Vercel's Node runtime accepts an Express app
// as a default export directly (it is callable as `app(req, res)`).
//
// bodyParser is disabled below so Vercel doesn't consume the request stream
// before Express's own middleware (express.json / the raw-body Stripe
// webhook parser) gets a chance to read it.
import app from "../server/index.mjs";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default app;
