// GeoService — looks up the public IP and its country.
// Primary: ipwho.is (free, no key, no datacenter-IP blocking).
// Fallbacks: ip-api.com (blocks some datacenter IPs), ipinfo.io (rate-limited).

const https = require('https');
const { countryNamesFA } = require('./country-names');

const TIMEOUT = 10000; // 10s

function fetch(url, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: TIMEOUT }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        return fetch(next, redirectsLeft - 1).then(resolve, reject);
      }
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('bad-json'));
        }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

function lookupIpWho() {
  return fetch('https://ipwho.is/')
    .then((r) => {
      if (!r.success) throw new Error('bad-response');
      const cc = (r.country_code || '').toUpperCase();
      if (!cc || !r.ip) throw new Error('bad-response');
      return {
        ip: r.ip,
        countryCode: cc,
        country: countryNamesFA[cc] || r.country || cc,
        isp: (r.connection && r.connection.isp) || '',
      };
    });
}

function lookupIpApi() {
  return fetch('https://ip-api.com/json/?fields=status,country,countryCode,query,isp')
    .then((r) => {
      if (r.status !== 'success') throw new Error('rate-limited');
      const cc = (r.countryCode || '').toUpperCase();
      if (!cc || !r.query) throw new Error('bad-response');
      return {
        ip: r.query,
        countryCode: cc,
        country: countryNamesFA[cc] || r.country || cc,
        isp: r.isp || '',
      };
    });
}

function lookupIpInfo() {
  return fetch('https://ipinfo.io/json')
    .then((r) => {
      const cc = (r.country || '').toUpperCase();
      if (!cc || !r.ip) throw new Error('bad-response');
      return {
        ip: r.ip,
        countryCode: cc,
        country: countryNamesFA[cc] || cc,
        isp: r.org || '',
      };
    });
}

const PROVIDERS = [lookupIpWho, lookupIpApi, lookupIpInfo];

/** Tries each provider in order. Returns {ip,countryCode,country,isp} or null. */
async function check() {
  for (const provider of PROVIDERS) {
    try {
      const info = await provider();
      if (info) return info;
    } catch {
      // try next provider
    }
  }
  return null;
}

module.exports = { check };