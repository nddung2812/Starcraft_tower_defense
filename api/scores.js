const {
  json, clientIp, rateLimit, verifyRun, validateRun, consumeRunToken,
  saveScore, listTopScores, POST_LIMIT
} = require('./_lib');

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 4096) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8') || '{}';
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.end();
  }

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const limit = Number(url.searchParams.get('limit') || 10);
      const scores = await listTopScores(limit);
      return json(res, 200, { scores }, { 'Cache-Control': 'public, max-age=5, s-maxage=5' });
    }

    if (req.method === 'POST') {
      const ip = clientIp(req);
      if (!(await rateLimit('post', ip, POST_LIMIT))) {
        return json(res, 429, { error: 'too many submissions' });
      }

      const body = await readBody(req);
      const payload = verifyRun(body.runToken);
      if (!payload) return json(res, 401, { error: 'invalid run token' });

      const checked = validateRun(body);
      if (!checked.ok) return json(res, 400, { error: checked.error });

      const used = await consumeRunToken(payload);
      if (!used.ok) return json(res, 400, { error: used.error });

      const { rank } = await saveScore(checked.run);
      return json(res, 200, { rank });
    }

    return json(res, 405, { error: 'method not allowed' });
  } catch (err) {
    console.error('scores', err);
    return json(res, 503, { error: 'unavailable' });
  }
};
