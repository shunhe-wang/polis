import Stripe from "stripe";

export function getStripeClient(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return null;
  }

  return new Stripe(secretKey);
}
