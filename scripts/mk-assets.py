#!/usr/bin/env python3
"""Builds a Playwright MCP run_code file that renders the keynote graphics from demo.json:
title cards (card-<name>.png) and transparent caption overlays (cap-<scene>.png), 1920x1080,
set in San Francisco (SF Pro) with Apple-style weights and tracking.

Usage (from the demo dir): mk-assets.py demo.json
Writes $PLAYWRIGHT_MCP_OUT/scenes/_assets.run.js; run it with browser_run_code(filename=...).
Output PNGs land in recordings/exports/.keynote/. The logo is embedded as base64 because
pages made with setContent cannot load file:// URLs.
"""
import base64
import importlib.util
import json
import os
import sys
from pathlib import Path


def load_demolib():
    spec = importlib.util.spec_from_file_location("demolib", Path(__file__).resolve().parent / "demolib.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


lib = load_demolib()

WIN_Y, WIN_H = 44, 900


LOGO_TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml"}


def main():
    cfg_path = Path(sys.argv[1] if len(sys.argv) > 1 else "demo.json").resolve()
    cfg = lib.load_config(cfg_path, "demo", "mk-assets")
    out_env = os.environ.get("PLAYWRIGHT_MCP_OUT")
    if not out_env:
        sys.exit("mk-assets: set PLAYWRIGHT_MCP_OUT to <session cwd>/.playwright-mcp")
    dest = cfg_path.parent / "recordings/exports/.keynote"
    dest.mkdir(parents=True, exist_ok=True)

    logo = ""
    if cfg.get("logo"):
        logo_path = lib.config_path(cfg_path.parent, cfg["logo"], "logo", "mk-assets")
        if not logo_path.is_file():
            sys.exit(f"mk-assets: logo not found: {logo_path}")
        mime = LOGO_TYPES.get(logo_path.suffix.lower())
        if not mime:
            sys.exit(f"mk-assets: logo must be a .png, .jpg or .svg file, got {logo_path.name}")
        logo = f"data:{mime};base64,{base64.b64encode(logo_path.read_bytes()).decode()}"

    cards = [i for i in cfg["sequence"] if "card" in i]
    caps = {i["scene"]: i["caption"] for i in cfg["sequence"] if "scene" in i and i.get("caption")}
    script = TEMPLATE % {
        "dest": json.dumps(str(dest)),
        "logo": json.dumps(logo),
        "cards": json.dumps(cards),
        "caps": json.dumps(caps),
        "cap_top": WIN_Y + WIN_H + 26,
    }
    out = Path(out_env) / "scenes/_assets.run.js"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(script)
    print(out)
    lib.output(out)


TEMPLATE = r"""async (page) => {
  const dir = %(dest)s;
  const LOGO = %(logo)s;
  const cards = %(cards)s;
  const caps = %(caps)s;
  const p = await page.context().newPage();
  await p.setViewportSize({ width: 1920, height: 1080 });
  // System UI font on macOS resolves to San Francisco; keep single quotes inside (style attr safety)
  const FONT = "system-ui, -apple-system, 'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif";
  const BG = 'background: radial-gradient(ellipse at 50%% 35%%, #ffffff 0%%, #f5f5f7 55%%, #ececf0 100%%);';
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const shot = async (html, name, transparent = false) => {
    await p.setContent('<html><head><style>body{margin:0;width:1920px;height:1080px;font-family:' + FONT + ';-webkit-font-smoothing:antialiased;' + (transparent ? 'background:transparent' : BG) + '}</style></head><body>' + html + '</body></html>');
    await p.waitForTimeout(250);
    await p.screenshot({ path: dir + '/' + name + '.png', omitBackground: transparent });
  };
  for (const [k, t] of Object.entries(caps)) {
    await shot('<div style="position:absolute;left:0;right:0;top:%(cap_top)spx;text-align:center;font-size:44px;font-weight:600;letter-spacing:-0.01em;color:#1d1d1f">' + esc(t) + '</div>', 'cap-' + k, true);
  }
  for (const c of cards) {
    const withLogo = c.logo && LOGO;
    await shot('<div style="height:1080px;display:flex;flex-direction:column;align-items:center;justify-content:center">'
      + (withLogo ? '<img src="' + LOGO + '" style="height:120px;margin-bottom:56px">' : '')
      + '<div style="font-size:' + (withLogo ? 124 : 112) + 'px;font-weight:600;letter-spacing:-0.015em;line-height:1.05;color:#1d1d1f">' + esc(c.title) + '</div>'
      + '<div style="font-size:44px;font-weight:400;letter-spacing:0.004em;color:#6e6e73;margin-top:26px">' + esc(c.subtitle || '') + '</div></div>', 'card-' + c.card);
  }
  // Report the font actually painted (expect ".SFNS" on macOS, i.e. San Francisco)
  const cdp = await page.context().newCDPSession(p);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'body div' });
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  await p.close();
  return { dir, captions: Object.keys(caps).length, cards: cards.length, paintedFonts: fonts.map(f => f.familyName) };
}
"""

if __name__ == "__main__":
    main()
