import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

type EmergencyPlace = {
  a: string;
  h: number;
  id: string;
  la: number;
  lo: number;
  m: string;
  n: string;
  o: string;
  s: number;
};
type Shelter = Omit<EmergencyPlace, "h"> & { c: string; r: string };
type Shard = {
  e: EmergencyPlace[];
  p: { id: string; name: string; region: string };
  s: Shelter[];
};
type Index = {
  hazards: string[];
  prefectures: Array<{ e: number; id: string; name: string; region: string; s: number }>;
  source: {
    emergency: { rows: number; sha256: string; url: string };
    hazardCounts: Record<string, number>;
    lastModified: string;
    shelter: { rows: number; sha256: string; url: string };
    totalRows: number;
  };
};

const dataDirectory = resolve(process.cwd(), "public/data");
const index = JSON.parse(readFileSync(resolve(dataDirectory, "index.json"), "utf8")) as Index;
const shardFiles = readdirSync(dataDirectory)
  .filter((name) => /^\d{2}\.json$/u.test(name))
  .sort();
const shards = shardFiles.map(
  (name) => JSON.parse(readFileSync(resolve(dataDirectory, name), "utf8")) as Shard,
);

describe("official evacuation-place directory", () => {
  it("contains the verified source dimensions, hashes, and eight hazards", () => {
    expect(index.source).toMatchObject({
      emergency: {
        rows: 115529,
        sha256: "ec5a52bb3cdf6d30e1abd767e96d5746520ff1ca44c2ebca1ba2bb98bea4a450",
      },
      lastModified: "2026-07-27",
      shelter: {
        rows: 83066,
        sha256: "8b688ee3e70c869ca4878a32d89ae98b5be85ecfdbcb45e48e7dc7f3ccebc2f4",
      },
      totalRows: 198595,
    });
    expect(index.hazards).toEqual([
      "洪水",
      "崖崩れ・土石流・地滑り",
      "高潮",
      "地震",
      "津波",
      "大規模な火事",
      "内水氾濫",
      "火山現象",
    ]);
    expect(index.source.hazardCounts).toEqual({
      地震: 88281,
      大規模な火事: 43100,
      崖崩れ・土石流・地滑り: 67269,
      洪水: 71707,
      津波: 40411,
      火山現象: 10727,
      内水氾濫: 39417,
      高潮: 25064,
    });
  });

  it("splits all 198,595 unique records across exactly 47 matching shards", () => {
    expect(shardFiles).toEqual(
      Array.from(
        { length: 47 },
        (_unused, index_) => `${String(index_ + 1).padStart(2, "0")}.json`,
      ),
    );
    expect(index.prefectures).toHaveLength(47);
    expect(index.prefectures.reduce((sum, prefecture) => sum + prefecture.e, 0)).toBe(115529);
    expect(index.prefectures.reduce((sum, prefecture) => sum + prefecture.s, 0)).toBe(83066);
    const records = shards.flatMap((shard) => [...shard.e, ...shard.s]);
    expect(records).toHaveLength(198595);
    expect(new Set(records.map((record) => record.id)).size).toBe(198595);
    shards.forEach((shard, index_) => {
      expect(shard.p.id).toBe(index.prefectures[index_].id);
      expect(shard.e).toHaveLength(index.prefectures[index_].e);
      expect(shard.s).toHaveLength(index.prefectures[index_].s);
    });
  });

  it("ships only approved fields with valid public coordinates", () => {
    shards.forEach((shard) => {
      shard.e.forEach((place) => {
        expect(Object.keys(place).sort()).toEqual(["a", "h", "id", "la", "lo", "m", "n", "o", "s"]);
        expect(Number.isInteger(place.h)).toBe(true);
        expect(place.h).toBeGreaterThanOrEqual(0);
        expect(place.h).toBeLessThan(1 << 8);
        expect(place.n.length).toBeGreaterThan(0);
        expect(place.m.length).toBeGreaterThan(0);
        expect(place.la).toBeGreaterThanOrEqual(20);
        expect(place.la).toBeLessThanOrEqual(46);
        expect(place.lo).toBeGreaterThanOrEqual(122);
        expect(place.lo).toBeLessThanOrEqual(154);
      });
      shard.s.forEach((place) => {
        expect(Object.keys(place).sort()).toEqual([
          "a",
          "c",
          "id",
          "la",
          "lo",
          "m",
          "n",
          "o",
          "r",
          "s",
        ]);
        expect(place.n.length).toBeGreaterThan(0);
        expect(place.m.length).toBeGreaterThan(0);
        expect(place.la).toBeGreaterThanOrEqual(20);
        expect(place.la).toBeLessThanOrEqual(46);
        expect(place.lo).toBeGreaterThanOrEqual(122);
        expect(place.lo).toBeLessThanOrEqual(154);
      });
    });
  });

  it("retains known official data while separating the two legal purposes", () => {
    const hokkaido = shards[0];
    const knownEmergency = hokkaido.e.find((place) => place.id === "E0110000010202");
    expect(knownEmergency).toMatchObject({
      a: "厚別区厚別西三条1-3-1",
      id: "E0110000010202",
      m: "札幌市",
      n: "厚別西小学校",
    });
    expect(
      hokkaido.s.some((place) => place.id === "E0110000001111" && place.n === "もみじ台中学校"),
    ).toBe(true);
  });

  it("keeps regional static delivery within budget", () => {
    const sizes = shardFiles.map((name) => statSync(resolve(dataDirectory, name)).size);
    expect(Math.max(...sizes)).toBeLessThan(2_100_000);
    expect(
      sizes.reduce((sum, size) => sum + size, statSync(resolve(dataDirectory, "index.json")).size),
    ).toBeLessThan(31_000_000);
  });
});
