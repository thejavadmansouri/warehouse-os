const fs = require('fs');

async function analyze() {
  try {
    const res = await fetch('https://barezpakhsh.com', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(15000)
    });
    const html = await res.text();
    
    // Save sample or inspect
    const links = [];
    const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = linkRegex.exec(html)) !== null) {
      const cleanText = m[2].replace(/<[^>]+>/g, '').trim();
      if (cleanText && cleanText.length < 50 && !m[1].startsWith('#')) {
        links.push({ href: m[1], text: cleanText });
      }
    }
    
    console.log('Total links found:', links.length);
    const unique = [];
    const seen = new Set();
    for (const l of links) {
      if (!seen.has(l.text)) {
        seen.add(l.text);
        unique.push(l);
      }
    }
    console.log('Sample Unique Links (up to 40):');
    console.log(JSON.stringify(unique.slice(0, 40), null, 2));

    // Extract headings
    const headings = [];
    const hRegex = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi;
    while ((m = hRegex.exec(html)) !== null) {
      const clean = m[1].replace(/<[^>]+>/g, '').trim();
      if (clean) headings.push(clean);
    }
    console.log('Headings:', [...new Set(headings)].slice(0, 30));

  } catch (err) {
    console.error('Error:', err.message);
  }
}

analyze();
