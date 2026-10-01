import { wallStyles } from "../wall/styles";

/* The wall's stylesheet (app/wall/styles.ts), made at build time. The page asks for it as /wall.css?v=<hash>. */
export const dynamic = "force-static";

export async function GET() {
  const { css } = await wallStyles();
  return new Response(css, {
    headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
