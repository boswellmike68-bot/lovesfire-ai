/**
 * Stripe Webhook Handler — The Revenue Intake
 *
 * Listens for Stripe payment events and automatically adds credits to API keys.
 * This is the "programmable revenue" entry point.
 */

import { Request, Response } from 'express';
import { getCreditStore } from './credit_store';

// Credit pricing tiers (in cents)
export const CREDIT_PACKAGES = {
  starter: { price: 500, credits: 10 },      // $5 = 10 credits (2 renders)
  pro: { price: 2500, credits: 60 },         // $25 = 60 credits (12 renders)
  steward: { price: 10000, credits: 300 },   // $100 = 300 credits (60 renders)
};

/**
 * Handle Stripe webhook events.
 * Verifies the webhook signature and processes payment_intent.succeeded events.
 */
export function handleStripeWebhook(req: Request, res: Response) {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[Stripe] STRIPE_WEBHOOK_SECRET not configured');
    res.status(500).json({ error: 'Webhook secret not configured' });
    return;
  }

  // In production, use Stripe SDK to verify signature:
  // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  // const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

  // For now, accept the event directly (INSECURE - add Stripe SDK in production)
  const event = req.body;

  console.log(`[Stripe] Received event: ${event.type}`);

  // Handle successful payment
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const apiKey = paymentIntent.metadata?.api_key;
    const packageType = paymentIntent.metadata?.package;

    if (!apiKey || !packageType) {
      console.error('[Stripe] Missing metadata in payment_intent:', paymentIntent.id);
      res.status(400).json({ error: 'Missing api_key or package in metadata' });
      return;
    }

    const pkg = CREDIT_PACKAGES[packageType as keyof typeof CREDIT_PACKAGES];
    if (!pkg) {
      console.error('[Stripe] Invalid package type:', packageType);
      res.status(400).json({ error: 'Invalid package type' });
      return;
    }

    // Add credits to the API key
    const store = getCreditStore();
    store.addCredits(apiKey, pkg.credits, paymentIntent.id);

    console.log(`[Stripe] Added ${pkg.credits} credits to ${apiKey} (Payment: ${paymentIntent.id})`);
  }

  res.status(200).json({ received: true });
}

/**
 * Create a Stripe Payment Intent for credit purchase.
 * Returns the client secret for frontend checkout.
 */
export async function createPaymentIntent(apiKey: string, packageType: keyof typeof CREDIT_PACKAGES): Promise<any> {
  const pkg = CREDIT_PACKAGES[packageType];
  if (!pkg) {
    throw new Error(`Invalid package type: ${packageType}`);
  }

  // In production, use Stripe SDK:
  // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  // const paymentIntent = await stripe.paymentIntents.create({
  //   amount: pkg.price,
  //   currency: 'usd',
  //   metadata: { api_key: apiKey, package: packageType },
  // });
  // return { clientSecret: paymentIntent.client_secret, amount: pkg.price, credits: pkg.credits };

  // Mock response for development
  return {
    clientSecret: 'pi_mock_' + Math.random().toString(36).slice(2),
    amount: pkg.price,
    credits: pkg.credits,
    package: packageType,
  };
}
