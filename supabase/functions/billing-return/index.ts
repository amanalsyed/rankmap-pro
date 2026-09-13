import { syncPlanFromCheckoutId } from '../_shared/plan-sync.ts';

function htmlResponse(title: string, message: string): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 520px; margin: 48px auto; padding: 0 20px; line-height: 1.5; color: #111; }
    h1 { font-size: 1.5rem; }
    p { color: #444; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p>${message}</p>
  <p>Open the RankMap Pro extension &rarr; <strong>Settings &rarr; Account</strong> to confirm your plan updated.</p>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? 'success';
  const checkoutId =
    url.searchParams.get('checkout_id') ??
    url.searchParams.get('checkoutId') ??
    url.searchParams.get('checkout');

  if (status !== 'cancel' && checkoutId) {
    try {
      await syncPlanFromCheckoutId(checkoutId);
    } catch (error) {
      console.error('[billing-return] checkout sync failed:', error);
    }
  }

  if (status === 'cancel') {
    return htmlResponse(
      'Checkout canceled',
      'No payment was made. You can upgrade anytime from Settings in the extension.'
    );
  }

  return htmlResponse(
    'Payment successful',
    'Thank you! Your subscription is being activated. If your plan does not update within a minute, open Settings and sign out/in once.'
  );
});
