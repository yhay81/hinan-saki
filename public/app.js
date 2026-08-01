(() => {
  "use strict";

  const sessionKey = "hinan-saki-session-v1";
  const seenKey = "hinan-saki-seen-v1";
  const savedKey = "hinan-saki-saved-v1";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
  const isQa =
    new URLSearchParams(location.search).get("qa") === "1" ||
    location.hostname === "localhost" ||
    navigator.webdriver === true;

  const readLocal = (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const writeLocal = (key, value) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  };
  const readJson = (key, fallback) => {
    try {
      return JSON.parse(readLocal(key) ?? "null") ?? fallback;
    } catch {
      return fallback;
    }
  };

  const oldSession = readLocal(sessionKey) ?? "";
  const session = uuidPattern.test(oldSession) ? oldSession : crypto.randomUUID();
  writeLocal(sessionKey, session);
  const emit = (name) => {
    fetch("/api/telemetry", {
      body: JSON.stringify({ name }),
      headers: {
        "Content-Type": "application/json",
        "X-Hinan-Saki-QA": isQa ? "1" : "0",
        "X-Hinan-Saki-Session": session,
      },
      keepalive: true,
      method: "POST",
    }).catch(() => undefined);
  };

  const previousVisit = Number(readLocal(seenKey) ?? 0);
  emit("visited");
  if (previousVisit && Date.now() - previousVisit > 8 * 60 * 60 * 1000) emit("returned");
  writeLocal(seenKey, String(Date.now()));

  const searchInput = document.querySelector("#place-search");
  if (!(searchInput instanceof HTMLInputElement)) return;

  const workspace = document.querySelector("#directory-workspace");
  const prefectureName = document.querySelector("#prefecture-name");
  const prefectureBadge = document.querySelector("#prefecture-badge");
  const prefectureCount = document.querySelector("#prefecture-count");
  const directoryTotal = document.querySelector("#directory-total");
  const activeMode = document.querySelector("#active-mode");
  const searchStatus = document.querySelector("#search-status");
  const hazardFilter = document.querySelector("#hazard-filter");
  const hazardButtons = document.querySelector("#hazard-buttons");
  const resetFilters = document.querySelector("#reset-filters");
  const placeGrid = document.querySelector("#place-grid");
  const resultCount = document.querySelector("#result-count");
  const loadMore = document.querySelector("#load-more");
  const changePrefecture = document.querySelector("#change-prefecture");
  const changeMode = document.querySelector("#change-mode");
  const nearbySort = document.querySelector("#nearby-sort");
  const savedItems = document.querySelector("#saved-items");
  const savedCount = document.querySelector("#saved-count");
  const copySaved = document.querySelector("#copy-saved");
  const clearSaved = document.querySelector("#clear-saved");

  let indexData = null;
  let currentPrefecture = null;
  let currentData = null;
  let mode = "emergency";
  let selectedHazard = null;
  let currentPosition = null;
  let saved = readJson(savedKey, []);
  let visibleLimit = 50;
  let searchTimer = 0;
  let searchEmitted = false;
  let nearbyEmitted = false;

  const modeDetails = {
    emergency: { count: 115529, icon: "!", label: "指定緊急避難場所", key: "e" },
    shelter: { count: 83066, icon: "⌂", label: "指定避難所", key: "s" },
  };
  const normalize = (value) =>
    String(value)
      .normalize("NFKC")
      .toLocaleLowerCase("ja-JP")
      .replaceAll(/[ァ-ヶ]/gu, (character) => String.fromCodePoint(character.codePointAt(0) - 0x60))
      .replaceAll(/[\s/・［］＜＞（）()、，,.-]+/gu, " ")
      .trim();
  const text = (tag, value, className = "") => {
    const element = document.createElement(tag);
    element.textContent = value;
    if (className) element.className = className;
    return element;
  };
  const button = (label, className, action) => {
    const element = text("button", label, className);
    element.type = "button";
    element.addEventListener("click", action);
    return element;
  };
  const announce = (message) => {
    if (searchStatus) searchStatus.textContent = message;
  };
  const mapUrl = (latitude, longitude) =>
    `https://maps.gsi.go.jp/#17/${latitude}/${longitude}/&base=std&ls=std&disp=1`;
  const fullAddress = (place) => `${currentPrefecture.name}${place.m}${place.a}`;
  const distanceKilometers = (place) => {
    if (!currentPosition) return null;
    const radians = (degrees) => (degrees * Math.PI) / 180;
    const latitudeDelta = radians(place.la - currentPosition.latitude);
    const longitudeDelta = radians(place.lo - currentPosition.longitude);
    const startLatitude = radians(currentPosition.latitude);
    const endLatitude = radians(place.la);
    const halfChord =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(halfChord), Math.sqrt(1 - halfChord));
  };
  const formatDistance = (distance) =>
    distance < 1
      ? `直線 約${Math.max(10, Math.round((distance * 1000) / 10) * 10)}m`
      : `直線 約${distance.toFixed(1)}km`;

  saved = (Array.isArray(saved) ? saved : [])
    .filter(
      (item) =>
        item &&
        typeof item.a === "string" &&
        typeof item.id === "string" &&
        typeof item.la === "number" &&
        typeof item.lo === "number" &&
        typeof item.n === "string" &&
        typeof item.prefecture === "string" &&
        (item.type === "emergency" || item.type === "shelter"),
    )
    .slice(0, 6);
  const persistSaved = () => writeLocal(savedKey, JSON.stringify(saved.slice(0, 6)));
  const isSaved = (id) => saved.some((item) => item.id === id);

  const copyText = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const area = document.createElement("textarea");
      area.value = value;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
  };

  const renderSaved = () => {
    if (!savedItems || !savedCount) return;
    savedItems.replaceChildren();
    savedCount.textContent = `${saved.length} / 6`;
    if (!saved.length) {
      savedItems.append(text("p", "カードの「候補に残す」を押すと、この端末に最大6件を残せます。"));
    } else {
      saved.forEach((item, index) => {
        const card = document.createElement("article");
        card.append(
          text("span", String(index + 1).padStart(2, "0")),
          text("strong", item.n),
          text(
            "small",
            `${item.type === "emergency" ? "緊急避難場所" : "指定避難所"}・${item.prefecture}`,
          ),
          text("p", item.a),
        );
        const actions = document.createElement("div");
        const map = document.createElement("a");
        map.href = mapUrl(item.la, item.lo);
        map.rel = "noopener noreferrer";
        map.target = "_blank";
        map.textContent = "地図";
        map.addEventListener("click", () => emit("map_opened"));
        actions.append(
          map,
          button("外す", "remove-saved", () => {
            saved = saved.filter((candidate) => candidate.id !== item.id);
            persistSaved();
            renderSaved();
            updateSaveButtons();
          }),
        );
        card.append(actions);
        savedItems.append(card);
      });
    }
    [copySaved, clearSaved].forEach((control) => {
      if (control) control.disabled = saved.length === 0;
    });
  };

  const updateSaveButtons = () => {
    document.querySelectorAll("[data-save-place]").forEach((control) => {
      if (!(control instanceof HTMLButtonElement)) return;
      const selected = isSaved(control.dataset.savePlace);
      control.textContent = selected ? "候補にあります" : "候補に残す";
      control.disabled = selected;
    });
  };

  const savePlace = (place) => {
    if (isSaved(place.id)) return;
    if (saved.length >= 6) {
      announce("持ち出しメモは6件までです。どれかを外してから追加してください");
      return;
    }
    saved.push({
      a: fullAddress(place),
      id: place.id,
      la: place.la,
      lo: place.lo,
      n: place.n,
      prefecture: currentPrefecture.name,
      type: mode,
    });
    persistSaved();
    renderSaved();
    updateSaveButtons();
    announce(`${place.n}を持ち出しメモへ残しました`);
    emit("saved");
  };

  const fieldTags = (place) => {
    if (mode === "emergency")
      return indexData.hazards.filter((_hazard, index) => (place.h & (1 << index)) !== 0);
    const tags = [];
    if (place.r) tags.push("受入対象者の記載あり");
    if (place.c) tags.push("自治体条件の記載あり");
    if (place.s) tags.push("緊急避難場所と同一住所");
    return tags;
  };

  const placeCard = (place) => {
    const card = document.createElement("article");
    card.className = `place-card ${mode}`;
    const top = document.createElement("header");
    top.append(
      text("span", place.m),
      text("small", mode === "emergency" ? "命を守る場所" : "一定期間過ごす施設"),
    );
    const heading = text("h3", place.n);
    const address = text("p", fullAddress(place), "place-address");
    const distance = distanceKilometers(place);
    if (distance !== null) address.append(text("strong", formatDistance(distance)));
    const fields = document.createElement("div");
    fields.className = "field-tags";
    const tags = fieldTags(place);
    tags.slice(0, 8).forEach((name) => fields.append(text("span", name)));
    if (!tags.length)
      fields.append(
        text("small", mode === "emergency" ? "災害種別の指定なし" : "追加条件の記載なし"),
      );
    const notices = [
      mode === "shelter" ? place.r : "",
      mode === "shelter" ? place.c : "",
      place.o,
    ].filter(Boolean);
    if (notices.length)
      card.append(top, heading, address, fields, text("p", notices.join(" / "), "place-note"));
    else card.append(top, heading, address, fields);
    const facts = document.createElement("dl");
    facts.append(text("dt", "共通ID"), text("dd", place.id));
    const actions = document.createElement("div");
    actions.className = "card-actions";
    const map = document.createElement("a");
    map.href = mapUrl(place.la, place.lo);
    map.rel = "noopener noreferrer";
    map.target = "_blank";
    map.textContent = "地理院地図で位置を見る ↗";
    map.addEventListener("click", () => emit("map_opened"));
    const save = button("候補に残す", "save-place", () => savePlace(place));
    save.dataset.savePlace = place.id;
    actions.append(save, map);
    card.append(facts, actions);
    return card;
  };

  const matchingPlaces = () => {
    if (!currentData) return [];
    const query = normalize(searchInput.value);
    const terms = query.split(" ").filter(Boolean);
    const records = mode === "emergency" ? currentData.e : currentData.s;
    const matches = records.filter(
      (place) =>
        terms.every((term) => place.search.includes(term)) &&
        (mode !== "emergency" ||
          selectedHazard === null ||
          (place.h & (1 << selectedHazard)) !== 0),
    );
    if (currentPosition)
      matches.sort((left, right) => distanceKilometers(left) - distanceKilometers(right));
    return matches;
  };

  const renderResults = () => {
    if (!placeGrid || !resultCount || !currentPrefecture) return;
    const matches = matchingPlaces();
    const visible = matches.slice(0, visibleLimit);
    placeGrid.replaceChildren();
    resultCount.textContent = `${matches.length.toLocaleString("ja-JP")}件`;
    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "empty-results";
      empty.append(
        text("span", "路"),
        text("h3", "一致する避難先がありません"),
        text("p", "短いことばにするか、災害種別の条件を外してお試しください。"),
      );
      placeGrid.append(empty);
    } else visible.forEach((place) => placeGrid.append(placeCard(place)));
    if (loadMore) {
      loadMore.hidden = visible.length >= matches.length;
      loadMore.textContent = `次の${Math.min(50, matches.length - visible.length)}件を見る`;
    }
    updateSaveButtons();
    announce(
      `${currentPrefecture.name}の${modeDetails[mode].label}を${matches.length.toLocaleString("ja-JP")}件表示しています`,
    );
  };

  const renderHazards = () => {
    if (!hazardButtons || !indexData) return;
    hazardButtons.replaceChildren();
    indexData.hazards.forEach((hazard, index) => {
      const control = button(hazard, "", () => {
        selectedHazard = selectedHazard === index ? null : index;
        visibleLimit = 50;
        renderHazards();
        renderResults();
        if (selectedHazard !== null) emit("hazard_selected");
      });
      control.setAttribute("aria-pressed", String(selectedHazard === index));
      hazardButtons.append(control);
    });
  };

  const updateModeSurface = () => {
    const details = modeDetails[mode];
    document.querySelectorAll("[data-mode]").forEach((control) => {
      control.setAttribute("aria-pressed", String(control.getAttribute("data-mode") === mode));
    });
    if (directoryTotal)
      directoryTotal.textContent = `${details.count.toLocaleString("ja-JP")} ${details.label}`;
    if (hazardFilter instanceof HTMLElement) hazardFilter.hidden = mode !== "emergency";
    if (activeMode) {
      const icon = activeMode.querySelector(".mode-icon");
      const label = activeMode.querySelector("strong");
      if (icon) {
        icon.textContent = details.icon;
        icon.className = `mode-icon ${mode === "emergency" ? "warning" : "house"}`;
      }
      if (label) label.textContent = details.label;
    }
    if (indexData) {
      indexData.prefectures.forEach((prefecture) => {
        const count = document.querySelector(`[data-prefecture-count="${prefecture.id}"]`);
        if (count) count.textContent = prefecture[details.key].toLocaleString("ja-JP");
      });
    }
    if (currentPrefecture && prefectureCount)
      prefectureCount.textContent = `${currentPrefecture[details.key].toLocaleString("ja-JP")}件`;
  };

  const setMode = (nextMode, record = true) => {
    if (!(nextMode in modeDetails)) return;
    const changed = mode !== nextMode;
    mode = nextMode;
    selectedHazard = null;
    currentPosition = null;
    searchInput.value = "";
    visibleLimit = 50;
    updateModeSurface();
    renderHazards();
    if (currentData) renderResults();
    if (changed && record) emit("mode_changed");
  };

  const openPrefecture = async (code) => {
    const prefecture = indexData?.prefectures.find((item) => item.id === code);
    if (!prefecture) return;
    document.querySelectorAll("[data-prefecture]").forEach((control) => {
      control.setAttribute(
        "aria-pressed",
        String(control.getAttribute("data-prefecture") === code),
      );
    });
    announce(`${prefecture.name}のデータを開いています…`);
    if (workspace instanceof HTMLElement) workspace.hidden = false;
    if (placeGrid)
      placeGrid.replaceChildren(text("p", "地域の避難先を開いています…", "loading-note"));
    try {
      const response = await fetch(`/data/${code}.json`, { cache: "force-cache" });
      if (!response.ok) throw new Error("prefecture_data_failed");
      const payload = await response.json();
      if (
        !Array.isArray(payload.e) ||
        !Array.isArray(payload.s) ||
        payload.e.length !== prefecture.e ||
        payload.s.length !== prefecture.s
      )
        throw new Error("prefecture_data_invalid");
      currentPrefecture = prefecture;
      currentData = {
        e: payload.e.map((place) => ({
          ...place,
          search: normalize(`${place.n} ${place.m} ${place.a} ${place.o}`),
        })),
        s: payload.s.map((place) => ({
          ...place,
          search: normalize(`${place.n} ${place.m} ${place.a} ${place.r} ${place.c} ${place.o}`),
        })),
      };
      selectedHazard = null;
      currentPosition = null;
      searchInput.value = "";
      visibleLimit = 50;
      if (prefectureBadge) prefectureBadge.textContent = code;
      if (prefectureName) prefectureName.textContent = prefecture.name;
      updateModeSurface();
      renderHazards();
      renderResults();
      workspace?.scrollIntoView({ behavior: "smooth", block: "start" });
      emit("prefecture_selected");
    } catch {
      announce("地域データを読み込めませんでした。もう一度お試しください");
      if (placeGrid)
        placeGrid.replaceChildren(text("p", "地域データを読み込めませんでした。", "loading-note"));
    }
  };

  const scheduleSearch = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      visibleLimit = 50;
      renderResults();
      if (!searchEmitted && normalize(searchInput.value).length >= 2) {
        searchEmitted = true;
        emit("searched");
      }
    }, 120);
  };

  copySaved?.addEventListener("click", async () => {
    const lines = [
      "平時に確かめる避難先候補",
      ...saved.flatMap((item, index) => [
        `${index + 1}. ${item.n}（${item.type === "emergency" ? "指定緊急避難場所" : "指定避難所"}）`,
        `   ${item.a}`,
        `   ${mapUrl(item.la, item.lo)}`,
      ]),
      "",
      "現在開設中の一覧ではありません。災害時は自治体・気象機関の最新情報に従ってください。",
      "出典：国土地理院 指定緊急避難場所・指定避難所データを加工",
      "https://hinan-saki.yhay81.com",
    ];
    await copyText(lines.join("\n"));
    announce("避難先候補の一覧をコピーしました");
    emit("list_copied");
  });
  clearSaved?.addEventListener("click", () => {
    saved = [];
    persistSaved();
    renderSaved();
    updateSaveButtons();
    announce("持ち出しメモを空にしました");
  });
  resetFilters?.addEventListener("click", () => {
    selectedHazard = null;
    currentPosition = null;
    searchInput.value = "";
    visibleLimit = 50;
    renderHazards();
    renderResults();
  });
  loadMore?.addEventListener("click", () => {
    visibleLimit += 50;
    renderResults();
  });
  changePrefecture?.addEventListener("click", () => {
    document.querySelector("#prefecture-heading")?.scrollIntoView({ behavior: "smooth" });
  });
  changeMode?.addEventListener("click", () => {
    document.querySelector("#mode-heading")?.scrollIntoView({ behavior: "smooth" });
  });
  nearbySort?.addEventListener("click", () => {
    if (!("geolocation" in navigator)) {
      announce("このブラウザでは位置情報を利用できません");
      return;
    }
    nearbySort.disabled = true;
    announce("現在地を確認しています…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        currentPosition = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        nearbySort.disabled = false;
        visibleLimit = 50;
        renderResults();
        announce("現在地からの直線距離が近い順に並べました。安全な経路を示すものではありません");
        if (!nearbyEmitted) {
          nearbyEmitted = true;
          emit("nearby_sorted");
        }
      },
      () => {
        nearbySort.disabled = false;
        announce("位置情報を利用できませんでした。施設名や住所からお探しください");
      },
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 },
    );
  });
  document.querySelectorAll("[data-mode]").forEach((control) => {
    control.addEventListener("click", () => setMode(control.getAttribute("data-mode")));
  });
  searchInput.addEventListener("input", scheduleSearch);

  const loadIndex = async () => {
    try {
      const response = await fetch("/data/index.json", { cache: "force-cache" });
      if (!response.ok) throw new Error("index_failed");
      indexData = await response.json();
      if (
        indexData.source.totalRows !== 198595 ||
        indexData.prefectures.length !== 47 ||
        indexData.hazards.length !== 8
      )
        throw new Error("index_invalid");
      document.querySelectorAll("[data-prefecture]").forEach((control) => {
        control.addEventListener("click", () =>
          openPrefecture(control.getAttribute("data-prefecture")),
        );
      });
      updateModeSurface();
      renderHazards();
    } catch {
      if (directoryTotal) directoryTotal.textContent = "データを読み込めませんでした";
    }
  };

  renderSaved();
  updateModeSurface();
  void loadIndex();
})();
