document.addEventListener('DOMContentLoaded', () => {

  /* =========================================================
     STATE — application memory
     ========================================================= */
  const state = {
    location: null,       // { city, country, latitude, longitude }
    weather: null,        // { daily, now }
    selectedDay: null,    // 'monday' | 'tuesday' | ...
    units: { temp: 'celsius', wind: 'kmh', precip: 'mm' },
    lastAction: null,     // { type: 'search', query } | { type: 'units' } | { type: 'geoloc' } | null
  };

  const PRECIP_API = { mm: 'mm', in: 'inch' };

  /* =========================================================
     DATE HELPERS
     ========================================================= */
  function getTodayKey() {
    return new Date()
      .toLocaleDateString('en-US', { weekday: 'long' })
      .toLowerCase();
  }
  function dayInfo(isoDate) {
    const d = new Date(isoDate + 'T00:00:00');
    const long = d.toLocaleDateString('en-US', { weekday: 'long' });
    return {
      short: d.toLocaleDateString('en-US', { weekday: 'short' }),
      long,
      key:   long.toLowerCase(),
    };
  }
  function formatFullDate(isoDate) {
    const d = new Date(isoDate + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'short', day: 'numeric',
    });
  }
  function formatHour(isoDateTime) {
    const d = new Date(isoDateTime);
    let h = d.getHours();
    const suffix = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h} ${suffix}`;
  }

  /* =========================================================
     WMO CODE → ICON MAPPING
     ========================================================= */
  function iconFromCode(code) {
    if (code === 0)                 return 'icon-sunny.webp';
    if (code === 1 || code === 2)   return 'icon-partly-cloudy.webp';
    if (code === 3)                 return 'icon-overcast.webp';
    if (code === 45 || code === 48) return 'icon-fog.webp';
    if (code >= 51 && code <= 57)   return 'icon-drizzle.webp';
    if (code >= 61 && code <= 67)   return 'icon-rain.webp';
    if (code >= 71 && code <= 77)   return 'icon-snow.webp';
    if (code >= 80 && code <= 82)   return 'icon-rain.webp';
    if (code === 85 || code === 86) return 'icon-snow.webp';
    if (code === 95)                return 'icon-storm.webp';
    if (code === 96 || code === 99) return 'icon-storm.webp';
    return 'icon-sunny.webp';
  }

  /* Human-readable alt text derived from an icon filename */
  function altFromIcon(icon) {
    const name = icon.replace('icon-', '').replace('.webp', '');
    const map = {
      'sunny':         'Sunny',
      'partly-cloudy': 'Partly cloudy',
      'overcast':      'Overcast',
      'fog':           'Fog',
      'drizzle':       'Drizzle',
      'rain':          'Rain',
      'snow':          'Snow',
      'storm':         'Storm',
    };
    return map[name] || 'Weather icon';
  }

  /* =========================================================
     CACHED DOM
     ========================================================= */
  const mainBody          = document.querySelector('.main-body');
  const cityListBox       = document.querySelector('.city-list');
  const cityListUl        = cityListBox.querySelector('ul');
  const searchStatus      = cityListBox.querySelector('.search-status');
  const loadingMsg        = document.querySelector('.loading-msg');
  const noResultBox       = document.querySelector('.no-result');
  const errorStateBox     = document.querySelector('.error-state');
  const locationDeniedBox = document.querySelector('.location-denied');
  const daySelectList     = document.getElementById('day-select-list');

  let locationAlertTimer = null;

  /* =========================================================
     UI STATE MANAGEMENT
     ========================================================= */
  function showState(name) {
    if (name !== 'location-denied' && locationAlertTimer) {
      clearTimeout(locationAlertTimer);
      locationAlertTimer = null;
    }

    loadingMsg.hidden        = name !== 'loading';
    searchStatus.hidden      = name !== 'search-progress';
    noResultBox.hidden       = name !== 'no-result';
    errorStateBox.hidden     = name !== 'error';
    locationDeniedBox.hidden = name !== 'location-denied';

    // .main-header (title + form) stays visible in every state.
    // .main-body is hidden in 'no-result' and 'error'.
    mainBody.hidden = (name === 'no-result' || name === 'error');

    setContentEmpty(name === 'location-denied');

    cityListBox.hidden = (name !== 'search-progress');
    setSearchDisabled(name === 'search-progress');
    mainBody.classList.toggle('is-loading', name === 'loading');

    if (name === 'normal') {
      updateUnitsAvailability();
    }

    if (name === 'location-denied') {
      locationAlertTimer = setTimeout(() => {
        locationAlertTimer = null;
        showState('normal');
      }, 6000);
    }
  }

  /* =========================================================
     UNITS — availability
     ========================================================= */
  function setUnitsControlsDisabled(disabled) {
    document.querySelectorAll('.unit-option').forEach(btn => btn.disabled = disabled);
    document.querySelector('.switch-all-btn').disabled = disabled;
  }
  function updateUnitsAvailability() {
    setUnitsControlsDisabled(!state.weather);
  }
  function setSearchDisabled(disabled) {
    document.querySelector('.search-btn').disabled = disabled;
  }

  /* =========================================================
     EMPTY CONTENT — wipe the UI when no data is available
     ========================================================= */
  function setContentEmpty(empty) {
    mainBody.classList.toggle('is-empty', empty);
    if (!empty) return;

    document.getElementById('current-city').textContent        = '';
    document.getElementById('current-country').textContent     = '';
    document.getElementById('date-info').textContent           = '';
    document.getElementById('preview-temperature').textContent = '';
    document.getElementById('extra-temperature').textContent   = '';
    document.getElementById('hmdt-estimation').textContent     = '';
    document.getElementById('wind-estimation').textContent     = '';
    document.getElementById('prtt-estimation').textContent     = '';
    document.getElementById('daily-overview').textContent      = '';

    document.querySelectorAll('.daily-card').forEach(card => {
      card.querySelector('h3').textContent = '';
      const img = card.querySelector('.daily-icon');
      if (img) img.removeAttribute('src');
      card.querySelectorAll('span > span').forEach(s => s.textContent = '');
    });

    document.querySelectorAll('.hourly-card').forEach(card => {
      const img = card.querySelector('.hourly-icon');
      if (img) img.removeAttribute('src');
      card.querySelectorAll('.hour.temp > span').forEach(s => s.textContent = '');
    });
  }

  /* =========================================================
     NORMALIZATION — daily[0] = today, no past
     ========================================================= */
  function normalizeWeather(raw) {
    const allDays = raw.daily.time.map((isoDate, d) => {
      const start = d * 24;
      const hours = raw.hourly.time.slice(start, start + 24).map((isoDateTime, k) => {
        const idx = start + k;
        return {
          isoDateTime,
          hour: new Date(isoDateTime).getHours(),
          time: formatHour(isoDateTime),
          temp: Math.round(raw.hourly.temperature_2m[idx]),
          icon: iconFromCode(raw.hourly.weather_code[idx]),
        };
      });
      const info = dayInfo(isoDate);
      return {
        ...info,
        isoDate,
        fullDate: formatFullDate(isoDate),
        min:  Math.round(raw.daily.temperature_2m_min[d]),
        max:  Math.round(raw.daily.temperature_2m_max[d]),
        icon: iconFromCode(raw.daily.weather_code[d]),
        hours,
      };
    });

    return {
      daily: allDays.slice(0, 7),   // today → J+6
      now: {
        temp:     Math.round(raw.current.temperature_2m),
        feels:    Math.round(raw.current.apparent_temperature),
        humidity: raw.current.relative_humidity_2m,
        wind:     raw.current.wind_speed_10m,
        precip:   raw.current.precipitation,
        icon:     iconFromCode(raw.current.weather_code),
      },
    };
  }

  /* =========================================================
     API
     ========================================================= */
  async function fetchWeather(lat, lon, units) {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m` +
      `&hourly=temperature_2m,weather_code` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
      `&timezone=auto` +
      `&forecast_days=7` +
      `&temperature_unit=${units.temp}` +
      `&wind_speed_unit=${units.wind}` +
      `&precipitation_unit=${PRECIP_API[units.precip]}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Weather API failed');
    return res.json();
  }

  async function searchCoordinates(place) {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(place)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data || data.length === 0) return [];
    return data.map(item => ({
      latitude:  Number(item.lat),
      longitude: Number(item.lon),
      shortName: item.display_name.split(',')[0].trim(),
    }));
  }

  async function reverseGeocode(lat, lon) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
    const res = await fetch(url);
    const data = await res.json();
    const a = data.address || {};
    return {
      city:    a.city || a.town || a.village || a.county || 'Unknown',
      country: a.country || '',
    };
  }

  /* =========================================================
     LOAD A LOCATION
     ========================================================= */
  async function loadWeatherAt(lat, lon) {
    const [raw, place] = await Promise.all([
      fetchWeather(lat, lon, state.units),
      reverseGeocode(lat, lon),
    ]);
    state.location    = { ...place, latitude: lat, longitude: lon };
    state.weather     = normalizeWeather(raw);
    state.selectedDay = getTodayKey();
    renderAll();
  }

  /* =========================================================
     DOM INJECTION
     ========================================================= */
  function getUnitSymbol(group) {
    const btn = document.querySelector(
      `.unit-option[data-unit="${group}"][data-value="${state.units[group]}"]`
    );
    return btn ? btn.dataset.symbol : '';
  }

  function injectCurrent() {
    if (!state.weather) return;
    const now   = state.weather.now;
    const today = state.weather.daily[0];
    const tS = getUnitSymbol('temp');
    const wS = getUnitSymbol('wind');
    const pS = getUnitSymbol('precip');

    document.getElementById('current-city').textContent    = state.location?.city || '—';
    document.getElementById('current-country').textContent =
      state.location?.country ? `, ${state.location.country}` : '';
    document.getElementById('date-info').textContent = today.fullDate;

    const sunImg = document.querySelector('.sun-sun img');
    sunImg.src = `assets/images/${now.icon}`;
    sunImg.alt = altFromIcon(now.icon);

    document.getElementById('preview-temperature').textContent = `${now.temp}${tS}`;
    document.getElementById('extra-temperature').textContent   = `${now.feels}${tS}`;
    document.getElementById('hmdt-estimation').textContent     = `${now.humidity}%`;
    document.getElementById('wind-estimation').textContent     = `${now.wind} ${wS}`;
    document.getElementById('prtt-estimation').textContent     = `${now.precip} ${pS}`;
  }

  function injectDaily() {
    if (!state.weather) return;
    const cards = document.querySelectorAll('.daily-card');
    state.weather.daily.forEach((d, idx) => {
      const card = cards[idx];
      if (!card) return;
      card.querySelector('h3').textContent = d.short;
      const img = card.querySelector('.daily-icon');
      if (img) img.src = `assets/images/${d.icon}`;
      const temps = card.querySelectorAll('span > span');
      if (temps[0]) temps[0].textContent = `${d.max}°`;
      if (temps[1]) temps[1].textContent = `${d.min}°`;
    });
  }

  function findDayByKey(key) {
    if (!state.weather) return null;
    return state.weather.daily.find(d => d.key === key) || null;
  }

  function buildHourlyWindow() {
    if (!state.weather) return [];
    const maxCards = document.querySelectorAll('.hourly-card').length;

    if (state.selectedDay === getTodayKey()) {
      const currentHour = new Date().getHours();
      const today = state.weather.daily[0];

      const flat = [
        ...today.hours.map(h => ({ ...h, dayKey: today.key })),
        ...state.weather.daily.slice(1).flatMap(day =>
          day.hours.map(h => ({ ...h, dayKey: day.key }))
        ),
      ];

      const startIdx = flat.findIndex(h => h.dayKey === today.key && h.hour === currentHour);
      const safeStart = startIdx >= 0 ? startIdx : 0;
      const sliced = flat.slice(safeStart, safeStart + maxCards);

      let prev = sliced[0]?.dayKey;
      return sliced.map(item => {
        const isNewDay = item.dayKey !== prev;
        prev = item.dayKey;
        return { ...item, isNewDay };
      });
    }

    const day = findDayByKey(state.selectedDay);
    if (!day) return [];
    return day.hours
      .slice(0, maxCards)
      .map(h => ({ ...h, dayKey: day.key, isNewDay: false }));
  }

  function injectHourly() {
    const win   = buildHourlyWindow();
    const cards = document.querySelectorAll('.hourly-card');
    cards.forEach((card, i) => {
      const h = win[i];
      if (!h) { card.style.display = 'none'; return; }
      card.style.display = '';
      card.dataset.dayStart = h.isNewDay ? 'true' : 'false';

      const img = card.querySelector('.hourly-icon');
      if (img) img.src = `assets/images/${h.icon}`;

      const parts = card.querySelectorAll('.hour.temp > span');
      if (parts[0]) parts[0].textContent = h.time;
      if (parts[1]) parts[1].textContent = `${h.temp}°`;
    });
  }

  function injectDayLabel() {
    const day = findDayByKey(state.selectedDay);
    document.getElementById('daily-overview').textContent = day ? day.long : '—';
  }

  /* =========================================================
     DAY MENU — generated from state.weather.daily (same order as cards)
     ========================================================= */
  function renderDayMenu() {
    if (!state.weather) return;
    daySelectList.innerHTML = '';

    state.weather.daily.forEach(d => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'day-option' + (d.key === state.selectedDay ? ' selected' : '');
      btn.dataset.day = d.key;
      btn.textContent = d.long;

      btn.addEventListener('click', () => {
        state.selectedDay = d.key;
        syncDayMenuSelection();
        renderHourlyOnly();
      });

      daySelectList.appendChild(btn);
    });
  }

  function syncDayMenuSelection() {
    document.querySelectorAll('.day-option').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.day === state.selectedDay);
    });
  }

  function renderAll() {
    injectCurrent();
    injectDaily();
    injectDayLabel();
    injectHourly();
    renderDayMenu();
  }
  function renderHourlyOnly() {
    injectDayLabel();
    injectHourly();
  }

  /* =========================================================
     DROPDOWN MENUS
     ========================================================= */
  const unitsToggleBtn  = document.getElementById('units-toggle-btn');
  const unitsMenu       = document.getElementById('units-menu');
  const hourlyToggleBtn = document.getElementById('hourly-toggle-btn');
  const dayMenu         = document.getElementById('day-select-list');

  unitsToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    unitsMenu.classList.toggle('hidden');
    unitsToggleBtn.setAttribute('aria-expanded', !unitsMenu.classList.contains('hidden'));
  });
  hourlyToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dayMenu.classList.toggle('hidden');
    hourlyToggleBtn.setAttribute('aria-expanded', !dayMenu.classList.contains('hidden'));
  });
  document.addEventListener('click', (e) => {
    if (!unitsMenu.contains(e.target) && !unitsToggleBtn.contains(e.target)) {
      unitsMenu.classList.add('hidden');
      unitsToggleBtn.setAttribute('aria-expanded', 'false');
    }
    if (!dayMenu.contains(e.target) && !hourlyToggleBtn.contains(e.target)) {
      dayMenu.classList.add('hidden');
      hourlyToggleBtn.setAttribute('aria-expanded', 'false');
    }
  });

  /* =========================================================
     UNITS — silent refetch
     ========================================================= */
  function syncUnitsMenu() {
    document.querySelectorAll('.unit-option').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.value === state.units[btn.dataset.unit]);
    });
  }

  async function reloadWithCurrentUnits() {
    if (!state.location) return;
    setUnitsControlsDisabled(true);
    try {
      await loadWeatherAt(state.location.latitude, state.location.longitude);
    } finally {
      setUnitsControlsDisabled(false);
    }
  }

  document.querySelectorAll('.unit-option').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!state.weather) return;

      const g = btn.dataset.unit;
      const v = btn.dataset.value;
      if (state.units[g] === v) return;

      const previous = { ...state.units };
      state.units[g] = v;
      state.lastAction = { type: 'units' };
      syncUnitsMenu();

      try {
        await reloadWithCurrentUnits();
      } catch (err) {
        console.error('unit change failed:', err);
        state.units = previous;
        syncUnitsMenu();
        showState('error');
      }
    });
  });

  document.querySelector('.switch-all-btn').addEventListener('click', async () => {
    if (!state.weather) return;

    const previous = { ...state.units };
    const imperial = state.units.temp !== 'fahrenheit';
    state.units = imperial
      ? { temp: 'fahrenheit', wind: 'mph',    precip: 'in' }
      : { temp: 'celsius',    wind: 'kmh',    precip: 'mm' };
    state.lastAction = { type: 'units' };
    syncUnitsMenu();

    try {
      await reloadWithCurrentUnits();
    } catch (err) {
      console.error('switch failed:', err);
      state.units = previous;
      syncUnitsMenu();
      showState('error');
    }
  });

  /* =========================================================
     SEARCH
     ========================================================= */
  const searchForm  = document.getElementById('search-form');
  const searchInput = document.getElementById('search-input');

  cityListBox.hidden = true;
  let debounceId = null;

  searchInput.addEventListener('input', () => {
    clearTimeout(debounceId);
    const q = searchInput.value.trim();
    if (q.length < 2) {
      cityListBox.hidden = true;
      return;
    }
    debounceId = setTimeout(() => fetchCityList(q), 300);
  });

  async function fetchCityList(query) {
    try {
      const results = await searchCoordinates(query);
      if (!results.length) {
        cityListBox.hidden = true;
        return;
      }
      results.sort((a, b) => a.shortName.localeCompare(b.shortName));

      cityListUl.innerHTML = '';
      results.slice(0, 8).forEach(r => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = r.shortName;

        btn.addEventListener('click', async () => {
          cityListBox.hidden = true;
          searchInput.value = r.shortName;
          await runSearch(r.shortName);
        });

        li.appendChild(btn);
        cityListUl.appendChild(li);
      });

      searchStatus.hidden = true;
      cityListBox.hidden = false;
    } catch (err) {
      console.error('fetchCityList:', err);
      cityListBox.hidden = true;
    }
  }

  async function runSearch(query) {
    state.lastAction = { type: 'search', query };
    showState('search-progress');
    cityListUl.innerHTML = '';
    searchStatus.hidden = false;

    try {
      const results = await searchCoordinates(query);
      if (!results.length) {
        showState('no-result');
        return;
      }

      const r = results[0];
      await loadWeatherAt(r.latitude, r.longitude);
      showState('normal');

      history.pushState(
        { lat: r.latitude, lon: r.longitude, city: r.shortName },
        '',
        ''
      );
    } catch (err) {
      console.error('runSearch:', err);
      showState('error');
    }
  }

  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearTimeout(debounceId);

    const q = searchInput.value.trim();
    if (!q) {
      searchInput.setCustomValidity('Enter a place please!');
      searchInput.reportValidity();
      return;
    }
    searchInput.setCustomValidity('');
    await runSearch(q);
  });

  /* =========================================================
     RETRY — replay last action, or reload
     ========================================================= */
  document.querySelector('.retry-btn').addEventListener('click', async () => {
    const action = state.lastAction;

    if (!action) { window.location.reload(); return; }

    if (action.type === 'search') {
      await runSearch(action.query);
      return;
    }
    if (action.type === 'units') {
      showState('normal');
      try {
        await reloadWithCurrentUnits();
      } catch (err) {
        showState('error');
      }
      return;
    }
    if (action.type === 'geoloc') {
      showState('loading');
      await startGeoloc();
      return;
    }
  });

  /* =========================================================
     LOGO → reload the page
     ========================================================= */
  document.querySelector('.logo-btn').addEventListener('click', () => {
    window.location.reload();
  });

  /* =========================================================
     ALERT CLOSE — dismiss location-denied alert
     ========================================================= */
  document.querySelector('.alert-close').addEventListener('click', () => {
    if (locationAlertTimer) {
      clearTimeout(locationAlertTimer);
      locationAlertTimer = null;
    }
    showState('normal');
  });

  /* =========================================================
     BROWSER HISTORY (back / forward)
     ========================================================= */
  window.addEventListener('popstate', async (event) => {
    const s = event.state;

    if (!s || typeof s.lat !== 'number' || typeof s.lon !== 'number') {
      window.location.reload();
      return;
    }

    try {
      showState('loading');
      await loadWeatherAt(s.lat, s.lon);
      showState('normal');
    } catch (err) {
      console.error('popstate:', err);
      showState('error');
    }
  });

  /* =========================================================
     STARTUP
     ========================================================= */
  async function startGeoloc() {
    state.lastAction = { type: 'geoloc' };

    // Step 1 : ask the browser for the user's position.
    // If it fails, distinguish between "no connection" (network error)
    // and "permission denied" (location-denied).
    let pos;
    try {
      pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
        })
      );
    } catch (err) {
      console.warn('Geolocation unavailable:', err);
      // Offline → network error, not a permission issue.
      if (!navigator.onLine) {
        showState('error');
      } else {
        showState('location-denied');
      }
      return;
    }

    // Step 2 : fetch the weather for that position.
    // If this fails, it is always a network / API error.
    try {
      await loadWeatherAt(pos.coords.latitude, pos.coords.longitude);
      showState('normal');
    } catch (err) {
      console.error('Weather load failed:', err);
      showState('error');
    }
  }

  async function init() {
    syncUnitsMenu();
    state.selectedDay = getTodayKey();
    state.lastAction = null;
    updateUnitsAvailability();
    showState('loading');
    await startGeoloc();
  }

  init();

});