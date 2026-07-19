import { Router } from "express";

const router = Router();

// The n8n webhook to forward analysis requests to. Override via env so you can
// switch between the test path (/webhook-test/...) while the workflow is
// unpublished and the production path (/webhook/...) once it's active — no code
// change or redeploy needed.
const N8N_WEBHOOK_URL =
  process.env["N8N_WEBHOOK_URL"] ??
  "https://talaosman771.app.n8n.cloud/webhook/financial-analysis";

// Optional shared-secret header, e.g. N8N_AUTH_HEADER="X-Webhook-Token" and
// N8N_AUTH_TOKEN="…". Left unset, the request is sent without auth (matches the
// current n8n config, which has no inbound auth).
const N8N_AUTH_HEADER = process.env["N8N_AUTH_HEADER"];
const N8N_AUTH_TOKEN = process.env["N8N_AUTH_TOKEN"];

// The n8n workflow runs a Gemini call + Sheet write + email, which can take a
// while. Give it a generous ceiling before we give up.
const REQUEST_TIMEOUT_MS = Number(process.env["N8N_TIMEOUT_MS"] ?? 120_000);

router.post("/analyze", async (req, res): Promise<void> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (N8N_AUTH_HEADER && N8N_AUTH_TOKEN) {
    headers[N8N_AUTH_HEADER] = N8N_AUTH_TOKEN;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstream = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });

    const text = await upstream.text();

    if (!upstream.ok) {
      req.log.warn(
        { status: upstream.status, body: text.slice(0, 300) },
        "n8n webhook returned non-2xx",
      );

      // n8n returns 404 "…is not registered" when the workflow isn't active.
      // Surface an actionable message instead of a bare "Webhook returned 404".
      if (upstream.status === 404 && text.includes("not registered")) {
        res.status(503).json({
          success: false,
          error:
            "The financial-analysis workflow isn't active in n8n. Open the " +
            "workflow and toggle it Active (production URL), or point " +
            "N8N_WEBHOOK_URL at the /webhook-test/… path for a single test run.",
        });
        return;
      }

      res.status(upstream.status).json({
        success: false,
        error: `n8n returned ${upstream.status}: ${upstream.statusText}`,
      });
      return;
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      req.log.error({ text: text.slice(0, 300) }, "n8n response was not valid JSON");
      res.status(502).json({ success: false, error: "Invalid response from n8n" });
      return;
    }

    res.json(data);
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    req.log.error({ err }, aborted ? "n8n webhook timed out" : "Failed to reach n8n webhook");
    res.status(aborted ? 504 : 502).json({
      success: false,
      error: aborted
        ? `n8n did not respond within ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s. The workflow may be slow or stuck.`
        : "Could not reach n8n. Make sure the workflow is published and active.",
    });
  } finally {
    clearTimeout(timeout);
  }
});

export default router;
