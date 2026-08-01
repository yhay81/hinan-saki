# Stack

- Cloudflare Workers / D1 / Static Assets
- Hono / Hono JSX
- Vite+
- TypeScript 7
- Vitest / Oxlint / Oxfmt

全国データは47都道府県の静的JSONとして配信し、検索、災害種別の絞り込み、距離計算、持ち出しメモはブラウザ内で処理します。D1は匿名の製品利用計測だけに使います。位置情報や端末間同期を保存しないため、認証は導入していません。
