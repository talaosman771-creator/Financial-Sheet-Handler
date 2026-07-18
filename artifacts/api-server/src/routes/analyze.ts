import { Router } from "express";

const router = Router();

const N8N_WEBHOOK_URL = "https://proojectta.app.n8n.cloud/webhook/financial-analysis";

router.post("/analyze", async (req, res): Promise<void> => {
  try {
    const upstream = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    const text = await upstream.text();

    if (!upstream.ok) {
      req.log.warn(
        { status: upstream.status, body: text.slice(0, 200) },
        "n8n webhook returned non-2xx"
      );
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
      req.log.error({ text: text.slice(0, 200) }, "n8n response was not valid JSON");
      res.status(502).json({ success: false, error: "Invalid response from n8n" });
      return;
    }

    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to reach n8n webhook");
    res.status(502).json({
      success: false,
      error: "Could not reach n8n. Make sure the workflow is published and active.",
    });
  }
});

export default router;
