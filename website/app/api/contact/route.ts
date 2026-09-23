import { NextResponse } from 'next/server';
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from '@/lib/supabase/server';

interface ContactBody {
  name?: string;
  phone?: string;
  email?: string;
  message?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ContactBody;

    const name = clean(body.name, 120);
    const phone = clean(body.phone, 40);
    const email = clean(body.email, 200);
    const message = clean(body.message, 5000);

    if (!name) {
      return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 });
    }

    if (!email || !EMAIL_PATTERN.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({ error: 'Please enter a message.' }, { status: 400 });
    }

    if (!isSupabaseAdminConfigured()) {
      console.error('[contact] Supabase service role is not configured');
      return NextResponse.json(
        {
          error:
            'Contact form is not configured yet. Email us directly at rankmappro@gmail.com.',
        },
        { status: 503 }
      );
    }

    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.from('contact_submissions').insert({
      name,
      email,
      phone: phone || null,
      message,
    });

    if (error) {
      console.error('[contact]', error);
      return NextResponse.json(
        { error: 'Failed to send message. Please try again or email rankmappro@gmail.com.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[contact]', err);
    return NextResponse.json(
      { error: 'Failed to send message. Please try again or email rankmappro@gmail.com.' },
      { status: 502 }
    );
  }
}
