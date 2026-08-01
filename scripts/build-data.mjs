import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const [emergencyPath, shelterPath, outputDirectory = "public/data"] = process.argv.slice(2);
if (!emergencyPath || !shelterPath) {
  throw new Error("Usage: node scripts/build-data.mjs <emergency.csv> <shelter.csv> [output]");
}

const prefectures = [
  ["01", "北海道", "北海道・東北"],
  ["02", "青森県", "北海道・東北"],
  ["03", "岩手県", "北海道・東北"],
  ["04", "宮城県", "北海道・東北"],
  ["05", "秋田県", "北海道・東北"],
  ["06", "山形県", "北海道・東北"],
  ["07", "福島県", "北海道・東北"],
  ["08", "茨城県", "関東"],
  ["09", "栃木県", "関東"],
  ["10", "群馬県", "関東"],
  ["11", "埼玉県", "関東"],
  ["12", "千葉県", "関東"],
  ["13", "東京都", "関東"],
  ["14", "神奈川県", "関東"],
  ["15", "新潟県", "甲信越・北陸"],
  ["16", "富山県", "甲信越・北陸"],
  ["17", "石川県", "甲信越・北陸"],
  ["18", "福井県", "甲信越・北陸"],
  ["19", "山梨県", "甲信越・北陸"],
  ["20", "長野県", "甲信越・北陸"],
  ["21", "岐阜県", "東海"],
  ["22", "静岡県", "東海"],
  ["23", "愛知県", "東海"],
  ["24", "三重県", "東海"],
  ["25", "滋賀県", "近畿"],
  ["26", "京都府", "近畿"],
  ["27", "大阪府", "近畿"],
  ["28", "兵庫県", "近畿"],
  ["29", "奈良県", "近畿"],
  ["30", "和歌山県", "近畿"],
  ["31", "鳥取県", "中国"],
  ["32", "島根県", "中国"],
  ["33", "岡山県", "中国"],
  ["34", "広島県", "中国"],
  ["35", "山口県", "中国"],
  ["36", "徳島県", "四国"],
  ["37", "香川県", "四国"],
  ["38", "愛媛県", "四国"],
  ["39", "高知県", "四国"],
  ["40", "福岡県", "九州・沖縄"],
  ["41", "佐賀県", "九州・沖縄"],
  ["42", "長崎県", "九州・沖縄"],
  ["43", "熊本県", "九州・沖縄"],
  ["44", "大分県", "九州・沖縄"],
  ["45", "宮崎県", "九州・沖縄"],
  ["46", "鹿児島県", "九州・沖縄"],
  ["47", "沖縄県", "九州・沖縄"],
];
const hazards = [
  "洪水",
  "崖崩れ・土石流・地滑り",
  "高潮",
  "地震",
  "津波",
  "大規模な火事",
  "内水氾濫",
  "火山現象",
];
const sourceHazards = [
  "洪水",
  "崖崩れ、土石流及び地滑り",
  "高潮",
  "地震",
  "津波",
  "大規模な火事",
  "内水氾濫",
  "火山現象",
];
const rowsByPrefecture = new Map(prefectures.map(([id]) => [id, { e: [], s: [] }]));
const compact = (value) =>
  String(value ?? "")
    .replaceAll(/\s+/gu, " ")
    .trim();
const roundCoordinate = (value) => Math.round(Number(value) * 1_000_000) / 1_000_000;

const parseCsv = (value) => {
  const rows = [];
  let field = "";
  let quoted = false;
  let row = [];
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (character === '"' && value[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/u, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/u, ""));
    rows.push(row);
  }
  return rows;
};

const readRows = async (file) => {
  const rows = parseCsv((await fs.readFile(file, "utf8")).replace(/^\uFEFF/u, ""));
  const headers = rows.shift();
  const columns = new Map(headers.map((header, index) => [header, index]));
  return rows
    .filter((row) => row.some(Boolean))
    .map((row) => ({
      get: (name) => compact(row[columns.get(name)]),
    }));
};

const splitLocation = (rawMunicipality, rawAddress) => {
  const prefecture = prefectures.find(([_id, name]) => rawMunicipality.startsWith(name));
  if (!prefecture) throw new Error(`Unknown prefecture: ${rawMunicipality}`);
  const [id, prefectureName] = prefecture;
  const municipality = rawMunicipality.slice(prefectureName.length) || "市町村名未記載";
  const prefix = `${prefectureName}${municipality}`;
  const address = rawAddress.startsWith(prefix)
    ? rawAddress.slice(prefix.length)
    : rawAddress.replace(new RegExp(`^${prefectureName}`), "");
  return { address, id, municipality };
};

