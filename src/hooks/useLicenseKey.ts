/**
 * License Key Management Hook
 * Handles license key validation and activation
 */

import { useState } from 'react';
import { supabase } from '../supabase';

interface LicenseValidationResult {
  success: boolean;
  error?: string;
  license?: {
    key: string;
    email: string;
    product_name: string;
    purchase_date: string;
  };
}

interface LicenseActivationResult {
  success: boolean;
  error?: string;
  plan?: string;
  activated_at?: string;
  current_license?: string;
}

export function useLicenseKey() {
  const [isValidating, setIsValidating] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Validate a license key with Gumroad
   */
  const validateLicense = async (
    licenseKey: string
  ): Promise<LicenseValidationResult> => {
    setIsValidating(true);
    setError(null);

    try {
      if (!supabase) {
        throw new Error('Supabase is not configured');
      }

      const { data, error: funcError } = await supabase.functions.invoke(
        'creem-validate-license',
        {
          body: { license_key: licenseKey },
        }
      );

      console.log('[License Validation] Response:', { data, funcError });

      // If there's a function error, try to extract custom message
      if (funcError) {
        // Try to read the response body from funcError.context
        try {
          if (funcError.context && typeof funcError.context.json === 'function') {
            const errorData = await funcError.context.json();
            console.log('[License Validation] Error data:', errorData);
            if (errorData && errorData.error) {
              const errorMsg = errorData.error;
              setError(errorMsg);
              return { success: false, error: errorMsg };
            }
          }
        } catch (parseError) {
          console.error('[License Validation] Failed to parse error response:', parseError);
        }
        
        // Fallback to generic error message
        const errorMsg = funcError.message || 'Validation failed';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }

      // Check data for success/failure
      if (!data || !data.success) {
        const errorMsg = data?.error || 'Invalid license key';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }

      return {
        success: true,
        license: data.license,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Validation failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsValidating(false);
    }
  };

  /**
   * Sign in with license key (for returning users or new devices)
   */
  const signInWithLicenseKey = async (
    licenseKey: string
  ): Promise<LicenseActivationResult> => {
    setIsActivating(true);
    setError(null);

    try {
      if (!supabase) {
        throw new Error('Supabase is not configured');
      }

      // Step 1: Validate the license key first
      const { data: validateData, error: validateError } = await supabase.functions.invoke(
        'creem-validate-license',
        {
          body: { license_key: licenseKey },
        }
      );

      if (validateError || !validateData?.success) {
        const errorMsg = validateData?.error || 'Invalid license key';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }

      const email = validateData.license.email;

      // Step 2: Try to sign in with email + license key as password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: licenseKey,
      });

      if (signInError) {
        // If sign in fails, account might not exist - guide user to activate
        setError('Account not found. Please activate your license first.');
        return { success: false, error: 'Account not found. Please activate your license first.' };
      }

      // Success!
      return {
        success: true,
        plan: 'lifetime',
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sign in failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsActivating(false);
    }
  };

  /**
   * Activate a license key (creates account if needed, then activates)
   */
  const activateLicense = async (
    licenseKey: string
  ): Promise<LicenseActivationResult> => {
    setIsActivating(true);
    setError(null);

    try {
      if (!supabase) {
        throw new Error('Supabase is not configured');
      }

      const client = supabase;

      // Step 1: Validate the license key
      console.log('[License Activation] Step 1: Validating license key...');
      const { data: validateData, error: validateError } = await client.functions.invoke(
        'creem-validate-license',
        {
          body: { license_key: licenseKey },
        }
      );

      console.log('[License Activation] Validation response:', { validateData, validateError });

      if (validateError || !validateData?.success) {
        const errorMsg = validateData?.error || 'Invalid license key';
        console.error('[License Activation] Validation failed:', errorMsg);
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }

      const email = validateData.license?.email;
      const alreadyActivated = validateData.license?.activated_at != null;
      console.log('[License Activation] Extracted email:', email, 'Already activated:', alreadyActivated);

      if (!email) {
        console.error('[License Activation] No email found in validation response');
        setError('Failed to extract email from license. Please contact support.');
        return { success: false, error: 'Failed to extract email from license.' };
      }

      // Step 2: Check if user is signed in
      console.log('[License Activation] Step 2: Checking existing session...');
      let {
        data: { session },
      } = await client.auth.getSession();
      console.log('[License Activation] Existing session:', session ? 'Found' : 'None');

      // If session exists but user might be deleted, sign out first
      if (session) {
        console.log('[License Activation] Checking if session user still exists...');
        try {
          const { data: { user: sessionUser }, error: userCheckError } = await client.auth.getUser();
          if (userCheckError || !sessionUser) {
            console.warn('[License Activation] Session user deleted or invalid, signing out...');
            await client.auth.signOut();
            session = null;
          }
        } catch (err) {
          console.warn('[License Activation] Error checking session user, signing out...');
          await client.auth.signOut();
          session = null;
        }
      }

      // If license is already activated and we're not signed in, just sign in
      if (alreadyActivated && !session) {
        console.log('[License Activation] License already activated, signing in instead of activating...');
        const { error: signInError } = await client.auth.signInWithPassword({
          email,
          password: licenseKey,
        });

        if (signInError) {
          console.error('[License Activation] Sign in failed:', signInError);
          setError('Failed to sign in. Please try again.');
          return { success: false, error: 'Failed to sign in. Please try again.' };
        }

        console.log('[License Activation] Signed in successfully!');

        try {
          await chrome.runtime.sendMessage({ type: 'AUTH_REFRESH_STATE' });
        } catch {
          // Non-extension context
        }

        return {
          success: true,
          plan: 'lifetime',
        };
      }

      // Step 3: Anonymous users keep their session — server upgrades auth + profile during activation
      if (session?.user?.is_anonymous) {
        console.log('[License Activation] Anonymous session detected; server will upgrade account on activation');
      }
      // Step 4: If not signed in and license NOT yet activated, create account and sign in
      else if (!session) {
        console.log('[License Activation] No session, creating account...');
        
        // Try to sign up with email + license key as password
        const { error: signUpError } = await client.auth.signUp({
          email,
          password: licenseKey,
          options: {
            data: {
              license_key: licenseKey,
            },
          },
        });

        if (signUpError) {
          // If account already exists, try to sign in instead
          if (signUpError.message.includes('already registered') || signUpError.message.includes('already exists')) {
            const { error: signInError } = await client.auth.signInWithPassword({
              email,
              password: licenseKey,
            });

            if (signInError) {
              setError('Failed to sign in with this license. Please contact support.');
              return { success: false, error: 'Failed to sign in with this license.' };
            }

            console.log('[License Activation] Signed in successfully');
            
            // Wait a moment for session to be established
            await new Promise(resolve => setTimeout(resolve, 500));
          } else {
            setError(signUpError.message);
            return { success: false, error: signUpError.message };
          }
        } else {
          console.log('[License Activation] Account created, waiting for session...');
          
          // Wait a moment for session to be established
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Verify session is now available
        const { data: { session: newSession } } = await client.auth.getSession();
        console.log('[License Activation] New session check:', newSession ? 'Established' : 'NOT FOUND');
        
        if (!newSession) {
          console.error('[License Activation] Failed to establish session after sign-up/sign-in');
          setError('Failed to establish session. Please try again.');
          return { success: false, error: 'Failed to establish session.' };
        }

        console.log('[License Activation] Session established successfully, user:', newSession.user?.email);
      }

      // Step 5: Call activation endpoint
      console.log('[License Activation] Step 4: Calling activation endpoint...');
      
      // Get current session one more time to ensure it's available
      const { data: { session: finalSession } } = await client.auth.getSession();
      console.log('[License Activation] Final session before activation:', 
        finalSession ? `User: ${finalSession.user?.email}, Token exists: ${!!finalSession.access_token}` : 'NO SESSION');
      
      if (!finalSession) {
        console.error('[License Activation] No session available for activation endpoint');
        setError('Authentication session lost. Please try again.');
        return { success: false, error: 'Authentication session lost.' };
      }

      const { data, error: funcError } = await client.functions.invoke(
        'creem-activate-license',
        {
          body: { license_key: licenseKey },
        }
      );

      console.log('[License Activation] Activation response:', { data, funcError });

      // If there's a function error, try to extract custom message
      if (funcError) {
        // Try to read the response body from funcError.context
        try {
          if (funcError.context && typeof funcError.context.json === 'function') {
            const errorData = await funcError.context.json();
            console.log('[License Activation] Error data:', errorData);
            if (errorData && errorData.error) {
              const errorMsg = errorData.error;
              setError(errorMsg);
              return { 
                success: false, 
                error: errorMsg,
                current_license: errorData.current_license,
              };
            }
          }
        } catch (parseError) {
          console.error('[License Activation] Failed to parse error response:', parseError);
        }
        
        // Fallback to generic error message
        const errorMsg = funcError.message || 'Activation failed';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }

      // Check data for success/failure
      if (!data || !data.success) {
        const errorMsg = data?.error || 'Activation failed';
        setError(errorMsg);
        return { 
          success: false, 
          error: errorMsg,
          current_license: data?.current_license,
        };
      }

      // Re-sign in so the client picks up email/password set by the activation endpoint
      console.log('[License Activation] Refreshing session after activation...');
      await client.auth.signInWithPassword({ email, password: licenseKey });

      try {
        await chrome.runtime.sendMessage({ type: 'AUTH_REFRESH_STATE' });
      } catch {
        // Non-extension context — caller may refresh separately
      }

      return {
        success: true,
        plan: data.plan,
        activated_at: data.activated_at,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Activation failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsActivating(false);
    }
  };

  /**
   * Complete flow: activates license (includes validation, account creation, sign-in)
   */
  const validateAndActivate = async (
    licenseKey: string
  ): Promise<LicenseActivationResult> => {
    // The activateLicense function now handles everything:
    // - Validation
    // - Account creation (if needed)
    // - Sign in
    // - Activation
    return await activateLicense(licenseKey);
  };

  return {
    validateLicense,
    activateLicense,
    validateAndActivate,
    signInWithLicenseKey,
    isValidating,
    isActivating,
    error,
  };
}
