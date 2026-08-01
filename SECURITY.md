# Security

Security reports can be filed privately through GitHub's security advisory feature for `yhay81/hinan-saki`.

- The telemetry endpoint accepts same-origin JSON POST requests only and size-limits request bodies.
- Telemetry event names are allowlisted; locations, prefectures, hazards, queries, and place IDs are absent from its schema.
- Official place data is a static asset with no runtime upstream dependency.
- Geolocation is requested only after explicit interaction and remains in memory for client-side distance calculations.
- Search, filter, and saved-list state remain in the browser; the saved list is bounded to six places.
- DOM additions use `textContent`; no public-data value is interpreted as markup or code.
- Content Security Policy blocks third-party scripts, framing, and unnecessary browser capabilities.