const emergencyRows = await readRows(emergencyPath);
const shelterRows = await readRows(shelterPath);
const allIds = new Set();
const hazardCounts = Array.from({ length: hazards.length }, () => 0);

for (const row of emergencyRows) {
  const id = row.get("共通ID");
  const {
    address,
    id: prefectureId,
    municipality,
  } = splitLocation(row.get("都道府県名及び市町村名"), row.get("住所"));
  let hazardMask = 0;
  sourceHazards.forEach((hazard, index) => {
    if (row.get(hazard) === "1") {
      hazardMask |= 1 << index;
      hazardCounts[index] += 1;
    }
  });
  if (!id || allIds.has(id)) throw new Error(`Missing or duplicate common ID: ${id}`);
  allIds.add(id);
  rowsByPrefecture.get(prefectureId).e.push({
    a: address,
    h: hazardMask,
    id,
    la: roundCoordinate(row.get("緯度")),
    lo: roundCoordinate(row.get("経度")),
    m: municipality,
    n: row.get("施設・場所名"),
    o: row.get("備考"),
    s: row.get("指定避難所との住所同一") === "1" ? 1 : 0,
  });
}

for (const row of shelterRows) {
  const id = row.get("共通ID");
  const {
    address,
    id: prefectureId,
    municipality,
  } = splitLocation(row.get("都道府県名及び市町村名"), row.get("住所"));
  if (!id || allIds.has(id)) throw new Error(`Missing or duplicate common ID: ${id}`);
  allIds.add(id);
  rowsByPrefecture.get(prefectureId).s.push({
    a: address,
    c: row.get("その他市町村長が必要と認める事項"),
    id,
    la: roundCoordinate(row.get("緯度")),
    lo: roundCoordinate(row.get("経度")),
    m: municipality,
    n: row.get("施設・場所名"),
    o: row.get("備考"),
    r: row.get("受入対象者"),
    s: row.get("指定緊急避難場所との住所同一") === "1" ? 1 : 0,
  });
}

if (emergencyRows.length !== 115529 || shelterRows.length !== 83066)
  throw new Error(`Unexpected row totals: ${emergencyRows.length}, ${shelterRows.length}`);
if (allIds.size !== 198595) throw new Error(`Expected 198,595 unique IDs, received ${allIds.size}`);

await fs.mkdir(outputDirectory, { recursive: true });
const prefectureIndex = [];
for (const [id, name, region] of prefectures) {
  const data = rowsByPrefecture.get(id);
  data.e.sort(
    (left, right) => left.m.localeCompare(right.m, "ja") || left.n.localeCompare(right.n, "ja"),
  );
  data.s.sort(
    (left, right) => left.m.localeCompare(right.m, "ja") || left.n.localeCompare(right.n, "ja"),
  );
  prefectureIndex.push({ e: data.e.length, id, name, region, s: data.s.length });
  await fs.writeFile(
    path.join(outputDirectory, `${id}.json`),
    JSON.stringify({ e: data.e, p: { id, name, region }, s: data.s }),
    "utf8",
  );
}

const index = {
  hazards,
  prefectures: prefectureIndex,
  source: {
    downloadPage: "https://hinanmap.gsi.go.jp/hinanjocp/hinanbasho/koukaidate.html",
    emergency: {
      rows: emergencyRows.length,
      sha256: crypto
        .createHash("sha256")
        .update(await fs.readFile(emergencyPath))
        .digest("hex"),
      url: "https://hinanmap.gsi.go.jp/hinanjocp/defaultFtpData/csv/mergeFromCity_2.csv",
    },
    lastModified: "2026-07-27",
    hazardCounts: Object.fromEntries(hazards.map((hazard, index) => [hazard, hazardCounts[index]])),
    shelter: {
      rows: shelterRows.length,
      sha256: crypto
        .createHash("sha256")
        .update(await fs.readFile(shelterPath))
        .digest("hex"),
      url: "https://hinanmap.gsi.go.jp/hinanjocp/defaultFtpData/csv/mergeFromCity_1.csv",
    },
    title: "国土地理院 指定緊急避難場所・指定避難所データ",
    totalRows: allIds.size,
  },
};
await fs.writeFile(path.join(outputDirectory, "index.json"), JSON.stringify(index), "utf8");
process.stdout.write(
  `${JSON.stringify({ hazards: Object.fromEntries(hazards.map((hazard, index) => [hazard, hazardCounts[index]])), prefectures: prefectures.length, ...index.source })}\n`,
);
