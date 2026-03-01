const axios = require('axios');
async function run() {
  const names = ["Marywood University", "Harvard University", "Stanford University", "Yale University", "Princeton University"];
  console.time("geocoding");
  const promises = names.map(name => 
    axios.get(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)}&format=json&limit=1`, {
      headers: { "User-Agent": "MultiverseBackend/1.0" },
      timeout: 5000
    }).catch(e => ({error: e.message}))
  );
  const results = await Promise.all(promises);
  console.timeEnd("geocoding");
  results.forEach(r => {
    if (r.error) console.log(r.error);
    else console.log(r.data?.[0]?.lat);
  });
}
run();
