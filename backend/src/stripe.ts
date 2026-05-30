/**
 * Stripe integration — checkout sessions, customer portal, webhook handling.
 * Uses Stripe's REST API directly (no SDK needed in CF Workers).
 */

const STRIPE_API = "https://api.stripe.com/v1";

// Price IDs — set these after creating products in Stripe dashboard
// wrangler secret put STRIPE_PRO_PRICE_ID
// These are set dynamically from the request's own host so dev/prod use correct URLs
function getPaymentUrls(baseUrl: string) {
  return {
    success: `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel:  `${baseUrl}/payment/cancel`,
  };
}

function stripeHeaders(secretKey: string): Headers {
  const h = new Headers();
  h.set("Authorization", `Bearer ${secretKey}`);
  h.set("Content-Type", "application/x-www-form-urlencoded");
  return h;
}

function encodeForm(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

export async function createCheckoutSession(
  secretKey: string,
  proPriceId: string,
  customerEmail: string,
  userId: string,
  baseUrl: string,
): Promise<{ url: string }> {
  const urls = getPaymentUrls(baseUrl);
  const body = encodeForm({
    "mode": "subscription",
    "line_items[0][price]": proPriceId,
    "line_items[0][quantity]": "1",
    "customer_email": customerEmail,
    "success_url": urls.success,
    "cancel_url": urls.cancel,
    "metadata[user_id]": userId,
    "subscription_data[metadata][user_id]": userId,
  });

  const resp = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: stripeHeaders(secretKey),
    body,
  });

  const data = await resp.json() as { url?: string; error?: { message: string } };
  if (!resp.ok || !data.url) {
    throw new Error(data.error?.message ?? "Failed to create Stripe checkout session.");
  }
  return { url: data.url };
}

export async function createPortalSession(
  secretKey: string,
  stripeCustomerId: string,
  baseUrl: string,
): Promise<{ url: string }> {
  const body = encodeForm({
    "customer": stripeCustomerId,
    "return_url": `${baseUrl}/payment/cancel`,
  });

  const resp = await fetch(`${STRIPE_API}/billing_portal/sessions`, {
    method: "POST",
    headers: stripeHeaders(secretKey),
    body,
  });

  const data = await resp.json() as { url?: string; error?: { message: string } };
  if (!resp.ok || !data.url) {
    throw new Error(data.error?.message ?? "Failed to create portal session.");
  }
  return { url: data.url };
}

/** Verify Stripe webhook signature (HMAC-SHA256). */
export async function verifyStripeWebhook(
  payload: string,
  signature: string,
  webhookSecret: string
): Promise<Record<string, unknown> | null> {
  try {
    // signature format: t=timestamp,v1=hash,...
    const parts = Object.fromEntries(
      signature.split(",").map((p) => p.split("=") as [string, string])
    );
    const timestamp = parts["t"];
    const v1 = parts["v1"];
    if (!timestamp || !v1) return null;

    const signed = `${timestamp}.${payload}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed));
    const computed = Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (computed !== v1) return null;

    // Reject events older than 5 minutes
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return null;

    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}
