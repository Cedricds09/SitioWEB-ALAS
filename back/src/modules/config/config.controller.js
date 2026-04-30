// Controller — config público para frontend.
// Sirve la API key de Maps (restringida por dominio en GCP) sin hardcodearla en el repo.

const env = require('../../shared/config/env');

function obtener(_req, res) {
  res.json({
    ok: true,
    data: {
      mapsApiKey: env.GOOGLE_MAPS_API_KEY,
    },
  });
}

module.exports = { obtener };
