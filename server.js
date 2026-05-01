/*
    Local dev server for the quote tool and admin panel.

    Run this when you want /admin to save directly into pricing.json. It serves
    the static app files and exposes a tiny local-only API:
      GET /api/pricing  -> reads pricing.json
      PUT /api/pricing  -> writes pricing.json

    This is intentionally not a hosted backend yet. It listens on 127.0.0.1 so
    it is for local VSCode/admin work only.
*/
const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8008;
const ROOT = __dirname;
const PRICING_FILE = path.join(ROOT, 'pricing.json');

app.use(express.json({ limit: '2mb' }));

app.get('/api/pricing', async (req, res) => {
    try {
        const text = await fs.readFile(PRICING_FILE, 'utf8');
        res.type('json').send(text);
    } catch (error) {
        res.status(500).send(`Unable to read pricing.json: ${error.message}`);
    }
});

app.put('/api/pricing', async (req, res) => {
    try {
        const formatted = `${JSON.stringify(req.body, null, 2)}\n`;
        JSON.parse(formatted);
        await fs.writeFile(PRICING_FILE, formatted, 'utf8');
        res.json({ ok: true });
    } catch (error) {
        res.status(400).send(`Unable to write pricing.json: ${error.message}`);
    }
});

app.use(express.static(ROOT));

app.listen(PORT, '127.0.0.1', () => {
    console.log(`Quote tool running at http://127.0.0.1:${PORT}/`);
    console.log(`Admin panel running at http://127.0.0.1:${PORT}/admin/`);
});
