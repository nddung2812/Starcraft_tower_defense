const { json, clientIp, rateLimit, mintRunToken, RUN_LIMIT } = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.end();
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });

  try {
    const ip = clientIp(req);
    if (!(await rateLimit('run', ip, RUN_LIMIT))) {
      return json(res, 429, { error: 'too many runs' });
    }
    const token = mintRunToken();
    return json(res, 200, { token });
  } catch (err) {
    console.error('run issue', err);
    return json(res, 503, { error: 'unavailable' });
  }
};
