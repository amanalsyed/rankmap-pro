import { corsHeaders, jsonResponse } from '../_shared/polar.ts';
import { createAdminClient, getUserFromRequest } from '../_shared/supabase-admin.ts';

type FeedbackCategory = 'bug' | 'feature' | 'general';

interface FeedbackBody {
  category?: FeedbackCategory;
  message?: string;
  email?: string;
  extensionVersion?: string;
  pageUrl?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_MESSAGE = 10;
const MAX_MESSAGE = 2000;

function clean(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function isCategory(value: unknown): value is FeedbackCategory {
  return value === 'bug' || value === 'feature' || value === 'general';
}

function categoryLabel(category: FeedbackCategory): string {
  if (category === 'bug') return 'Bug report';
  if (category === 'feature') return 'Feature request';
  return 'General feedback';
}

async function notifyByEmail(
  to: string,
  category: FeedbackCategory,
  message: string,
  email: string,
  plan: string | null,
  extensionVersion: string | null
): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return;

  const from = Deno.env.get('FEEDBACK_FROM_EMAIL') ?? 'RankMap Pro <onboarding@resend.dev>';
  const subject = `RankMap Pro feedback — ${categoryLabel(category)}`;
  const text = [
    `Category: ${categoryLabel(category)}`,
    `From: ${email}`,
    plan ? `Plan: ${plan}` : null,
    extensionVersion ? `Extension: v${extensionVersion}` : null,
    '',
    message,
  ]
    .filter(Boolean)
    .join('\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: email,
      subject,
      text,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error('[submit-feedback] Resend error:', res.status, detail);
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders(origin));
  }

  try {
    const body = (await req.json()) as FeedbackBody;

    if (!isCategory(body.category)) {
      return jsonResponse({ error: 'Please choose a feedback type.' }, 400, corsHeaders(origin));
    }

    const message = clean(body.message, MAX_MESSAGE);
    if (message.length < MIN_MESSAGE) {
      return jsonResponse(
        { error: `Message must be at least ${MIN_MESSAGE} characters.` },
        400,
        corsHeaders(origin)
      );
    }

    const user = await getUserFromRequest(req);
    let email = clean(body.email, 200);
    let plan: string | null = null;

    if (user) {
      const admin = createAdminClient();
      const { data: profile } = await admin
        .from('profiles')
        .select('email, plan')
        .eq('id', user.id)
        .maybeSingle();

      if (!email && profile?.email) {
        email = profile.email;
      }
      plan = profile?.plan ?? null;
    }

    if (!email || !EMAIL_PATTERN.test(email)) {
      return jsonResponse({ error: 'Please enter a valid email address.' }, 400, corsHeaders(origin));
    }

    const extensionVersion = clean(body.extensionVersion, 40) || null;
    const pageUrl = clean(body.pageUrl, 500) || null;

    const admin = createAdminClient();
    const { error: insertError } = await admin.from('feedback').insert({
      user_id: user?.id ?? null,
      email,
      category: body.category,
      message,
      extension_version: extensionVersion,
      plan,
      page_url: pageUrl,
    });

    if (insertError) {
      console.error('[submit-feedback] insert failed:', insertError.message);
      return jsonResponse({ error: 'Could not save feedback. Please try again.' }, 500, corsHeaders(origin));
    }

    const notifyTo = Deno.env.get('FEEDBACK_NOTIFY_EMAIL') ?? Deno.env.get('CONTACT_TO_EMAIL');
    if (notifyTo) {
      try {
        await notifyByEmail(notifyTo, body.category, message, email, plan, extensionVersion);
      } catch (err) {
        console.error('[submit-feedback] notify failed:', err);
      }
    }

    return jsonResponse({ ok: true }, 200, corsHeaders(origin));
  } catch (err) {
    console.error('[submit-feedback]', err);
    return jsonResponse({ error: 'Unexpected error. Please try again.' }, 500, corsHeaders(origin));
  }
});
