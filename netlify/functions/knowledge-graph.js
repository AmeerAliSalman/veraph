exports.handler = async function (event) {
  const query = event.queryStringParameters?.query;

  if (!query) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "No query provided" }),
    };
  }

  const API_KEY = process.env.GOOGLE_KG_API_KEY;
  const url = `https://kgsearch.googleapis.com/v1/entities:search?query=${encodeURIComponent(query)}&key=${API_KEY}&limit=3&indent=True`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to fetch from Google KG API" }),
    };
  }
};