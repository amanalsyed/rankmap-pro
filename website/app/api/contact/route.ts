import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

interface ContactBody {
  name?: string;
  phone?: string;
  email?: string;
  message?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_TO = 'rankmappro@gmail.com';

function clean(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function buildEmailText(name: string, email: string, phone: string, message: string): string {
  return [
    `Name: ${name}`,
    `Email: ${email}`,
    phone ? `Phone: ${phone}` : 'Phone: (not provided)',
    '',
    'Message:',
    message,
  ].join('\n');
}

async function sendViaGmail(
  to: string,
  name: string,
  email: string,
  phone: string,
  message: string
): Promise<void> {
  const user = process.env.GMAIL_USER ?? DEFAULT_TO;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!pass) {
    throw new Error('GMAIL_APP_PASSWORD is not configured');
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: `"RankMap Pro Website" <${user}>`,
    to,
    replyTo: email,
    subject: `RankMap Pro contact — ${name}`,
    text: buildEmailText(name, email, phone, message),
  });
}

async function sendViaResend(
  to: string,
  name: string,
  email: string,
  phone: string,
  message: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  const from = process.env.CONTACT_FROM_EMAIL ?? 'RankMap Pro <onboarding@resend.dev>';

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
      subject: `RankMap Pro contact — ${name}`,
      text: buildEmailText(name, email, phone, message),
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Resend error ${res.status}: ${detail}`);
  }
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

    const to = process.env.CONTACT_TO_EMAIL ?? DEFAULT_TO;

    if (process.env.GMAIL_APP_PASSWORD) {
      await sendViaGmail(to, name, email, phone, message);
    } else if (process.env.RESEND_API_KEY) {
      await sendViaResend(to, name, email, phone, message);
    } else {
      console.error('[contact] No email provider configured (set GMAIL_APP_PASSWORD or RESEND_API_KEY)');
      return NextResponse.json(
        {
          error:
            'Contact form is not configured yet. Email us directly at rankmappro@gmail.com.',
        },
        { status: 503 }
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
