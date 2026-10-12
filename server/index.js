require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN_PATH = path.join(__dirname, 'token.json');
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

function oauthClient() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return null;
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/auth/google/callback`);
}
function loadAuth() {
  const client = oauthClient();
  if (!client || !fs.existsSync(TOKEN_PATH)) return null;
  try { client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'))); return client; } catch { return null; }
}
app.get('/api/drive/status', (_req, res) => {
  const configured = Boolean(oauthClient());
  const connected = Boolean(loadAuth());
  res.json({ configured, connected, account: process.env.GOOGLE_ACCOUNT_EMAIL || 'rafiqulislam.globalwork@gmail.com' });
});
app.get('/auth/google', (_req, res) => {
  const client = oauthClient();
  if (!client) return res.status(400).send('Google Drive setup is incomplete. Copy .env.example to .env and add your OAuth credentials.');
  const url = client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: ['https://www.googleapis.com/auth/drive.file', 'openid', 'email'] });
  res.redirect(url);
});
app.get('/auth/google/callback', async (req, res) => {
  const client = oauthClient();
  if (!client) return res.status(400).send('Google OAuth is not configured.');
  if (req.query.error) return res.status(400).send('Google authorization was cancelled or denied.');
  try {
    const { tokens } = await client.getToken(req.query.code);
    client.setCredentials(tokens);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
    res.redirect('/?drive=connected');
  } catch (e) { console.error(e.message); res.status(500).send('Google authorization failed. Check your redirect URI and OAuth setup.'); }
});
app.post('/api/drive/backup', async (req, res) => {
  const auth = loadAuth();
  if (!auth) return res.status(401).json({ error: 'Google Drive is not connected. Complete the one-time setup first.' });
  const payload = req.body;
  if (!payload || !Array.isArray(payload.transactions)) return res.status(400).json({ error: 'Invalid backup data.' });
  try {
    const drive = google.drive({ version: 'v3', auth });
    let folderId;
    const found = await drive.files.list({ q: "name='Family Expense Backup' and mimeType='application/vnd.google-apps.folder' and trashed=false", fields: 'files(id,name)', pageSize: 10 });
    if (found.data.files && found.data.files.length) folderId = found.data.files[0].id;
    else {
      const folder = await drive.files.create({ requestBody: { name: 'Family Expense Backup', mimeType: 'application/vnd.google-apps.folder' }, fields: 'id' });
      folderId = folder.data.id;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `family-expense-backup-${stamp}.json`;
    const created = await drive.files.create({ requestBody: { name: fileName, parents: [folderId], mimeType: 'application/json' }, media: { mimeType: 'application/json', body: JSON.stringify(payload, null, 2) }, fields: 'id,name,webViewLink' });
    res.json({ ok: true, name: created.data.name, link: created.data.webViewLink || '', folder: 'Family Expense Backup' });
  } catch (e) { console.error(e.message); res.status(500).json({ error: 'Backup failed. Check Drive API and Google account permissions.' }); }
});
app.get('/api/drive/backups', async (_req, res) => {
  const auth = loadAuth();
  if (!auth) return res.status(401).json({ error: 'Google Drive is not connected.' });
  try {
    const drive = google.drive({ version: 'v3', auth });
    const folders = await drive.files.list({ q: "name='Family Expense Backup' and mimeType='application/vnd.google-apps.folder' and trashed=false", fields: 'files(id)', pageSize: 1 });
    if (!folders.data.files.length) return res.json({ files: [] });
    const result = await drive.files.list({ q: `'${folders.data.files[0].id}' in parents and trashed=false`, orderBy: 'createdTime desc', fields: 'files(id,name,createdTime,webViewLink)', pageSize: 50 });
    res.json({ files: result.data.files || [] });
  } catch (e) { res.status(500).json({ error: 'Could not list Drive backups.' }); }
});
app.get('/api/drive/backup/:id', async (req, res) => {
  const auth = loadAuth();
  if (!auth) return res.status(401).json({ error: 'Google Drive is not connected.' });
  try {
    const drive = google.drive({ version: 'v3', auth });
    const file = await drive.files.get({ fileId: req.params.id, alt: 'media' }, { responseType: 'text' });
    res.setHeader('Content-Type', 'application/json');
    res.send(file.data);
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: 'Could not fetch backup from Drive.' });
  }
});
app.listen(PORT, () => console.log(`Family Expense Tracker running at http://localhost:${PORT}`));
