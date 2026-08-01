import { Hono } from "hono";
import type { Context } from "hono";
import { requestId } from "hono/request-id";

export type Bindings = { ASSETS: Fetcher; DB: D1Database };
type Variables = { requestId: string };
type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 403 | 413 | 415,
  ) {
    super(code);
  }
}

const canonicalOrigin = "https://hinan-saki.yhay81.com";
const sessionPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const telemetryNames = new Set([
  "visited",
  "mode_changed",
  "prefecture_selected",
  "searched",
  "hazard_selected",
  "nearby_sorted",
  "saved",
  "map_opened",
  "list_copied",
  "returned",
]);
const regions = [
  [
    "北海道・東北",
    [
      ["01", "北海道"],
      ["02", "青森"],
      ["03", "岩手"],
      ["04", "宮城"],
      ["05", "秋田"],
      ["06", "山形"],
      ["07", "福島"],
    ],
  ],
  [
    "関東",
    [
      ["08", "茨城"],
      ["09", "栃木"],
      ["10", "群馬"],
      ["11", "埼玉"],
      ["12", "千葉"],
      ["13", "東京"],
      ["14", "神奈川"],
    ],
  ],
  [
    "甲信越・北陸",
    [
      ["15", "新潟"],
      ["16", "富山"],
      ["17", "石川"],
      ["18", "福井"],
      ["19", "山梨"],
      ["20", "長野"],
    ],
  ],
  [
    "東海",
    [
      ["21", "岐阜"],
      ["22", "静岡"],
      ["23", "愛知"],
      ["24", "三重"],
    ],
  ],
  [
    "近畿",
    [
      ["25", "滋賀"],
      ["26", "京都"],
      ["27", "大阪"],
      ["28", "兵庫"],
      ["29", "奈良"],
      ["30", "和歌山"],
    ],
  ],
  [
    "中国",
    [
      ["31", "鳥取"],
      ["32", "島根"],
      ["33", "岡山"],
      ["34", "広島"],
      ["35", "山口"],
    ],
  ],
  [
    "四国",
    [
      ["36", "徳島"],
      ["37", "香川"],
      ["38", "愛媛"],
      ["39", "高知"],
    ],
  ],
  [
    "九州・沖縄",
    [
      ["40", "福岡"],
      ["41", "佐賀"],
      ["42", "長崎"],
      ["43", "熊本"],
      ["44", "大分"],
      ["45", "宮崎"],
      ["46", "鹿児島"],
      ["47", "沖縄"],
    ],
  ],
] as const;
const nowSeconds = () => Math.floor(Date.now() / 1000);

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const enforceSameOrigin = (c: AppContext) => {
  const fetchSite = c.req.header("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") throw new ApiError("cross_site_request", 403);
  const origin = c.req.header("origin");
  if (origin && origin !== new URL(c.req.url).origin) throw new ApiError("cross_site_request", 403);
};

const parseJson = async (c: AppContext, maximumBytes = 256) => {
  if (!(c.req.header("content-type") ?? "").toLowerCase().startsWith("application/json"))
    throw new ApiError("unsupported_media_type", 415);
  const raw = await c.req.text();
  if (new TextEncoder().encode(raw).byteLength > maximumBytes)
    throw new ApiError("payload_too_large", 413);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ApiError("invalid_json", 400);
  }
};

const recordEvent = async (c: AppContext, name: string) => {
  const session = (c.req.header("x-hinan-saki-session") ?? "").toLowerCase();
  if (!sessionPattern.test(session)) return;
  await c.env.DB.prepare(
    "INSERT INTO product_events (session_hash,event_name,is_qa,created_at) VALUES (?,?,?,?)",
  )
    .bind(
      await sha256(session),
      name,
      c.req.header("x-hinan-saki-qa") === "1" ? 1 : 0,
      nowSeconds(),
    )
    .run();
};

