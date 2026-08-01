# Metrics

許可するイベントは `visited`、`mode_changed`、`prefecture_selected`、`searched`、`hazard_selected`、`nearby_sorted`、`saved`、`map_opened`、`list_copied`、`returned` です。

各行にはランダムなブラウザUUIDのSHA-256、許可済みイベント名、QAフラグ、時刻だけを保存し、35日後に削除します。現在地、都道府県、災害種別、検索語、施設ID、住所、共通ID、氏名、連絡先、IPアドレス、広告識別子はスキーマにありません。

本番は `npm run metrics`、ローカルは `pwsh -File ops/product-metrics.ps1 -Local` で確認します。利用者数は `is_qa = 0` の異なる端末IDだけを数え、自動QAは利用者に含めません。
