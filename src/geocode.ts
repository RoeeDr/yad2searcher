let lastNominatimRequest = 0;

interface GeoLocation {
  lat: number;
  lng: number;
}

export async function geocodeAddress(
  street: string,
  infoLine1: string
): Promise<GeoLocation | null> {
  try {
    if (!street) return null;

    // infoLine1 format varies: "דירה, רמת גן" or "דירה, שכונת הראשונים, רמת גן"
    // City is always the last segment
    const segments = infoLine1.split(",").map((s) => s.trim());
    const city = segments[segments.length - 1];
    const cleanStreet = street
      .replace(/^רחוב\s+/, "")
      .replace(/^רח'\s+/, "")
      .replace(/^רח\s+/, "")
      .trim();

    // Nominatim rate limit: max 1 request/second
    const now = Date.now();
    const timeSinceLast = now - lastNominatimRequest;
    if (timeSinceLast < 1000) {
      await new Promise((resolve) => setTimeout(resolve, 1000 - timeSinceLast));
    }
    lastNominatimRequest = Date.now();

    const params = new URLSearchParams({
      street: cleanStreet,
      city,
      countrycodes: "il",
      format: "json",
      limit: "1",
    });

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      {
        headers: { "User-Agent": "Yad2Searcher/1.0" },
      }
    );

    if (!response.ok) {
      console.error(`[geocode] Nominatim error: ${response.status}`);
      return null;
    }

    const results = (await response.json()) as Array<{ lat: string; lon: string }>;
    if (!results.length) {
      console.log(`[geocode] No results for: ${cleanStreet}, ${city}`);
      return null;
    }

    const { lat, lon } = results[0];
    console.log(`[geocode] ${cleanStreet}, ${city} -> ${lat},${lon}`);
    return { lat: parseFloat(lat), lng: parseFloat(lon) };
  } catch (err) {
    console.error(`[geocode] Error:`, err);
    return null;
  }
}