const Layout = ({
  canonical,
  children,
  description,
  noindex = false,
  title,
}: {
  canonical: string;
  children: unknown;
  description: string;
  noindex?: boolean;
  title: string;
}) => (
  <html lang="ja">
    <head>
      <meta charset="utf-8" />
      <meta content="width=device-width,initial-scale=1" name="viewport" />
      <title>{title}</title>
      <meta content={description} name="description" />
      {noindex ? <meta content="noindex,nofollow" name="robots" /> : null}
      <link href={canonical} rel="canonical" />
      <meta content="website" property="og:type" />
      <meta content="避難先さがし" property="og:site_name" />
      <meta content={title} property="og:title" />
      <meta content={description} property="og:description" />
      <meta content={canonical} property="og:url" />
      <meta content={`${canonicalOrigin}/og.svg`} property="og:image" />
      <meta content="summary_large_image" name="twitter:card" />
      <meta content="#263f56" name="theme-color" />
      <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
      <link href="/manifest.webmanifest" rel="manifest" />
      <link href="/styles.css" rel="stylesheet" />
      <script defer src="/app.js" />
    </head>
    <body>
      <a class="skip-link" href="#main">
        本文へ
      </a>
      <header class="site-header">
        <a aria-label="避難先さがし ホーム" class="wordmark" href="/">
          <span aria-hidden="true" class="route-mark">
            <i />
            <i />
          </span>
          <span>避難先さがし</span>
        </a>
        <nav aria-label="案内">
          <a href="/guide">使い方</a>
          <a href="/source">出典</a>
          <a href="/privacy">位置情報</a>
        </nav>
      </header>
      {children}
      <footer class="site-footer">
        <span>出典：国土地理院 指定緊急避難場所・指定避難所データ</span>
        <span>
          <a
            href="https://www.gsi.go.jp/bousaichiri/hinanbasho-menseki.html"
            rel="noopener noreferrer"
          >
            注意事項
          </a>
          <a
            href="https://hinanmap.gsi.go.jp/hinanjocp/hinanbasho/koukaidate.html"
            rel="noopener noreferrer"
          >
            公式データ
          </a>
        </span>
      </footer>
    </body>
  </html>
);

const RouteScene = () => (
  <div aria-hidden="true" class="route-scene">
    <div class="street-board">
      <i class="street one" />
      <i class="street two" />
      <i class="street three" />
      <span class="route-pin first" />
      <span class="route-pin second" />
      <span class="route-pin third" />
      <b class="you-are-here">現在地</b>
    </div>
    <div class="signpost">
      <span class="sign emergency">
        <i>!</i>
        <b>危険から離れる</b>
        <small>指定緊急避難場所</small>
      </span>
      <span class="sign shelter">
        <i>⌂</i>
        <b>一定期間過ごす</b>
        <small>指定避難所</small>
      </span>
      <strong>198,595</strong>
    </div>
  </div>
);

