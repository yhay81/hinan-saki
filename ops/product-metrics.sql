SELECT
  COUNT(DISTINCT CASE WHEN is_qa = 0 THEN session_hash END) AS users,
  COUNT(DISTINCT CASE WHEN is_qa = 0 AND event_name = 'mode_changed' THEN session_hash END) AS mode_changers,
  COUNT(DISTINCT CASE WHEN is_qa = 0 AND event_name = 'prefecture_selected' THEN session_hash END) AS prefecture_selectors,
  COUNT(DISTINCT CASE WHEN is_qa = 0 AND event_name = 'searched' THEN session_hash END) AS searchers,
  COUNT(DISTINCT CASE WHEN is_qa = 0 AND event_name = 'hazard_selected' THEN session_hash END) AS hazard_selectors,
  COUNT(DISTINCT CASE WHEN is_qa = 0 AND event_name = 'nearby_sorted' THEN session_hash END) AS nearby_users,
  COUNT(DISTINCT CASE WHEN is_qa = 0 AND event_name = 'saved' THEN session_hash END) AS savers,
  COUNT(DISTINCT CASE WHEN is_qa = 0 AND event_name = 'map_opened' THEN session_hash END) AS map_openers,
  COUNT(DISTINCT CASE WHEN is_qa = 0 AND event_name = 'list_copied' THEN session_hash END) AS copiers,
  COUNT(DISTINCT CASE WHEN is_qa = 0 AND event_name = 'returned' THEN session_hash END) AS returned,
  COUNT(DISTINCT CASE WHEN is_qa = 0 AND event_name = 'nearby_sorted' AND created_at >= unixepoch() - 7 * 86400 THEN session_hash END) AS nearby_users_7d,
  COUNT(DISTINCT CASE WHEN is_qa = 0 AND event_name = 'map_opened' AND created_at >= unixepoch() - 7 * 86400 THEN session_hash END) AS map_openers_7d,
  COUNT(CASE WHEN is_qa = 1 THEN 1 END) AS qa_rows
FROM product_events;
