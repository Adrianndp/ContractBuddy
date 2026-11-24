## Frontend architecture
- Keep all external API fetch calls and request/response types in `src/lib/api.ts` so the local backend boundary stays explicit.
- Fetch local API data only in the browser; SSR cannot reach a visitor's local backend.
- Keep chat and contract selection in React component state; neither persists across reloads.
