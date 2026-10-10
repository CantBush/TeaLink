# TeaLink frontend

Vite, React, and TypeScript. The Discover page calls `POST /recommend` and falls back to `src/mocks/sample_session.json` when that request fails or `VITE_USE_MOCK=1`.

```bash
npm install
npm run dev
```

`VITE_API_URL` defaults to `http://localhost:8000`.