const HomePage = () => (
  <Layout
    canonical={`${canonicalOrigin}/`}
    description="国土地理院の全国データから、指定緊急避難場所115,529件と指定避難所83,066件を地域、災害種別、施設名、住所で探せます。"
    title="災害種別と地域から避難先を探す | 避難先さがし"
  >
    <main class="home" id="main">
      <section class="route-intro" aria-labelledby="product-title">
        <div class="product-heading">
          <p class="eyebrow">2 TYPES / 8 HAZARDS</p>
          <h1 id="product-title">危険の種類から、避難先を確かめる。</h1>
          <p>命を守る場所と、危険が去ったあとに過ごす施設を分けて探します。</p>
          <div class="data-pair">
            <span>
              <strong>115,529</strong>
              <small>指定緊急避難場所</small>
            </span>
            <span>
              <strong>83,066</strong>
              <small>指定避難所</small>
            </span>
          </div>
        </div>
        <RouteScene />
      </section>

      <div class="safety-ribbon">
        <strong>現在開設中の避難所一覧ではありません</strong>
        <span>災害時は自治体・気象機関の最新情報に従ってください</span>
        <a href="/guide">二種類の違い</a>
      </div>

      <section class="mode-deck" aria-labelledby="mode-heading">
        <header class="section-heading">
          <div>
            <p>最初に選ぶ</p>
            <h2 id="mode-heading">探す避難先の種類</h2>
          </div>
          <span>用途が異なります</span>
        </header>
        <div class="mode-grid">
          <button aria-pressed="true" data-mode="emergency" type="button">
            <span class="mode-icon warning">!</span>
            <span>
              <small>災害の危険から命を守る</small>
              <strong>指定緊急避難場所</strong>
              <em>災害種別ごとに指定</em>
            </span>
            <b>115,529</b>
          </button>
          <button aria-pressed="false" data-mode="shelter" type="button">
            <span class="mode-icon house">⌂</span>
            <span>
              <small>危険がなくなった後に滞在する</small>
              <strong>指定避難所</strong>
              <em>一般・福祉避難所を含む</em>
            </span>
            <b>83,066</b>
          </button>
        </div>
      </section>

      <section class="prefecture-deck" aria-labelledby="prefecture-heading">
        <header class="section-heading">
          <div>
            <p>地域の標識</p>
            <h2 id="prefecture-heading">都道府県を一つ選ぶ</h2>
          </div>
          <output id="directory-total">198,595施設・場所</output>
        </header>
        <div class="region-grid">
          {regions.map(([region, prefectures]) => (
            <section class="region-card">
              <h3>{region}</h3>
              <div>
                {prefectures.map(([code, name]) => (
                  <button data-prefecture={code} type="button">
                    <span>{name}</span>
                    <small data-prefecture-count={code}>—</small>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section class="directory-workspace" hidden id="directory-workspace">
        <section class="search-desk" aria-labelledby="search-heading">
          <header class="desk-heading">
            <div>
              <p>選んだ地域</p>
              <h2 id="search-heading">避難先を確かめる</h2>
            </div>
            <button id="change-prefecture" type="button">
              地域を選び直す
            </button>
          </header>
          <div class="selected-prefecture">
            <span id="prefecture-badge">—</span>
            <strong id="prefecture-name">—</strong>
            <output id="prefecture-count">—件</output>
          </div>
          <div class="active-mode" id="active-mode">
            <span class="mode-icon warning">!</span>
            <p>
              <small>表示中</small>
              <strong>指定緊急避難場所</strong>
            </p>
            <button id="change-mode" type="button">
              種類を切り替える
            </button>
          </div>
          <label class="place-search" for="place-search">
            <span>施設名・市区町村・住所から</span>
            <span class="search-box">
              <i aria-hidden="true">⌕</i>
              <input
                autocomplete="off"
                id="place-search"
                placeholder="〇〇小学校、〇〇市、町名…"
                type="search"
              />
            </span>
          </label>
          <fieldset class="hazard-filter" id="hazard-filter">
            <legend>災害の種類を一つ選ぶ</legend>
            <div id="hazard-buttons">
              <p>災害種別を読み込んでいます…</p>
            </div>
            <button class="reset-filters" id="reset-filters" type="button">
              条件を外す
            </button>
          </fieldset>
          <div class="search-actions">
            <button id="nearby-sort" type="button">
              <span aria-hidden="true">◎</span> 現在地から近い順
            </button>
            <small>位置情報は端末内の並べ替えだけに使い、保存・送信しません。</small>
          </div>
          <p id="search-status" role="status">
            都道府県のデータを開いています…
          </p>
        </section>

        <section class="result-and-saved">
          <section class="place-results" aria-labelledby="result-heading">
            <header class="result-heading">
              <div>
                <p>避難先カード</p>
                <h2 id="result-heading">見つかった場所</h2>
              </div>
              <output id="result-count">—件</output>
            </header>
            <div class="place-grid" id="place-grid">
              <p class="loading-note">地域の避難先を開いています…</p>
            </div>
            <button class="load-more" hidden id="load-more" type="button">
              次の50件を見る
            </button>
          </section>
          <aside class="saved-list" aria-labelledby="saved-heading">
            <header>
              <div>
                <p>持ち出しメモ</p>
                <h2 id="saved-heading">確かめる候補</h2>
              </div>
              <output id="saved-count">0 / 6</output>
            </header>
            <div id="saved-items">
              <p>カードの「候補に残す」を押すと、この端末に最大6件を残せます。</p>
            </div>
            <div class="saved-actions">
              <button disabled id="copy-saved" type="button">
                一覧をコピー
              </button>
              <button class="clear-button" disabled id="clear-saved" type="button">
                すべて外す
              </button>
            </div>
          </aside>
        </section>
      </section>
    </main>
  </Layout>
);

const GuidePage = () => (
  <Layout
    canonical={`${canonicalOrigin}/guide`}
    description="指定緊急避難場所と指定避難所の違い、災害種別、現在地から近い順の使い方。"
    title="使い方と二種類の違い | 避難先さがし"
  >
    <main class="content-page" id="main">
      <header class="content-heading">
        <span class="page-index">路</span>
        <div>
          <p>使い方</p>
          <h1>二種類を分けて、平時に確かめる</h1>
        </div>
      </header>
      <div class="definition-grid">
        <section>
          <span class="mode-icon warning">!</span>
          <h2>指定緊急避難場所</h2>
          <p>
            洪水、崖崩れ、高潮、地震、津波などの危険から命を守るため、緊急的に避難する場所です。災害種別ごとに指定されます。
          </p>
        </section>
        <section>
          <span class="mode-icon house">⌂</span>
          <h2>指定避難所</h2>
          <p>
            災害の危険がなくなった後、避難した人が一定期間滞在する施設です。指定緊急避難場所と同じ住所の場合もあります。
          </p>
        </section>
      </div>
      <div class="instruction-grid">
        <section>
          <b>一</b>
          <h2>種類と地域を選ぶ</h2>
          <p>命を守る場所か、滞在する施設かを選び、都道府県のデータだけを開きます。</p>
        </section>
        <section>
          <b>二</b>
          <h2>災害と住所で探す</h2>
          <p>
            緊急避難場所は災害種別を必ず確認します。現在地から近い順は距離の目安であり、安全な経路を示しません。
          </p>
        </section>
        <section>
          <b>三</b>
          <h2>自治体の最新情報を確認</h2>
          <p>
            施設の開設状況、経路、対象者、持ち物は変わります。平時に自治体の防災情報と現地を確認してください。
          </p>
        </section>
      </div>
      <aside class="care-note">
        <strong>災害が起きているとき</strong>
        <p>
          この一覧だけで避難を判断せず、自治体の避難情報、気象庁の防災情報、周囲の状況に従ってください。近い場所が、その災害に対して安全とは限りません。
        </p>
      </aside>
      <a class="page-cta" href="/">
        避難先を探す
      </a>
    </main>
  </Layout>
);

const SourcePage = () => (
  <Layout
    canonical={`${canonicalOrigin}/source`}
    description="避難先さがしが利用する国土地理院の指定緊急避難場所・指定避難所データ、収録範囲、注意事項。"
    title="出典とデータ | 避難先さがし"
  >
    <main class="content-page" id="main">
      <header class="content-heading">
        <span class="page-index">典</span>
        <div>
          <p>出典とデータ</p>
          <h1>全国の指定情報を、二種類の標識へ</h1>
        </div>
      </header>
      <div class="source-grid">
        <section>
          <h2>出典</h2>
          <p>
            国土地理院「
            <a
              href="https://hinanmap.gsi.go.jp/hinanjocp/hinanbasho/koukaidate.html"
              rel="noopener noreferrer"
            >
              指定緊急避難場所・指定避難所データ
            </a>
            」の全国CSVを使用します。取得ファイルの最終更新は2026年7月27日です。
          </p>
        </section>
        <section>
          <h2>収録範囲</h2>
          <p>
            公開されている指定緊急避難場所115,529件、指定避難所83,066件を収録します。市町村の希望により未掲載の施設がある場合があります。
          </p>
        </section>
        <section>
          <h2>表示の加工</h2>
          <p>
            47都道府県へ分割し、施設名、住所、座標、共通ID、災害種別、同一住所情報、備考、指定避難所の対象者・条件を抽出します。座標は小数点以下6桁へ丸めます。
          </p>
        </section>
        <section>
          <h2>利用条件と確認</h2>
          <p>
            <a
              href="https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html"
              rel="noopener noreferrer"
            >
              国土地理院コンテンツ利用規約
            </a>
            と公式注意事項に従います。最新でない場合や未掲載の場合があるため、最新かつ詳細の状況は必ず当該市町村へ確認してください。
          </p>
        </section>
      </div>
    </main>
  </Layout>
);

const PrivacyPage = () => (
  <Layout
    canonical={`${canonicalOrigin}/privacy`}
    description="避難先さがしの現在地、検索、持ち出しメモ、匿名利用計測の保存範囲。"
    title="位置情報と保存 | 避難先さがし"
  >
    <main class="content-page" id="main">
      <header class="content-heading">
        <span class="page-index">守</span>
        <div>
          <p>位置情報と保存</p>
          <h1>現在地は、近い順の計算だけ</h1>
        </div>
      </header>
      <div class="privacy-grid">
        <section>
          <h2>現在地</h2>
          <p>
            「現在地から近い順」を押した場合だけブラウザへ位置情報を求めます。距離は端末内で計算し、緯度・経度を保存、送信、URL表示しません。
          </p>
        </section>
        <section>
          <h2>検索と持ち出しメモ</h2>
          <p>
            検索語と災害種別は端末内で照合します。候補に残した最大6件の公開施設情報だけを、このブラウザのlocalStorageへ保存します。
          </p>
        </section>
        <section>
          <h2>利用計測</h2>
          <p>
            ランダム端末IDのハッシュ、許可済み操作名、QA判定、時刻だけを35日保持します。現在地、都道府県、災害種別、検索語、施設IDの列はありません。
          </p>
        </section>
      </div>
    </main>
  </Layout>
);

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
app.use("*", requestId());
app.use("*", async (c, next) => {
  await next();
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
  );
  c.header("Cross-Origin-Opener-Policy", "same-origin");
  c.header("Cross-Origin-Resource-Policy", "same-origin");
  c.header(
    "Permissions-Policy",
    "camera=(), geolocation=(self), microphone=(), payment=(), usb=()",
  );
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-Request-Id", c.get("requestId"));
});

app.get("/", (c) => {
  c.header("Cache-Control", "public,max-age=60,s-maxage=300");
  return c.html(<HomePage />);
});
app.get("/guide", (c) => c.html(<GuidePage />));
app.get("/source", (c) => c.html(<SourcePage />));
app.get("/privacy", (c) => c.html(<PrivacyPage />));

app.post("/api/telemetry", async (c) => {
  enforceSameOrigin(c);
  const payload = await parseJson(c);
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new ApiError("invalid_request", 400);
  const name =
    typeof (payload as Record<string, unknown>).name === "string"
      ? (payload as Record<string, string>).name
      : "";
  if (!telemetryNames.has(name)) throw new ApiError("invalid_event", 400);
  await recordEvent(c, name);
  return c.body(null, 202);
});

app.get("/health", async (c) => {
  const database = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
  return c.json({
    emergencyPlaces: 115529,
    hazards: 8,
    ok: database?.ok === 1,
    prefectures: 47,
    service: "hinan-saki",
    shelters: 83066,
  });
});

app.get("/sitemap.xml", (c) => {
  const paths = ["/", "/guide", "/source", "/privacy"];
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${canonicalOrigin}${path}</loc></url>`).join("")}</urlset>`;
  c.header("Cache-Control", "public,max-age=3600,s-maxage=86400");
  c.header("Content-Type", "application/xml; charset=utf-8");
  return c.body(xml);
});

app.notFound((c) => {
  c.status(404);
  return c.html(
    <Layout
      canonical={`${canonicalOrigin}/404`}
      description="指定されたページは見つかりません。"
      noindex
      title="ページが見つかりません | 避難先さがし"
    >
      <main class="not-found" id="main">
        <span>404</span>
        <h1>この標識は見つかりません</h1>
        <p>避難先を探す画面へ戻ってください。</p>
        <a href="/">避難先を探す</a>
      </main>
    </Layout>,
  );
});

app.onError((error, c) => {
  if (error instanceof ApiError)
    return c.json({ error: error.code, requestId: c.get("requestId") }, error.status);
  console.error(
    "request_failed",
    c.get("requestId"),
    error instanceof Error ? error.message : "unknown",
  );
  return c.json({ error: "internal_error", requestId: c.get("requestId") }, 500);
});

export const scheduled = async (_event: ScheduledEvent, env: Bindings, _ctx: ExecutionContext) => {
  await env.DB.prepare("DELETE FROM product_events WHERE created_at < ?")
    .bind(nowSeconds() - 35 * 86400)
    .run();
};

export { app };
export default { fetch: app.fetch, scheduled };
