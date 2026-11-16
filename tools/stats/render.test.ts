import { describe, expect, it } from "vitest";
import { MODULES } from "./parts.ts";
import { picture } from "./readme.ts";
import { RAW_BASE, renderStats } from "./render.ts";

const DOWNLOADS = `date,tag,asset,downloads
2026-11-16,dev,modular-av.zip,4
2026-11-16,modular-av-dock-v0.13.2,modular-av-dock.zip,12
2026-11-16,modular-av-starter-set-v0.13.2,modular-av-starter-set.zip,3
2026-11-16,modular-av-v0.13.2,module.json,90
2026-11-16,modular-av-v0.13.2,modular-av.zip,17
2026-11-17,dev,modular-av.zip,1
2026-11-17,modular-av-dock-v0.13.2,modular-av-dock.zip,15
2026-11-17,modular-av-starter-set-v0.13.2,modular-av-starter-set.zip,4
2026-11-17,modular-av-v0.13.2,module.json,105
2026-11-17,modular-av-v0.13.2,modular-av.zip,19
2026-11-17,stray-v1.0.0,stray.zip,2
`;

const TRAFFIC = `date,views,view_uniques,clones,clone_uniques
2026-11-15,0,0,0,0
2026-11-16,30,8,40,12
2026-11-17,25,6,51,20
`;

const render = (traffic = TRAFFIC) =>
  renderStats({ downloads: DOWNLOADS, traffic, base: "https://x/stats" });

describe("renderStats", () => {
  it("writes every chart and badge in both themes, and the README", () => {
    const { files } = render();
    const names = [...files.keys()];
    for (const chart of ["card", "downloads", "modules", "traffic"]) {
      expect(names).toContain(`${chart}-light.svg`);
      expect(names).toContain(`${chart}-dark.svg`);
    }
    for (const m of MODULES) {
      expect(names).toContain(`badge-${m.id}-light.svg`);
      expect(names).toContain(`badge-${m.id}-dark.svg`);
    }
    expect(names).toContain("README.md");
  });

  it("leaves the traffic chart out without traffic", () => {
    const { files } = render("");
    expect(files.has("traffic-light.svg")).toBe(false);
    expect(files.get("README.md")).not.toContain("traffic-light.svg");
  });

  it("counts zips only, without manifest lookups or dev builds", () => {
    const { files } = render();
    expect(files.get("badge-modular-av-light.svg")).toContain(">19</tspan>");
    expect(files.get("card-light.svg")).toContain(">19</text>");
  });

  it("warns about a release file it can't place", () => {
    expect(render().warnings).toEqual(["Not counted: stray-v1.0.0/stray.zip"]);
  });

  it("throws when there is no download data", () => {
    expect(() =>
      renderStats({ downloads: "", traffic: "", base: "https://x" }),
    ).toThrow(/downloads\.csv/);
  });

  it("points at the stats branch of this repository", () => {
    expect(RAW_BASE).toBe(
      "https://raw.githubusercontent.com/Affid/modular-av/stats",
    );
  });
});

describe("the stats README", () => {
  const readme = render().files.get("README.md") ?? "";

  it("shows the charts in the viewer's GitHub theme", () => {
    expect(picture("https://x/stats", "card", "Totals")).toContain(
      'srcset="https://x/stats/card-dark.svg"',
    );
    expect(readme).toContain('src="https://x/stats/modules-light.svg"');
  });

  it("has a row per module with its group, total and change", () => {
    expect(readme).toContain(
      "| Core | Core | 19 | +2 since Nov 16 | 0.13.2: 19 |",
    );
    expect(readme).toContain(
      "| Dock | Dock | 15 | +3 since Nov 16 | 0.13.2: 15 |",
    );
    expect(readme).toContain(
      "| Jitsi | Services | 0 | 0 since Nov 16 | none |",
    );
  });

  it("says what each count means, and lists every release file", () => {
    expect(readme).toContain("Manifest lookups");
    expect(readme).toContain("| modular-av-v0.13.2 | module.json | 105 |");
    expect(readme).toContain("| dev | modular-av.zip | 1 |");
    expect(readme).toContain("Last snapshot: Nov 17, 2026.");
    expect(readme).toContain("Do not edit by hand");
  });

  it("ranks a release above its own prerelease", () => {
    const { files } = renderStats({
      downloads: `date,tag,asset,downloads
2026-11-17,modular-av-eq-v0.13.2-rc.1,x,0
2026-11-17,modular-av-audio-eq-v0.13.2-rc.1,modular-av-audio-eq.zip,2
2026-11-17,modular-av-audio-eq-v0.13.2,modular-av-audio-eq.zip,5
2026-11-17,modular-av-audio-eq-v0.12.0,modular-av-audio-eq.zip,9
`,
      traffic: "",
      base: "https://x",
    });
    expect(files.get("README.md")).toContain("| EQ | Sound & camera | 16 |");
    expect(files.get("README.md")).toContain("| 0.13.2: 5 |");
  });

  it("gives the code to show a module's badge", () => {
    expect(readme).toContain("https://x/stats/badge-modular-av-dock-dark.svg");
  });
});
