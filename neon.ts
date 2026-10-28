import { defineConfig } from "@neon/config/v1";

/** Doc-DL uses Lakebase Postgres for sources + visited_urls when DATABASE_URL is set. */
export default defineConfig({
  // Postgres is always on the branch; no extra Neon services required for Doc-DL.
});
