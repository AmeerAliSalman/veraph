exports.handler = async function (event) {
  const { code, userId } = event.queryStringParameters || {};

  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REDIRECT_URI = 'https://ephemeral-salamander-6df354.netlify.app/.netlify/functions/gsc-auth';
  const SUPABASE_URL = 'https://lshyqsrwtnlekgpyaduw.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  // Step 1 — no code yet, redirect to Google OAuth
  if (!code) {
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/webmasters.readonly');
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', userId || '');

    return {
      statusCode: 302,
      headers: { Location: authUrl.toString() },
      body: '',
    };
  }

  // Step 2 — exchange code for tokens
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();

    if (!tokens.access_token) {
      return {
        statusCode: 302,
        headers: { Location: 'https://ephemeral-salamander-6df354.netlify.app/dashboard.html?gsc=error' },
        body: '',
      };
    }

    // Step 3 — save tokens to Supabase
    const state = event.queryStringParameters.state;
    await fetch(`${SUPABASE_URL}/rest/v1/gsc_tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        user_id: state,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
      }),
    });

    return {
      statusCode: 302,
      headers: { Location: 'https://ephemeral-salamander-6df354.netlify.app/dashboard.html?gsc=connected' },
      body: '',
    };
  } catch (err) {
    return {
      statusCode: 302,
      headers: { Location: 'https://ephemeral-salamander-6df354.netlify.app/dashboard.html?gsc=error' },
      body: '',
    };
  }
};