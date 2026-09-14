/**
 * License Key Input Component
 * UI for entering and activating a license key
 */

import React, { useState } from 'react';
import { useLicenseKey } from '../hooks/useLicenseKey';

interface LicenseKeyInputProps {
  onSuccess?: () => void;
  onActivated?: () => void;
  onCancel?: () => void;
}

export default function LicenseKeyInput({ onSuccess, onActivated, onCancel }: LicenseKeyInputProps) {
  const [licenseKey, setLicenseKey] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const { validateAndActivate, isValidating, isActivating } = useLicenseKey();

  const isLoading = isValidating || isActivating;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!licenseKey.trim()) {
      setMessage({ type: 'error', text: 'Please enter a license key' });
      return;
    }

    // Clean up the key (remove spaces, dashes, convert to uppercase)
    const cleanKey = licenseKey.trim().replace(/[\s-]/g, '').toUpperCase();

    const result = await validateAndActivate(cleanKey);

    if (result.success) {
      setMessage({ type: 'success', text: '✅ License activated successfully! Signing you in...' });
      setTimeout(() => {
        onSuccess?.();
        onActivated?.();
      }, 1500);
    } else {
      setMessage({ type: 'error', text: result.error || 'Activation failed' });
    }
  };

  return (
    <div style={{
      maxWidth: '500px',
      margin: '0 auto',
      padding: '24px',
      backgroundColor: '#fff',
      borderRadius: '8px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    }}>
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <h2 style={{ 
          fontSize: '24px', 
          fontWeight: 600, 
          marginBottom: '8px',
          color: '#1a1a1a',
        }}>
          Activate License Key
        </h2>
        <p style={{ 
          fontSize: '14px', 
          color: '#666',
          lineHeight: '1.5',
        }}>
          Enter your license key to activate and sign in
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '16px' }}>
          <label 
            htmlFor="license-key"
            style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#333',
            }}
          >
            License Key
          </label>
          <input
            id="license-key"
            type="text"
            value={licenseKey}
            onChange={(e) => setLicenseKey(e.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '16px',
              fontFamily: 'monospace',
              border: '2px solid #e0e0e0',
              borderRadius: '6px',
              outline: 'none',
              transition: 'border-color 0.2s',
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#4285f4';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#e0e0e0';
            }}
          />
        </div>

        {message && (
          <div
            style={{
              padding: '12px',
              marginBottom: '16px',
              borderRadius: '6px',
              fontSize: '14px',
              backgroundColor: message.type === 'success' ? '#d4edda' : '#f8d7da',
              color: message.type === 'success' ? '#155724' : '#721c24',
              border: `1px solid ${message.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`,
            }}
          >
            {message.text}
          </div>
        )}

        <div style={{ 
          display: 'flex', 
          gap: '12px',
          justifyContent: 'flex-end',
        }}>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 500,
                border: '1px solid #e0e0e0',
                borderRadius: '6px',
                backgroundColor: '#fff',
                color: '#666',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.5 : 1,
              }}
            >
              Cancel
            </button>
          )}
          
          <button
            type="submit"
            disabled={isLoading || !licenseKey.trim()}
            style={{
              padding: '10px 24px',
              fontSize: '14px',
              fontWeight: 500,
              border: 'none',
              borderRadius: '6px',
              backgroundColor: isLoading || !licenseKey.trim() ? '#ccc' : '#4285f4',
              color: '#fff',
              cursor: isLoading || !licenseKey.trim() ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!isLoading && licenseKey.trim()) {
                e.currentTarget.style.backgroundColor = '#3367d6';
              }
            }}
            onMouseLeave={(e) => {
              if (!isLoading && licenseKey.trim()) {
                e.currentTarget.style.backgroundColor = '#4285f4';
              }
            }}
          >
            {isLoading ? 'Activating...' : 'Activate License'}
          </button>
        </div>
      </form>

      <div style={{
        marginTop: '24px',
        padding: '16px',
        backgroundColor: '#f8f9fa',
        borderRadius: '6px',
        fontSize: '13px',
        color: '#666',
      }}>
        <p style={{ margin: '0 0 8px 0', fontWeight: 500 }}>
          Don't have a license key?
        </p>
        <a
          href="https://www.creem.io/payment/prod_3Jo8Eof8Rme7XdxHktib8h"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#4285f4',
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          Purchase RankMap Pro →
        </a>
      </div>
    </div>
  );
}
