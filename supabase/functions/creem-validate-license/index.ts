// Creem License Validation Endpoint
// Validates a license key with Creem API

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface ValidateLicenseRequest {
  license_key: string;
}

interface CreemValidateResponse {
  valid: boolean;
  license?: {
    id: string;
    key: string;
    status: 'inactive' | 'active' | 'expired' | 'disabled';
    activation: number;
    activation_limit: number | null;
    expires_at: string | null;
    product_id: string;
    customer_email?: string;
  };
  message?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { license_key }: ValidateLicenseRequest = await req.json();

    if (!license_key) {
      return new Response(
        JSON.stringify({ success: false, error: 'License key is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize license key (remove dashes for consistency)
    const normalizedKey = license_key.replace(/-/g, '');
    
    console.log('[Validate License] Checking license:', license_key, 'normalized:', normalizedKey);

    // Get Creem credentials from env
    const creemApiKey = Deno.env.get('CREEM_API_KEY');
    const creemProductId = Deno.env.get('CREEM_PRODUCT_ID');

    if (!creemApiKey || !creemProductId) {
      throw new Error('Creem credentials not configured');
    }

    // Determine API base URL based on key prefix
    const isTestMode = creemApiKey.startsWith('creem_test_');
    const baseUrl = isTestMode 
      ? 'https://test-api.creem.io/v1'
      : 'https://api.creem.io/v1';

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check database first (for performance and offline validation)
    const { data: licenseInDb, error: dbError } = await supabase
      .from('licenses')
      .select('*')
      .eq('license_key', normalizedKey)
      .single();

    console.log('[Validate License] Database query result:', { 
      found: !!licenseInDb, 
      status: licenseInDb?.status,
      error: dbError?.code 
    });

    if (dbError && dbError.code !== 'PGRST116') {
      console.error('[Validate License] Database error:', dbError);
    }

    // If license exists in DB and is not active, return immediately
    if (licenseInDb && licenseInDb.status !== 'active') {
      let userMessage = 'License is not active';
      
      if (licenseInDb.status === 'revoked') {
        userMessage = 'This license has been revoked. Please contact support for assistance.';
      } else if (licenseInDb.status === 'refunded') {
        userMessage = 'This license was refunded and is no longer valid.';
      } else if (licenseInDb.status === 'expired') {
        userMessage = 'This license has expired. Please purchase a new license.';
      }
      
      return new Response(
        JSON.stringify({
          success: false,
          error: userMessage,
          status: licenseInDb.status,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If license exists in DB and is active, we can return success without API call
    // But we should periodically verify with Creem API to catch refunds
    if (licenseInDb && licenseInDb.status === 'active') {
      console.log('[Validate License] License found in database, returning cached result');
      return new Response(
        JSON.stringify({
          success: true,
          license: {
            key: normalizedKey,
            email: licenseInDb.email,
            status: licenseInDb.status,
            activated_at: licenseInDb.activated_at,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // License not in database
    console.log('[Validate License] License not found in database');
    
    // Note: We rely on webhook data from Creem. If it's not in our DB, it wasn't purchased.
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'License key not found. Please check that you entered it correctly. If you just purchased, please wait a few moments and try again.',
      }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Validate License] Error:', error);
    
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
