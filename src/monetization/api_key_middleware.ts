/**
 * API Key Middleware — The Gatekeeper
 *
 * Validates API keys and checks credit balance before allowing requests.
 * This is the first "financial lung" — no key, no service.
 */

import { Request, Response, NextFunction } from 'express';
import { getCreditStore } from './credit_store';

export interface AuthenticatedRequest extends Request {
  apiKey?: string;
  userId?: string;
}

/**
 * Middleware to validate API key from Authorization header.
 * Expects: Authorization: Bearer lf_xxxxx
 */
export function requireApiKey(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Missing or invalid Authorization header',
      hint: 'Include "Authorization: Bearer YOUR_API_KEY" in your request',
    });
    return;
  }

  const apiKey = authHeader.slice(7); // Remove "Bearer "
  const store = getCreditStore();
  const keyData = store.getApiKey(apiKey);

  if (!keyData) {
    res.status(401).json({
      error: 'Invalid API key',
      hint: 'Get your API key from the dashboard or contact support',
    });
    return;
  }

  // Attach to request for downstream use
  req.apiKey = keyData.key;
  req.userId = keyData.userId;

  // Update last used timestamp
  store.updateLastUsed(apiKey);

  next();
}

/**
 * Middleware to check if the API key has sufficient credits.
 * Must be used AFTER requireApiKey.
 */
export function requireCredits(minCredits: number) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.apiKey) {
      res.status(500).json({ error: 'API key not validated. Use requireApiKey middleware first.' });
      return;
    }

    const store = getCreditStore();
    const balance = store.getBalance(req.apiKey);

    if (balance < minCredits) {
      res.status(402).json({
        error: 'Insufficient credits',
        required: minCredits,
        balance,
        hint: 'Purchase more credits at https://lovesfire.ai/credits',
      });
      return;
    }

    next();
  };
}
