import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("product surface", () => {
  const worker = read("src/worker.tsx");
  const client = read("public/app.js");
  const css = read("public/styles.css");
  const migration = read("migrations/0001_telemetry.sql");
  const source = read("SOURCE.md");
  const surface = `${worker}\n${client}`;

  it("communicates through a street map, route pins, and two distinct signs", () => {
    expect(worker).toContain('class="route-scene"');
    expect(worker).toContain('class="street-board"');
    expect(worker).toContain('class="signpost"');
    expect(worker).toContain('class="mode-grid"');
    expect(client).toContain("card.className = `place-card ${mode}`");
    expect(client).toContain('fields.className = "field-tags"');
    expect(css.toLowerCase()).not.toContain("gradient");
    expect(css).not.toMatch(/h1\s*\{[^}]*font-size:\s*(?:[4-9]\d|[1-9]\d{2})px/su);
  });

  it("keeps location, searches, hazards, and place choices out of APIs and URLs", () => {
    expect(worker).toContain('app.post("/api/telemetry"');
    expect(worker).not.toContain('app.post("/api/search"');
    expect(client).toContain('fetch("/data/index.json"');
    expect(client).toContain("navigator.geolocation.getCurrentPosition");
    expect(client).toContain("localStorage");
    expect(client).toContain("saved.length >= 6");
    expect(client).toContain("saved.slice(0, 6)");
    expect(migration).not.toMatch(
      /latitude|longitude|coordinates|prefecture_id|hazard_id|query|search_term|place_id|address|common_id|email|phone|advertising/iu,
    );
    expect(client).not.toMatch(/history\.(?:pushState|replaceState)|location\.search\s*=/u);
  });

  it("sorts by local distance without storing or transmitting the current position", () => {
    expect(client).toContain("distanceKilometers");
    expect(client).toContain("6371 * 2 * Math.atan2");
    expect(client).toContain("currentPosition = {");
    expect(client).toContain("latitude: position.coords.latitude");
    expect(client).not.toMatch(
      /JSON\.stringify\([^)]*currentPosition|writeLocal\([^)]*currentPosition/iu,
    );
    expect(worker).toContain("geolocation=(self)");
    expect(client).toContain("安全な経路を示すものではありません");
  });

  it("renders official data as text and opens coordinates in the GSI map", () => {
    expect(client).not.toContain("innerHTML");
    expect(worker).not.toContain("dangerouslySetInnerHTML");
    expect(client).toContain("textContent");
    expect(client).toContain("https://maps.gsi.go.jp/#17/");
    expect(client).toContain("map_opened");
  });

  it("states the two definitions, source, date, terms, and limitations", () => {
    expect(source).toContain("指定緊急避難場所は");
    expect(source).toContain("指定避難所は");
    expect(source).toContain("2026年7月27日");
    expect(source).toContain("115,529件");
    expect(source).toContain("83,066件");
    expect(source).toContain("国土地理院コンテンツ利用規約");
    expect(source).toContain("最新でない場合や未掲載の場合");
    expect(worker).toContain("現在開設中の避難所一覧ではありません");
    expect(worker).toContain("必ず当該市町村へ確認してください");
  });

  it("contains no research copy and needs no account for a local plan", () => {
    expect(surface).not.toMatch(
      /public validation|success criteria|experiment|仮説|成功条件|市場スコア|移行候補|収益性/iu,
    );
    expect(client).toContain("navigator.webdriver === true");
    expect(client).toContain('"X-Hinan-Saki-QA"');
    expect(surface).not.toMatch(/better-auth|betterAuth/iu);
  });
});
