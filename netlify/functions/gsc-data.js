exports.handler = async function (event) {
  const { userId } = event.queryStringParameters || {};

  if (!userId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'No userId provided' }),
    };
  }

  const SUPABASE_URL = 'https://lshyqsrwtnlekgpyaduw.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

  try {
    // Step 1 — get tokens from Supabase
    const tokenRes = await fetch(`${SUPABASE_URL}/rest/v1/gsc_tokens?user_id=eq.${userId}&select=*`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    });
    const tokens = await tokenRes.json();

    if (!tokens || tokens.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'No GSC connection found' }),
      };
    }

    let accessToken = tokens[0].access_token;
    const refreshToken = tokens[0].refresh_token;

    // Step 2 — refresh access token if needed
    if (refreshToken) {
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });
      const refreshData = await refreshRes.json();
      if (refreshData.access_token) {
        accessToken = refreshData.access_token;
        // update token in Supabase
        await fetch(`${SUPABASE_URL}/rest/v1/gsc_tokens?user_id=eq.${userId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify({ access_token: accessToken }),
        });
      }
    }

    // Step 3 — get list of GSC sites
    const sitesRes = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const sitesData = await sitesRes.json();
    const sites = sitesData.siteEntry || [];

    if (sites.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ connected: true, noSites: true }),
      };
    }

    const siteUrl = sites[0].siteUrl;

    // Step 4 — fetch performance data
    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [overviewRes, queriesRes] = await Promise.all([
      fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, dimensions: ['date'], rowLimit: 90 }),
      }),
      fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, dimensions: ['query'], rowLimit: 10 }),
      }),
    ]);

    const overviewData = await overviewRes.json();
    const queriesData = await queriesRes.json();

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        connected: true,
        siteUrl,
        rows: overviewData.rows || [],
        queries: queriesData.rows || [],
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch GSC data: ' + err.message }),
    };
  }
};