// Creem License Activation Endpoint
// Activates a license key using Creem API and links to user account

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface ActivateLicenseRequest {
  license_key: string;
}

interface CreemActivateResponse {
  object: string;
  id: string;
  product_id: string;
  status: string;
  key: string;
  activation: number;
  activation_limit: number | null;
  expires_at: string | null;
  created_at: string;
  instance?: {
    object: string;
    id: string;
    name: string;
    status: string;
    created_at: string;
    mode: string;
  };
  mode: string;
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
    const { license_key }: ActivateLicenseRequest = await req.json();

    if (!license_key) {
      return new Response(
        JSON.stringify({ success: false, error: 'License key is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user from authorization header
    const authHeader = req.headers.get('authorization');
    console.log('[Activate License] Auth header present:', !!authHeader);
    
    if (!authHeader) {
      console.error('[Activate License] No authorization header');
      return new Response(
        JSON.stringify({ success: false, error: 'Not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    console.log('[Activate License] Token extracted, length:', token.length);

    // Initialize Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get user from JWT
    console.log('[Activate License] Validating token with Supabase...');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    console.log('[Activate License] Token validation result:', { 
      user: user ? `${user.id} (${user.email})` : null, 
      error: userError ? userError.message : null 
    });
    
    if (userError || !user) {
      console.error('[Activate License] Token validation failed:', userError);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid authentication', details: userError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize license key (remove dashes for consistency)
    const normalizedKey = license_key.replace(/-/g, '');
    
    console.log('[Activate License] User:', user.id, 'License:', license_key, 'normalized:', normalizedKey);

    // Check if license exists in our database
    const { data: license, error: licenseError } = await supabaseAdmin
      .from('licenses')
      .select('*')
      .eq('license_key', normalizedKey)
      .single();

    if (licenseError || !license) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'License key not found. Please check your key or contact support.',
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (license.status !== 'active') {
      return new Response(
        JSON.stringify({
          success: false,
          error: `License is ${license.status}`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if license is already activated by another user
    if (license.user_id && license.user_id !== user.id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'This license is already activated by another account',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user already has a different license
    const { data: userProfile } = await supabaseAdmin
      .from('profiles')
      .select('license_key, plan')
      .eq('id', user.id)
      .single();

    if (userProfile?.license_key && userProfile.license_key !== normalizedKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'You already have a different license activated',
          current_license: userProfile.license_key,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Activate license with Creem API using original key format
    const creemApiKey = Deno.env.get('CREEM_API_KEY')!;
    const isTestMode = creemApiKey.startsWith('creem_test_');
    const baseUrl = isTestMode 
      ? 'https://test-api.creem.io/v1'
      : 'https://api.creem.io/v1';

    // Get original key format from metadata (includes dashes)
    const originalKey = license.metadata?.original_key || license_key;
    
    console.log('[Activate License] Activating with Creem API...', {
      normalized: normalizedKey,
      original: originalKey
    });

    try {
      const creemResponse = await fetch(`${baseUrl}/licenses/activate`, {
        method: 'POST',
        headers: {
          'x-api-key': creemApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key: originalKey, // Use original format with dashes
          instance_name: user.email || user.id,
        }),
      });

      const creemData = await creemResponse.json();

      if (!creemResponse.ok) {
        console.error('[Activate License] Creem activation failed:', creemData);
        
        // Provide user-friendly error messages
        let userMessage = 'License activation failed';
        
        if (creemData.message) {
          const msg = Array.isArray(creemData.message) ? creemData.message[0] : creemData.message;
          
          // Map common Creem errors to user-friendly messages
          if (msg.toLowerCase().includes('not found')) {
            userMessage = 'License key not found. Please check your key and try again.';
          } else if (msg.toLowerCase().includes('limit')) {
            userMessage = 'This license has reached its activation limit. Each license can only be activated once. Please contact support if you need to deactivate a previous installation.';
          } else if (msg.toLowerCase().includes('expired')) {
            userMessage = 'This license has expired. Please purchase a new license or contact support.';
          } else if (msg.toLowerCase().includes('disabled') || msg.toLowerCase().includes('revoked')) {
            userMessage = 'This license has been disabled or revoked. Please contact support for assistance.';
          } else if (msg.toLowerCase().includes('invalid')) {
            userMessage = 'Invalid license key format. Please check your key and try again.';
          } else {
            userMessage = `License activation failed: ${msg}`;
          }
        }
        
        return new Response(
          JSON.stringify({
            success: false,
            error: userMessage,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Creem returns the license object directly on success (not {valid: true})
      // Check if we got a license object with an instance
      if (creemData.object === 'license' && creemData.instance) {
        console.log('[Activate License] Creem activation successful:', {
          license_id: creemData.id,
          instance_id: creemData.instance.id,
          instance_name: creemData.instance.name
        });
      } else {
        console.warn('[Activate License] Unexpected Creem response format:', creemData);
      }
    } catch (creemError) {
      console.error('[Activate License] Creem API error:', creemError);
      
      // If there's a network error or Creem is down, continue with local activation
      // The license is already validated in our database
      console.log('[Activate License] Continuing with local activation despite Creem API error');
      console.log('[Activate License] Note: License is valid in our database, proceeding without Creem confirmation');
    }

    // Update license record
    const now = new Date().toISOString();
    const { error: updateLicenseError } = await supabaseAdmin
      .from('licenses')
      .update({
        user_id: user.id,
        activated_at: license.activated_at || now,
        updated_at: now,
      })
      .eq('license_key', normalizedKey);

    if (updateLicenseError) {
      throw updateLicenseError;
    }

    const licenseEmail = license.email as string | undefined;

    // Upgrade anonymous / email-less accounts using the purchase email from Creem
    if (licenseEmail && (!user.email || user.is_anonymous)) {
      console.log('[Activate License] Upgrading auth user with purchase email:', licenseEmail);
      const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        email: licenseEmail,
        email_confirm: true,
        password: license_key,
      });

      if (authUpdateError) {
        console.error('[Activate License] Auth user upgrade failed:', authUpdateError);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'License activated with Creem but account upgrade failed. Please contact support.',
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Update user profile
    const { error: updateProfileError } = await supabaseAdmin
      .from('profiles')
      .update({
        email: licenseEmail ?? user.email ?? null,
        license_key: normalizedKey,
        license_activated_at: now,
        lifetime_purchased_at: now,
        plan: 'lifetime',
        plan_expires_at: null,
      })
      .eq('id', user.id);

    if (updateProfileError) {
      throw updateProfileError;
    }

    console.log('[Activate License] Successfully activated for user:', user.id);

    await supabaseAdmin.from('activity_events').insert({
      user_id: user.id,
      event_type: 'license_activated',
      metadata: { license_key: normalizedKey.slice(0, 8) + '…', source: 'creem' },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'License activated successfully',
        plan: 'lifetime',
        activated_at: now,
        email: licenseEmail ?? user.email ?? null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Activate License] Error:', error);
    
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
