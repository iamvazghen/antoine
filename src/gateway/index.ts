#!/usr/bin/env tsx
// Load .env first: the gateway is a separate entrypoint from the CLI, and it
// only picked up environment variables when some transitive import happened to
// pull in a module that loaded dotenv as a side effect. Run as a service, that
// is the difference between every API key being present and none of them.
import 'dotenv/config';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import util from 'node:util';
import {
  resolveWhatsAppAccount,
  loadGatewayConfig,
  saveGatewayConfig,
  getGatewayConfigPath,
  type GatewayConfig,
} from './config.js';
import { loginWhatsApp } from './channels/whatsapp/login.js';
import { getBotInfo } from './channels/telegram/index.js';
import { startGateway } from './gateway.js';

// Suppress noisy Baileys Signal protocol session logs
const SUPPRESSED_PREFIXES = [
  'Closing session:',
  'Opening session:',
  'Removing old closed session:',
  'Session already closed',
  'Session already open',
];

const originalLog = console.log;
console.log = (...args: unknown[]) => {
  const formatted = util.format(...args);
  if (SUPPRESSED_PREFIXES.some((prefix) => formatted.startsWith(prefix))) {
    return;
  }
  originalLog.apply(console, args);
};

const E164_RE = /^\+\d{7,15}$/;

async function promptSetupMode(cfg: GatewayConfig, linkedPhone: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log('');
    console.log(`Linked phone: ${linkedPhone}`);
    console.log('');
    console.log('How will you use Antoine with WhatsApp?');
    console.log('  1) Self-chat  — message yourself to talk to Antoine');
    console.log('  2) Bot phone  — this is a dedicated Antoine phone, others message it');

    let mode = '';
    while (mode !== '1' && mode !== '2') {
      mode = (await rl.question('\nChoose (1 or 2): ')).trim();
    }

    const accountId = cfg.gateway.accountId ?? 'default';

    if (mode === '1') {
      cfg.channels.whatsapp.allowFrom = [linkedPhone];
      return;
    }

    // Bot mode: collect allowed sender phone numbers
    console.log('');
    console.log('Enter the phone number(s) allowed to message Antoine (E.164 format, e.g. +15551234567).');
    console.log('Separate multiple numbers with commas, or type * to allow anyone.');

    let phones: string[] = [];
    while (phones.length === 0) {
      const input = (await rl.question('Allowed number(s): ')).trim();
      if (!input) continue;

      if (input === '*') {
        phones = ['*'];
        break;
      }

      phones = input.split(',').map((s) => s.trim()).filter(Boolean);
      const invalid = phones.filter((p) => !E164_RE.test(p));
      if (invalid.length > 0) {
        console.log(`Invalid format: ${invalid.join(', ')}. Use E.164 format (e.g. +15551234567).`);
        phones = [];
      }
    }

    cfg.channels.whatsapp.accounts[accountId] = {
      enabled: true,
      dmPolicy: 'allowlist',
      allowFrom: phones,
      groupPolicy: 'disabled',
      groupAllowFrom: [],
      sendReadReceipts: true,
    };
    cfg.channels.whatsapp.allowFrom = phones;
  } finally {
    rl.close();
  }
}

async function promptTelegramSetup(cfg: GatewayConfig): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('');
    console.log('Telegram setup — create a bot with @BotFather and paste its token below.');
    const envToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    let token = '';
    while (!token) {
      const prompt = envToken
        ? `Bot token [press Enter to use TELEGRAM_BOT_TOKEN]: `
        : 'Bot token: ';
      const input = (await rl.question(prompt)).trim();
      token = input || envToken || '';
      if (!token) console.log('A bot token is required.');
    }

    // Validate the token before persisting.
    try {
      const info = await getBotInfo(token);
      console.log(`Connected to @${info.username ?? info.id}.`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`Could not validate token: ${msg}`);
      return false;
    }

    console.log('');
    console.log('Who may DM the bot? Enter Telegram numeric user id(s) or @username(s),');
    console.log('comma-separated, or * to allow anyone.');
    let allowFrom: string[] = [];
    while (allowFrom.length === 0) {
      const input = (await rl.question('Allowed sender(s): ')).trim();
      if (!input) continue;
      allowFrom = input === '*' ? ['*'] : input.split(',').map((s) => s.trim()).filter(Boolean);
    }

    const accountId = cfg.gateway.accountId ?? 'default';
    cfg.channels.telegram.enabled = true;
    cfg.channels.telegram.accounts[accountId] = {
      enabled: true,
      botToken: token,
      allowFrom,
      groupPolicy: 'disabled',
      groupAllowFrom: [],
    };
    cfg.channels.telegram.allowFrom = allowFrom;
    return true;
  } finally {
    rl.close();
  }
}

async function run(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] ?? 'run';

  if (command === 'telegram') {
    const cfg = loadGatewayConfig();
    const ok = await promptTelegramSetup(cfg);
    if (ok) {
      const configPath = getGatewayConfigPath();
      saveGatewayConfig(cfg);
      console.log(`Saved gateway config to ${configPath}`);
      console.log('Run `npm run gateway` to start receiving Telegram messages.');
    }
    return;
  }

  if (command === 'login') {
    const cfg = loadGatewayConfig();
    const accountId = cfg.gateway.accountId ?? 'default';
    const account = resolveWhatsAppAccount(cfg, accountId);
    const result = await loginWhatsApp({ authDir: account.authDir });

    const configPath = getGatewayConfigPath();
    const configExists = existsSync(configPath);

    if (result.phone && (!configExists || cfg.channels.whatsapp.allowFrom.length === 0)) {
      await promptSetupMode(cfg, result.phone);
      saveGatewayConfig(cfg);
      console.log(`Saved gateway config to ${configPath}`);
    } else if (result.phone && configExists) {
      const currentAllowFrom = cfg.channels.whatsapp.allowFrom;
      if (!currentAllowFrom.includes(result.phone)) {
        console.log(`Config already exists at ${configPath} — no changes made.`);
        console.log(`Linked phone ${result.phone} is not in allowFrom. Edit the config if needed.`);
      }
    } else if (!configExists) {
      saveGatewayConfig(cfg);
      console.log(`Created default config at ${configPath}`);
      console.log('Add your phone number to channels.whatsapp.allowFrom to receive messages.');
    }
    return;
  }

  const server = await startGateway();
  console.log('Antoine gateway running. Press Ctrl+C to stop.');

  const shutdown = async () => {
    await server.stop();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

void run();

