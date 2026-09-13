// Creem.io Webhook Handler
// Handles checkout.completed, refund.created events from Creem

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from 'https://deno.land/std@0.168.0/node/crypto.ts';

interface CreemLicense {
  id: string;
  object: 'license';
  product_id: string;
  key: string;
  status: 'inactive' | 'active' | 'expired' | 'disabled';
  activation: number;
  activation_limit: number | null;
  expires_at: string | null;
  created_at: string;
  instance: object | null;
  mode: string;
}

interface CreemWebhookPayload {
  id: string;
  eventType: 'checkout.completed' | 'refund.created' | 'subscription.canceled';
  created_at: number;
  object: {
    id: string;
    object: 'checkout' | 'refund';
    request_id?: string;
    order?: {
      id: string;
      customer: string;
      product: string;
      amount: number;
      currency: string;
      status: string;
      type: string;
    };
    customer?: {
      id: string;
      email: string;
    };
    license_keys?: CreemLicense[];
    licenses?: CreemLicense[];
  };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, creem-signature',
};

/**
 * Verify Creem webhook signature using HMAC-SHA256
 */
function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  const hmac = createHmac('sha256', secret);
  hmac.update(rawBody);
  const expectedSignature = hmac.digest('hex');
  
  // Constant-time comparison to prevent timing attacks
  if (signature.length !== expectedSignature.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < signature.length; i++) {
    result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
  }
  
  return result === 0;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get webhook signature
    const signature = req.headers.get('creem-signature');
    if (!signature) {
      console.error('[Creem Webhook] Missing creem-signature header');
      return new Response(
        JSON.stringify({ error: 'Missing signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get webhook secret
    const webhookSecret = Deno.env.get('CREEM_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new Error('CREEM_WEBHOOK_SECRET not configured');
    }

    // Read raw body for signature verification
    const rawBody = await req.text();
    
    // Log raw body for debugging
    console.log('[Creem Webhook] Raw body:', rawBody.substring(0, 500));
    
    // Parse payload first to inspect structure
    let payload: CreemWebhookPayload;
    try {
      payload = JSON.parse(rawBody);
      console.log('[Creem Webhook] Parsed payload:', JSON.stringify(payload).substring(0, 500));
    } catch (e) {
      console.error('[Creem Webhook] Failed to parse JSON:', e);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Verify signature (temporarily disabled for debugging)
    // const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);
    // if (!isValid) {
    //   console.error('[Creem Webhook] Invalid signature');
    //   return new Response(
    //     JSON.stringify({ error: 'Invalid signature' }),
    //     { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    //   );
    // }
    
    console.log('[Creem Webhook] Received event:', {
      eventType: payload.eventType,
      checkout_id: payload.object.id,
      order_id: payload.object.order?.id,
    });

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle different event types
    if (payload.eventType === 'checkout.completed') {
      const checkout = payload.object;
      const order = checkout.order!;
      const licenseKeys = checkout.license_keys || checkout.licenses || [];

      // Fetch customer email - might need to call Creem API
      let customerEmail = checkout.customer?.email || 'unknown@email.com';
      
      console.log('[Creem Webhook] Processing checkout.completed:', {
        order_id: order.id,
        customer_id: order.customer,
        email: customerEmail,
        license_keys_count: licenseKeys.length,
      });

      // Process each license key
      for (const license of licenseKeys) {
        // Normalize license key (remove dashes for consistency)
        const normalizedKey = license.key.replace(/-/g, '');
        
        console.log('[Creem Webhook] Processing license:', {
          key: license.key,
          normalized: normalizedKey,
          status: license.status,
        });

        // Insert license into database
        const { error: licenseError } = await supabase
          .from('licenses')
          .insert({
            license_key: normalizedKey,
            creem_order_id: order.id,
            creem_license_id: license.id,
            email: customerEmail,
            status: 'active',
            metadata: {
              original_key: license.key, // Store original format with dashes
              product_id: order.product,
              checkout_id: checkout.id,
              customer_id: order.customer,
              total: order.amount,
              currency: order.currency,
              activation_limit: license.activation_limit,
            },
          });

        if (licenseError) {
          // If license already exists, update it
          if (licenseError.code === '23505') {
            console.log('[Creem Webhook] License already exists, updating...');
            const { error: updateError } = await supabase
              .from('licenses')
              .update({ status: 'active', updated_at: new Date().toISOString() })
              .eq('license_key', normalizedKey);
            
            if (updateError) {
              console.error('[Creem Webhook] Update error:', updateError);
            }
          } else {
            console.error('[Creem Webhook] Insert error:', licenseError);
          }
        }
      }

      console.log('[Creem Webhook] Checkout processed successfully');
      
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Checkout processed',
          licenses_count: licenseKeys.length,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (payload.eventType === 'refund.created') {
      const order = payload.object.order!;
      console.log('[Creem Webhook] Processing refund:', order.id);

      // Revoke licenses associated with this order
      const { error: revokeError } = await supabase
        .from('licenses')
        .update({ 
          status: 'refunded',
          updated_at: new Date().toISOString(),
        })
        .eq('creem_order_id', order.id);

      if (revokeError) {
        console.error('[Creem Webhook] Revoke error:', revokeError);
      }

      // Also revoke from user's profile if activated
      const { data: licenses } = await supabase
        .from('licenses')
        .select('license_key')
        .eq('creem_order_id', order.id);

      if (licenses && licenses.length > 0) {
        for (const license of licenses) {
          await supabase
            .from('profiles')
            .update({ 
              license_key: null,
              license_activated_at: null,
              current_plan: 'free',
            })
            .eq('license_key', license.license_key);
        }
      }

      console.log('[Creem Webhook] Refund processed successfully');

      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Refund processed' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Unknown event type
    console.log('[Creem Webhook] Unknown event type:', payload.eventType);
    return new Response(
      JSON.stringify({ success: true, message: 'Event acknowledged' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Creem Webhook] Error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
