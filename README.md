# Chat App

A chat application built with Vite + React (client) and Node.js (server), powered by the OpenAI API.

## Features

- **Vector store tool** — answers questions about Formity using a file search tool connected to an OpenAI vector store
- **Weather tool** — fetches real-time weather for any city and renders a card component alongside the response
- **Markdown formatting** — all responses are rendered as markdown
- **Streaming** — responses stream in token by token using `fetch` + `ReadableStream`

## Structure

```
apps/
├── client/   # Vite + React + Tailwind
└── server/   # Node.js + WebSocket server + OpenAI logic
```

## Getting Started

Install dependencies:

```bash
npm install
```

Add your credentials to `apps/server/.env`:

```
OPENAI_API_KEY=...
OPENAI_VECTOR_STORE_ID=...
```

Run both apps:

```bash
npm run dev
```

- Client: `http://localhost:5173`
- Server: `ws://localhost:3001`
