exports.handler = async function (event) {
  const query = event.queryStringParameters?.query;

  if (!query) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "No query provided" }),
    };
  }

  try {
    // Step 1 — search for the entity on Wikidata
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&limit=1&format=json&origin=*`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (!searchData.search || searchData.search.length === 0) {
      return {
        statusCode: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ found: false }),
      };
    }

    const entity = searchData.search[0];
    const entityId = entity.id;

    // Step 2 — fetch entity details and claims
    const detailUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${entityId}&languages=en&props=labels|descriptions|claims|sitelinks&format=json&origin=*`;
    const detailRes = await fetch(detailUrl);
    const detailData = await detailRes.json();

    const entityData = detailData.entities[entityId];
    const description = entityData.descriptions?.en?.value || "No description available";
    const label = entityData.labels?.en?.value || query;
    const wikipediaLink = entityData.sitelinks?.enwiki
      ? `https://en.wikipedia.org/wiki/${entityData.sitelinks.enwiki.title.replace(/ /g, "_")}`
      : null;

    // Step 3 — extract meaningful relationships
    const claims = entityData.claims || {};
    const propertyMap = {
      P31:  "Instance of",
      P106: "Occupation",
      P27:  "Country of citizenship",
      P19:  "Place of birth",
      P569: "Date of birth",
      P21:  "Gender",
      P108: "Employer",
      P69:  "Educated at",
      P463: "Member of",
      P101: "Field of work",
      P39:  "Position held",
      P135: "Movement",
      P17:  "Country",
      P131: "Located in",
      P571: "Inception",
      P452: "Industry",
      P169: "CEO",
      P112: "Founded by",
    };

    const connections = [];
    for (const [prop, label] of Object.entries(propertyMap)) {
      if (claims[prop]) {
        const claim = claims[prop][0];
        const val = claim?.mainsnak?.datavalue?.value;
        if (val) {
          if (typeof val === "object" && val.id) {
            // it's an entity reference — fetch its label
            try {
              const labelUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${val.id}&languages=en&props=labels&format=json&origin=*`;
              const labelRes = await fetch(labelUrl);
              const labelData = await labelRes.json();
              const connLabel = labelData.entities[val.id]?.labels?.en?.value;
              if (connLabel) {
                connections.push({ property: label, value: connLabel, entityId: val.id });
              }
            } catch (_) {}
          } else if (typeof val === "string") {
            connections.push({ property: label, value: val, entityId: null });
          } else if (val.time) {
            connections.push({ property: label, value: val.time.slice(1, 11), entityId: null });
          }
        }
      }
      if (connections.length >= 7) break;
    }

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        found: true,
        entityId,
        label,
        description,
        wikipediaLink,
        wikidataLink: `https://www.wikidata.org/wiki/${entityId}`,
        connections,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to fetch from Wikidata: " + err.message }),
    };
  }
};