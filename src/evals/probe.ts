// Probe the proxy for available models.
export {};
const key = process.env.MINIMAX_API_KEY;
const url = process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1';
const r = await fetch(`${url}/models`, {
  headers: { Authorization: `Bearer ${key}` },
});
console.log('status:', r.status);
console.log((await r.text()).slice(0, 3000));