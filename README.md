# Antoine 🤖

**Antoine** is a self-hosted, autonomous financial-research analyst that lives in your terminal — and, when you want, in your pocket via WhatsApp and Telegram. It decomposes a question into a research plan, pulls live data across equities, crypto, foreign exchange and macroeconomics, checks its own work, and returns a confident, source-cited answer.

Antoine is **local-first**: it defaults to a free, locally-proxied model (FreeLLMAPI auto-routing) so you can run it end-to-end without signing up for a single hosted LLM, then graduate to OpenAI / Anthropic / Google / xAI / DeepSeek / OpenRouter whenever you like. Install it once and call `antoine` from any folder.

<img width="665" height="452" alt="Screenshot 2026-04-02 at 4 16 57 PM" src="https://github.com/user-attachments/assets/02418111-5f48-4a66-be5d-dc9bf9806284" />

## Table of Contents

- [👋 Overview](#-overview)
- [✅ Prerequisites](#-prerequisites)
- [💻 How to Install](#-how-to-install)
- [🚀 How to Run](#-how-to-run)
- [📊 How to Evaluate](#-how-to-evaluate)
- [🐛 How to Debug](#-how-to-debug)
- [📱 How to Use with WhatsApp](#-how-to-use-with-whatsapp)
- [✈️ How to Use with Telegram](#️-how-to-use-with-telegram)
- [🤝 How to Contribute](#-how-to-contribute)
- [📄 License](#-license)

## ⚠️ Disclaimer

This project is for **educational, entertainment, and informational purposes only**. It is not intended for real trading or investment.

- Not financial, investment, tax, or legal advice
- No guarantees of accuracy, completeness, or fitness for any purpose
- Outputs may be incorrect, incomplete, or out of date
- Creator and contributors assume no liability for any financial losses or damages
- Consult a licensed financial advisor before making investment decisions
- Past performance does not indicate future results

By using this software, you agree to use it solely for learning and informational purposes and accept all risks associated with its use.

## 👋 Overview

Antoine takes complex financial questions and turns them into clear, step-by-step research plans. It runs those tasks using live market data, checks its own work, and refines the results until it has a confident, data-backed answer.  

**Key Capabilities:**
- **Intelligent Task Planning**: Automatically decomposes complex queries into structured research steps
- **Autonomous Execution**: Selects and executes the right tools to gather financial data
- **Self-Validation**: Checks its own work and iterates until tasks are complete
- **Broad Market Coverage**: Equities (statements, ratios, filings, insider & institutional activity), crypto, **foreign-exchange rates** (ECB), and **macroeconomic indicators** (World Bank) — the last two need no API key
- **Local-First Models**: FreeLLMAPI auto-routing by default; swap to any major hosted provider or Ollama from the in-app `/model` menu
- **Talk to it anywhere**: interactive CLI, plus optional WhatsApp and Telegram gateways
- **Persistent Memory**: learns your preferences and recalls past research across sessions
- **Safety Features**: Built-in loop detection and step limits to prevent runaway execution


<img width="1042" height="638" alt="Screenshot 2026-02-18 at 12 21 25 PM" src="https://github.com/user-attachments/assets/2a6334f9-863f-4bd2-a56f-923e42f4711e" />


## ✅ Prerequisites

- [Bun](https://bun.com) runtime (v1.0 or higher)
- An LLM — **no key required by default**: Antoine routes through the FreeLLMAPI proxy at `http://localhost:3001/v1`. Just make sure that proxy is running, or set any hosted provider key (OpenAI, Anthropic, Google, xAI, DeepSeek, OpenRouter) and pick it from the in-app `/model` menu.
- Financial Datasets API key (get [here](https://financialdatasets.ai)) — for equities data
- Exa API key (get [here](https://exa.ai)) — optional, for web search
- FX rates (ECB) and macroeconomic indicators (World Bank) work with **no key**

#### Installing Bun

If you don't have Bun installed, you can install it using curl:

**macOS/Linux:**
```bash
curl -fsSL https://bun.com/install | bash
```

**Windows:**
```bash
powershell -c "irm bun.sh/install.ps1|iex"
```

After installation, restart your terminal and verify Bun is installed:
```bash
bun --version
```

## 💻 How to Install

1. Clone the repository:
```bash
git clone https://github.com/iamvazghen/antoine.git
cd antoine
```

2. Install dependencies with Bun:
```bash
bun install
```

3. Set up your environment variables:
```bash
# Copy the example environment file
cp env.example .env

# Default LLM: FreeLLMAPI auto-routing (no per-provider key needed)
# FREELLMAPI_API_KEY=your-freellmapi-api-key
# FREELLMAPI_BASE_URL=http://localhost:3001/v1

# ...or use a hosted provider and pick it from the /model menu
# OPENAI_API_KEY=your-openai-api-key
# ANTHROPIC_API_KEY=your-anthropic-api-key (optional)
# GOOGLE_API_KEY=your-google-api-key (optional)

# Institutional-grade market data for agents
# FINANCIAL_DATASETS_API_KEY=your-financial-datasets-api-key

# Chat over messaging apps (optional)
# TELEGRAM_BOT_TOKEN=your-telegram-bot-token

# Web Search (Exa preferred, then Perplexity/Tavily/LangSearch)
# EXASEARCH_API_KEY=your-exa-api-key
```

`env.example` also documents an optional **integrations roadmap** — additional
market-data, crypto, real-estate and central-bank (US/EU/China) data providers
you can wire in by adding a key.

## 🚀 How to Run

Run Antoine in interactive mode:
```bash
bun start
```

Or with watch mode for development:
```bash
bun dev
```

### Install the global `antoine` command

So you can launch Antoine from **any folder**, a global launcher (`antoine`) is provided.

- **Windows** — a launcher is installed at `%AppData%\npm\antoine.cmd` (that folder is already on your PATH). Open a new terminal and run `antoine` from anywhere.
- **macOS/Linux** — add a shim to a directory on your PATH, e.g.:
  ```bash
  printf '#!/usr/bin/env bash\ncd "<path-to-antoine>" && exec bun run src/index.tsx "$@"\n' | sudo tee /usr/local/bin/antoine
  sudo chmod +x /usr/local/bin/antoine
  ```

Commands:

```bash
antoine            # launch the interactive CLI (this is how you start the product)
antoine gateway    # start the messaging gateway (WhatsApp + Telegram)
antoine telegram   # configure the Telegram bot
antoine login      # link a WhatsApp account
```

> Antoine always runs from its install directory, so your API keys (`.env`) and
> data (`.antoine/`) are found regardless of which folder you launched it from.

## 📊 How to Evaluate

Antoine includes an evaluation suite that tests the agent against a dataset of financial questions. Evals use LangSmith for tracking and an LLM-as-judge approach for scoring correctness.

**Run on all questions:**
```bash
bun run src/evals/run.ts
```

**Run on a random sample of data:**
```bash
bun run src/evals/run.ts --sample 10
```

The eval runner displays a real-time UI showing progress, current question, and running accuracy statistics. Results are logged to LangSmith for analysis.

## 🐛 How to Debug

Antoine logs all tool calls to a scratchpad file for debugging and history tracking. Each query creates a new JSONL file in `.antoine/scratchpad/`.

**Scratchpad location:**
```
.antoine/scratchpad/
├── 2026-01-30-111400_9a8f10723f79.jsonl
├── 2026-01-30-143022_a1b2c3d4e5f6.jsonl
└── ...
```

Each file contains newline-delimited JSON entries tracking:
- **init**: The original query
- **tool_result**: Each tool call with arguments, raw result, and LLM summary
- **thinking**: Agent reasoning steps

**Example scratchpad entry:**
```json
{"type":"tool_result","timestamp":"2026-01-30T11:14:05.123Z","toolName":"get_income_statements","args":{"ticker":"AAPL","period":"annual","limit":5},"result":{...},"llmSummary":"Retrieved 5 years of Apple annual income statements showing revenue growth from $274B to $394B"}
```

This makes it easy to inspect exactly what data the agent gathered and how it interpreted results.

## 📱 How to Use with WhatsApp

Chat with Antoine through WhatsApp by linking your phone to the gateway. Messages you send to yourself are processed by Antoine and responses are sent back to the same chat.

**Quick start:**
```bash
# Link your WhatsApp account (scan QR code)
bun run gateway:login

# Start the gateway
bun run gateway
```

Then open WhatsApp, go to your own chat (message yourself), and ask Antoine a question.

For detailed setup instructions, configuration options, and troubleshooting, see the [WhatsApp Gateway README](src/gateway/channels/whatsapp/README.md).

## ✈️ How to Use with Telegram

Chat with Antoine through Telegram. First create a bot with [@BotFather](https://t.me/BotFather) to get a bot token, then:

```bash
# Configure the Telegram bot (paste the BotFather token, set who may DM it)
bun run gateway:telegram

# Start the gateway
bun run gateway
```

Alternatively, set `TELEGRAM_BOT_TOKEN` in your `.env` and add allowed senders under
`channels.telegram` in `.antoine/gateway.json`. By default DMs require an allowlist
(numeric Telegram user ids or `@usernames`, or `*` for anyone), and group messages
are answered only when the bot is mentioned or replied to.

## 🤝 How to Contribute

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

**Important**: Please keep your pull requests small and focused.  This will make it easier to review and merge.


## 📄 License

This project is licensed under the MIT License.
