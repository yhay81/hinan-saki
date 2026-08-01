# 避難先さがし

国土地理院の全国データから、指定緊急避難場所115,529件と指定避難所83,066件を混同せず、都道府県、災害種別、施設名、市区町村、住所から探すウェブアプリです。利用者が許可した場合だけ現在地からの直線距離順に並べ、候補を最大6件まで端末内へ残せます。

## 開発

```powershell
npm install
npm run dev
```

公式データを更新する場合は、二種類の全国CSVを取得してから次を実行します。

```powershell
node scripts/build-data.mjs <emergency.csv> <shelter.csv> public/data
```

公開前の一括確認は `npm run release:check`、`npm run check`、`npm test`、`npm run build` です。

## データと保存

- 47都道府県の静的JSONへ分割し、選んだ地域だけを読み込みます。
- 検索、災害種別の絞り込み、距離計算はブラウザ内で行います。
- 現在地は「現在地から近い順」を押した場合だけ取得し、保存・送信しません。
- 持ち出しメモの最大6施設はブラウザの `localStorage` だけに保存します。
- 匿名計測にはランダム端末IDのハッシュ、許可済み操作名、QA判定、時刻だけを35日保存します。

詳細は [SOURCE.md](SOURCE.md)、[PRIVACY.md](PRIVACY.md)、[SECURITY.md](SECURITY.md) を参照してください。

## 公開先

<https://hinan-saki.yhay81.com>
