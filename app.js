/* Twitch Multi-View for TV — remote-driven multi-stream viewer.
 *
 * Runs as a plain hosted page. See CLAUDE.md for why Android TV is the only
 * target and why the embeds are logged out.
 *
 * The one rule that matters: a cross-origin player iframe must NEVER take
 * focus, or it swallows every key event and the remote goes dead. See
 * hardenFrames() and the focusin guard in initInput().
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------ config

  /* Register an application at https://dev.twitch.tv/console/apps to get this.
   * Set the OAuth redirect URL to http://localhost (unused by the device flow)
   * and the client type to *public* — the device flow needs no secret. */
  const CLIENT_ID = 'h6nv3xlhb64ybjf4h94agz0x7kg3v8';

  const SCOPES = 'user:read:follows';
  const DEVICE_URL = 'https://id.twitch.tv/oauth2/device';
  const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
  const HELIX = 'https://api.twitch.tv/helix/';
  const SDK_READY = !!(window.Twitch && window.Twitch.Player);

  /* Four is the practical ceiling: Android commonly allows about four
   * concurrent hardware video decoders and a fifth tile just goes black. */
  const MAX_TILES = 4;

  const QUALITY_TARGETS = ['160p', '360p', '480p', '720p'];
  const LAYOUTS = ['auto', '2x2', 'focus'];
  const FOLLOWED_TTL = 90e3;

  const LS_SESSION = 'tmvtv.session';
  const LS_AUTH = 'tmvtv.auth';
  const LS_RECENT = 'tmvtv.recent';

  // -------------------------------------------------------------------- dom

  const $ = (sel) => document.querySelector(sel);

  function el(tag, props, kids) {
    const node = document.createElement(tag);
    for (const k in (props || {})) {
      if (k === 'class') node.className = props[k];
      else if (k === 'text') node.textContent = props[k];
      else node.setAttribute(k, props[k]);
    }
    for (const kid of (kids || [])) if (kid) node.appendChild(kid);
    return node;
  }

  const dom = {
    sink: $('#sink'),
    stage: $('#stage'),
    empty: $('#empty'),
    emptyMsg: $('#empty-msg'),
    hints: $('#hints'),
    sidebar: $('#sidebar'),
    sideSub: $('#side-sub'),
    sideList: $('#side-list'),
    menu: $('#menu'),
    menuTitle: $('#menu-title'),
    menuList: $('#menu-list'),
    setup: $('#setup'),
    setupCard: $('#setup-card'),
    toast: $('#toast')
  };

  // ------------------------------------------------------------------ state

  const state = {
    tiles: [],           // Tile instances, in visual order
    sel: 0,              // index into tiles
    audio: null,         // login of the audible channel, or null
    big: null,           // login of the main tile in focus layout
    layout: 'auto',
    quality: '480p',     // main tile
    railQuality: '360p', // every other tile
    mode: 'grid',        // grid | sidebar | menu | setup
    menu: { items: [], sel: 0 },
    side: { items: [], sel: 0 },
    auth: null,          // { access_token, refresh_token, expires_at }
    userId: null,
    followed: [],
    followedAt: 0,
    warnedFallback: false
  };

  // --------------------------------------------------------------- storage

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      /* Private mode or a full quota. Nothing to do; the session is
       * reconstructable from the hash. */
    }
  }

  function saveSession() {
    const session = {
      channels: state.tiles.map((t) => t.channel),
      layout: state.layout,
      audio: state.audio,
      big: state.big,
      quality: state.quality,
      railQuality: state.railQuality
    };
    save(LS_SESSION, session);
    writeHash(session);
  }

  function remember(channel) {
    const recent = load(LS_RECENT, []).filter((c) => c !== channel);
    recent.unshift(channel);
    save(LS_RECENT, recent.slice(0, 30));
  }

  // ------------------------------------------------------------------- hash

  /* #c=a,b,c&layout=2x2&audio=a&big=a&q=480p — lets a lineup be handed to the
   * TV from a phone, and is the whole state during desktop development. */
  function readHash() {
    const raw = location.hash.replace(/^#/, '');
    if (!raw) return null;
    const params = new URLSearchParams(raw);
    const channels = (params.get('c') || '')
      .split(',').map(normalizeChannel).filter(Boolean);
    if (!channels.length) return null;
    return {
      channels: channels,
      layout: LAYOUTS.indexOf(params.get('layout')) >= 0 ? params.get('layout') : 'auto',
      audio: normalizeChannel(params.get('audio') || ''),
      big: normalizeChannel(params.get('big') || ''),
      quality: QUALITY_TARGETS.indexOf(params.get('q')) >= 0 ? params.get('q') : null,
      railQuality: QUALITY_TARGETS.indexOf(params.get('rq')) >= 0 ? params.get('rq') : null
    };
  }

  /* Built by hand rather than with URLSearchParams, which percent-encodes the
   * commas in the channel list. Every value here is already restricted to
   * [a-z0-9_] by normalizeChannel(), so there is nothing to escape and the
   * result stays readable enough to type on a phone. */
  function writeHash(session) {
    const parts = [];
    if (session.channels.length) parts.push('c=' + session.channels.join(','));
    parts.push('layout=' + session.layout);
    if (session.audio) parts.push('audio=' + session.audio);
    if (session.big) parts.push('big=' + session.big);
    parts.push('q=' + session.quality);
    parts.push('rq=' + session.railQuality);
    const next = '#' + parts.join('&');
    if (next !== location.hash) history.replaceState(null, '', next);
  }

  function normalizeChannel(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  }

  // ------------------------------------------------------------------ toast

  let toastTimer = null;

  function toast(message, kind) {
    dom.toast.textContent = message;
    dom.toast.className = kind || '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dom.toast.classList.add('hidden'), 3200);
  }

  // ------------------------------------------------------------------- tile

  let tileSeq = 0;

  class Tile {
    constructor(channel) {
      this.channel = channel;
      this.id = 'tmv-player-' + (++tileSeq);
      this.muted = true;
      this.online = true;
      this.qualities = [];
      this.appliedQuality = null;
      this.build();
      // mount() is deliberately NOT called here: the Embed SDK resolves the
      // container by id via getElementById, so the element has to be in the
      // document first. addChannel() appends, then mounts.
    }

    build() {
      this.videoEl = el('div', { class: 'tile-video', id: this.id });
      this.numEl = el('div', { class: 'tile-num' });
      this.nameEl = el('div', { class: 'tile-name', text: this.channel });
      this.badgesEl = el('div', { class: 'tile-badges' });
      this.offlineEl = el('div', { class: 'tile-offline hidden' }, [
        el('div', { text: 'Offline' }),
        el('div', { text: this.channel })
      ]);
      this.el = el('div', { class: 'tile' }, [
        this.videoEl,
        this.offlineEl,
        this.numEl,
        el('div', { class: 'tile-bar' }, [this.nameEl, this.badgesEl])
      ]);
    }

    mount() {
      if (SDK_READY) {
        this.mountSdk();
      } else {
        this.mountIframe();
      }
    }

    mountSdk() {
      this.player = new window.Twitch.Player(this.id, {
        channel: this.channel,
        parent: [location.hostname],
        width: '100%',
        height: '100%',
        autoplay: true,
        muted: true,
        // No player chrome: it is unreachable without a pointer anyway, and
        // hiding it stops the overlay obscuring the bottom of the tile.
        controls: false
      });

      const P = window.Twitch.Player;
      this.player.addEventListener(P.READY, () => {
        this.qualities = safeCall(() => this.player.getQualities()) || [];
        this.applyQuality();
        this.setMuted(this.muted);
        hardenFrames();
      });
      this.player.addEventListener(P.PLAYING, () => {
        // Qualities are only fully populated once playback starts.
        this.qualities = safeCall(() => this.player.getQualities()) || [];
        this.applyQuality();
        this.setOnline(true);
      });
      this.player.addEventListener(P.ONLINE, () => this.setOnline(true));
      this.player.addEventListener(P.OFFLINE, () => this.setOnline(false));
    }

    /* Used when the Embed SDK could not load. Audio switching rebuilds the
     * src, which is a visible reload, and quality control is unavailable. */
    mountIframe() {
      this.frame = el('iframe', {
        src: this.frameSrc(),
        allow: 'autoplay; fullscreen',
        frameborder: '0',
        tabindex: '-1',
        scrolling: 'no'
      });
      this.videoEl.appendChild(this.frame);
      if (!state.warnedFallback) {
        state.warnedFallback = true;
        toast('Twitch Embed SDK unavailable — quality control is off and audio switching reloads a stream.', 'warn');
      }
    }

    frameSrc() {
      const params = new URLSearchParams({
        channel: this.channel,
        parent: location.hostname,
        autoplay: 'true',
        muted: this.muted ? 'true' : 'false',
        controls: 'false'
      });
      return 'https://player.twitch.tv/?' + params.toString();
    }

    setMuted(muted) {
      this.muted = muted;
      if (this.player) {
        safeCall(() => this.player.setMuted(muted));
        if (!muted) safeCall(() => this.player.setVolume(1));
      } else if (this.frame) {
        const next = this.frameSrc();
        if (this.frame.src !== next) this.frame.src = next;
      }
      this.renderBadges();
    }

    setOnline(online) {
      if (this.online === online) return;
      this.online = online;
      this.offlineEl.classList.toggle('hidden', online);
      this.renderBadges();
    }

    /* The main tile gets the full quality budget; everything else is dropped a
     * step or two. With four tiles this is the difference between playing and
     * a black box, because the decoder ceiling is the real constraint. */
    targetQuality() {
      return this.channel === state.big ? state.quality : state.railQuality;
    }

    applyQuality() {
      if (!this.player || !this.qualities.length) return;
      const pick = pickQuality(this.qualities, this.targetQuality());
      if (!pick || pick === this.appliedQuality) return;
      if (safeCall(() => this.player.setQuality(pick)) !== undefined) {
        this.appliedQuality = pick;
      }
      this.renderBadges();
    }

    renderBadges() {
      const badges = [];
      if (!this.online) {
        badges.push(el('span', { class: 'badge badge--off', text: 'OFFLINE' }));
      }
      badges.push(this.muted
        ? el('span', { class: 'badge badge--muted', text: 'MUTED' })
        : el('span', { class: 'badge badge--audio', text: 'AUDIO' }));
      if (this.appliedQuality) {
        badges.push(el('span', { class: 'badge badge--q', text: this.appliedQuality }));
      }
      this.badgesEl.textContent = '';
      for (const badge of badges) this.badgesEl.appendChild(badge);
    }

    destroy() {
      if (this.player) safeCall(() => this.player.destroy());
      this.el.remove();
    }
  }

  /* The SDK throws from its own internals when a player is torn down mid-call,
   * which is routine here — tiles come and go with the remote. */
  function safeCall(fn) {
    try {
      const result = fn();
      return result === undefined ? null : result;
    } catch (err) {
      return undefined;
    }
  }

  /* Twitch quality names are things like '720p60', 'chunked' and 'auto'. Match
   * on reported height, falling back to parsing the group, and never pick
   * something taller than asked for. */
  function pickQuality(qualities, target) {
    const want = parseInt(target, 10);
    let best = null;
    let bestHeight = -1;
    for (const quality of qualities) {
      const name = quality.group || quality.name;
      if (!name || name === 'auto') continue;
      const height = quality.height || parseInt(name, 10);
      if (!isFinite(height)) continue;
      if (height <= want && height > bestHeight) {
        bestHeight = height;
        best = name;
      }
    }
    // Everything on offer is bigger than the target — take the smallest.
    if (!best) {
      for (const quality of qualities) {
        const name = quality.group || quality.name;
        if (!name || name === 'auto') continue;
        const height = quality.height || parseInt(name, 10);
        if (!isFinite(height)) continue;
        if (bestHeight < 0 || height < bestHeight) {
          bestHeight = height;
          best = name;
        }
      }
    }
    return best;
  }

  /* Belt and braces with the focusin guard: an embed iframe that can be
   * focused is an embed iframe that can eat the remote. */
  function hardenFrames() {
    const frames = document.querySelectorAll('.tile-video iframe');
    for (const frame of frames) frame.setAttribute('tabindex', '-1');
    reclaimFocus();
  }

  function reclaimFocus() {
    if (document.activeElement !== dom.sink) dom.sink.focus();
  }

  // ------------------------------------------------------------------- grid

  function addChannel(channel) {
    channel = normalizeChannel(channel);
    if (!channel) return;
    if (state.tiles.some((t) => t.channel === channel)) return;
    if (state.tiles.length >= MAX_TILES) {
      toast('Four streams is the limit — remove one first.', 'warn');
      return;
    }
    const tile = new Tile(channel);
    state.tiles.push(tile);
    dom.stage.appendChild(tile.el);   // appended once, never moved again
    if (!state.big) state.big = channel;
    state.sel = state.tiles.length - 1;

    // render() before mount(): the stage is display:none while the grid is
    // empty, and a player built into a hidden container will not autoplay.
    render();
    tile.mount();

    if (!state.audio) setAudio(channel, true);
    remember(channel);
    saveSession();
  }

  function removeChannel(channel) {
    const index = state.tiles.findIndex((t) => t.channel === channel);
    if (index < 0) return;
    state.tiles[index].destroy();
    state.tiles.splice(index, 1);

    if (state.big === channel) state.big = state.tiles.length ? state.tiles[0].channel : null;
    if (state.audio === channel) {
      state.audio = null;
      if (state.tiles.length) setAudio(state.big || state.tiles[0].channel, true);
    }
    state.sel = Math.max(0, Math.min(state.sel, state.tiles.length - 1));
    render();
    saveSession();
  }

  /* Exclusive audio: exactly one tile is ever unmuted. On a TV there is no
   * practical per-tile volume, so this is not optional. */
  function setAudio(channel, quiet) {
    state.audio = channel;
    for (const tile of state.tiles) tile.setMuted(tile.channel !== channel);
    if (!quiet) toast('Audio: ' + channel);
    saveSession();
  }

  function setBig(channel) {
    state.big = channel;
    for (const tile of state.tiles) tile.applyQuality();
    render();
    saveSession();
  }

  function select(index) {
    if (!state.tiles.length) return;
    state.sel = Math.max(0, Math.min(index, state.tiles.length - 1));
    renderSelection();
  }

  function layoutClass() {
    const count = state.tiles.length;
    if (count <= 1) return 'lay-solo';
    if (state.layout === '2x2') return 'lay-2x2';
    if (state.layout === 'focus') return 'lay-focus';
    // auto
    if (count === 2) return 'lay-2x1';
    if (count === 3) return 'lay-focus';
    return 'lay-2x2';
  }

  function cycleLayout(step) {
    const index = LAYOUTS.indexOf(state.layout);
    state.layout = LAYOUTS[(index + step + LAYOUTS.length) % LAYOUTS.length];
    render();
    saveSession();
    toast('Layout: ' + state.layout);
  }

  function render() {
    const count = state.tiles.length;
    dom.empty.classList.toggle('hidden', count > 0);
    dom.stage.classList.toggle('hidden', count === 0);
    if (!count) {
      dom.emptyMsg.innerHTML = CLIENT_ID
        ? 'Press <b>OK</b> to open your channel list.'
        : 'Set <b>CLIENT_ID</b> in <b>app.js</b> to load your followed channels, or open this page with <b>#c=channel1,channel2</b>.';
    }

    const cls = layoutClass();
    dom.stage.className = cls + ' n-' + count;

    /* Never re-append a tile. Moving an element that contains an iframe
     * reloads that iframe, so reordering the DOM here would restart every
     * player on each layout change. The main tile is placed explicitly by CSS
     * and the rest auto-flow around it, which needs no DOM order at all. */
    state.tiles.forEach((tile, index) => {
      tile.el.classList.toggle('tile--big', cls === 'lay-focus' && tile.channel === state.big);
      tile.numEl.textContent = String(index + 1);
      tile.applyQuality();
      tile.renderBadges();
    });

    renderSelection();
    hardenFrames();
  }

  function renderSelection() {
    // The ring stays on while the menu is open, so it is obvious which tile
    // the menu is acting on.
    const showRing = state.mode === 'grid' || state.mode === 'menu';
    state.tiles.forEach((tile, index) => {
      tile.el.classList.toggle('tile--sel', index === state.sel && showRing);
    });
  }

  /* Score candidates from real geometry rather than a per-layout neighbour
   * table, so every layout — including ones added later — just works. */
  function spatialMove(dir) {
    const current = state.tiles[state.sel];
    if (!current || state.tiles.length < 2) return;
    const from = current.el.getBoundingClientRect();
    const fx = from.left + from.width / 2;
    const fy = from.top + from.height / 2;

    const horizontal = dir === 'left' || dir === 'right';

    let best = -1;
    let bestScore = Infinity;
    state.tiles.forEach((tile, index) => {
      if (index === state.sel) return;
      const rect = tile.el.getBoundingClientRect();
      const dx = rect.left + rect.width / 2 - fx;
      const dy = rect.top + rect.height / 2 - fy;
      let along;
      let across;
      if (dir === 'left') { along = -dx; across = Math.abs(dy); }
      else if (dir === 'right') { along = dx; across = Math.abs(dy); }
      else if (dir === 'up') { along = -dy; across = Math.abs(dx); }
      else { along = dy; across = Math.abs(dx); }

      if (along <= 4) return;              // not actually in that direction

      /* Require overlap on the perpendicular axis. Without this, Up from the
       * big tile in a focus layout jumps sideways into the rail just because
       * the rail's top tile happens to sit higher — which reads as the remote
       * doing something random. Nothing above means nothing happens. */
      const overlaps = horizontal
        ? rect.bottom > from.top + 4 && rect.top < from.bottom - 4
        : rect.right > from.left + 4 && rect.left < from.right - 4;
      if (!overlaps) return;

      const score = along + across * 2;    // prefer the closest aligned neighbour
      if (score < bestScore) {
        bestScore = score;
        best = index;
      }
    });

    if (best >= 0) select(best);
  }

  // ------------------------------------------------------------------- menu

  function openMenu() {
    const tile = state.tiles[state.sel];
    const items = [];

    if (tile) {
      items.push({
        label: 'Give audio to this stream',
        value: state.audio === tile.channel ? 'current' : '',
        run: () => { setAudio(tile.channel); closeMenu(); }
      });
      items.push({
        label: 'Make this the main stream',
        value: state.big === tile.channel ? 'current' : '',
        run: () => { setBig(tile.channel); closeMenu(); }
      });
    }

    items.push({
      label: 'Layout',
      value: () => state.layout,
      cycle: (step) => { cycleLayout(step); refreshMenu(); }
    });
    items.push({
      label: 'Main stream quality',
      value: () => state.quality,
      cycle: (step) => {
        state.quality = cycleValue(QUALITY_TARGETS, state.quality, step);
        for (const t of state.tiles) t.applyQuality();
        saveSession();
        refreshMenu();
      }
    });
    items.push({
      label: 'Other streams quality',
      value: () => state.railQuality,
      cycle: (step) => {
        state.railQuality = cycleValue(QUALITY_TARGETS, state.railQuality, step);
        for (const t of state.tiles) t.applyQuality();
        saveSession();
        refreshMenu();
      }
    });

    items.push({
      label: 'Add or remove channels…',
      run: () => { closeMenu(); openSidebar(); }
    });

    if (tile) {
      items.push({
        label: 'Remove ' + tile.channel,
        danger: true,
        run: () => { removeChannel(tile.channel); closeMenu(); }
      });
    }

    items.push(state.auth
      ? { label: 'Sign out', run: () => { signOut(); closeMenu(); } }
      : { label: 'Sign in to load followed channels', run: () => { closeMenu(); startDeviceAuth(); } });

    state.menu = { items: items, sel: 0 };
    state.mode = 'menu';
    dom.menuTitle.textContent = tile ? tile.channel : 'Multi-View';
    dom.menu.classList.remove('hidden');
    renderSelection();
    refreshMenu();
  }

  function refreshMenu() {
    dom.menuList.textContent = '';
    state.menu.items.forEach((item, index) => {
      const value = typeof item.value === 'function' ? item.value() : item.value;
      const classes = ['mi'];
      if (index === state.menu.sel) classes.push('mi--sel');
      if (item.danger) classes.push('mi--danger');
      const row = el('div', { class: classes.join(' ') }, [
        el('span', { text: item.label }),
        value ? el('span', { class: 'mi-val', text: item.cycle ? '‹ ' + value + ' ›' : value }) : null
      ]);
      dom.menuList.appendChild(row);
    });
  }

  function closeMenu() {
    dom.menu.classList.add('hidden');
    state.mode = 'grid';
    renderSelection();
  }

  function cycleValue(list, current, step) {
    const index = list.indexOf(current);
    return list[(index + step + list.length) % list.length];
  }

  // ---------------------------------------------------------------- sidebar

  function openSidebar() {
    state.mode = 'sidebar';
    state.side.sel = 0;
    dom.sidebar.classList.add('open');
    renderSelection();
    renderSidebar();
    refreshFollowed();
  }

  function closeSidebar() {
    dom.sidebar.classList.remove('open');
    state.mode = 'grid';
    renderSelection();
  }

  function sidebarItems() {
    const items = [];
    const added = new Set(state.tiles.map((t) => t.channel));

    if (!CLIENT_ID) {
      items.push({
        kind: 'note',
        name: 'No client ID configured',
        meta: 'Set CLIENT_ID in app.js to load followed channels'
      });
    } else if (!state.auth) {
      items.push({
        kind: 'signin',
        name: 'Sign in with your phone',
        meta: 'Loads your followed channels'
      });
    }

    for (const entry of state.followed) {
      items.push({
        kind: 'channel',
        channel: entry.login,
        name: entry.name || entry.login,
        meta: entry.game ? entry.game + ' · ' + formatViewers(entry.viewers) : formatViewers(entry.viewers),
        live: true,
        added: added.has(entry.login)
      });
    }

    // Anything watched before but not currently live/followed, so a lineup can
    // be rebuilt without typing.
    const recent = load(LS_RECENT, []);
    const seen = new Set(state.followed.map((f) => f.login));
    for (const channel of recent) {
      if (seen.has(channel)) continue;
      items.push({
        kind: 'channel',
        channel: channel,
        name: channel,
        meta: 'Recent',
        live: false,
        added: added.has(channel)
      });
    }

    if (items.length === 0 || items.every((i) => i.kind !== 'channel')) {
      items.push({
        kind: 'note',
        name: 'Nothing to show yet',
        meta: 'Sign in, or open this page with #c=channel1,channel2'
      });
    }
    return items;
  }

  function renderSidebar() {
    state.side.items = sidebarItems();
    state.side.sel = Math.max(0, Math.min(state.side.sel, state.side.items.length - 1));

    dom.sideSub.textContent = state.auth
      ? state.followed.length + ' live now · OK adds or removes'
      : 'OK selects · Back closes';

    dom.sideList.textContent = '';
    state.side.items.forEach((item, index) => {
      const classes = ['row'];
      if (index === state.side.sel) classes.push('row--sel');
      if (item.kind === 'channel' && !item.live) classes.push('row--offline');
      dom.sideList.appendChild(el('div', { class: classes.join(' ') }, [
        item.kind === 'channel' ? el('span', { class: 'row-dot' }) : null,
        el('div', { class: 'row-main' }, [
          el('div', { class: 'row-name', text: item.name }),
          item.meta ? el('div', { class: 'row-meta', text: item.meta }) : null
        ]),
        item.kind === 'channel'
          ? el('span', { class: 'row-mark', text: item.added ? '✓' : '+' })
          : null
      ]));
    });
  }

  function activateSidebarItem() {
    const item = state.side.items[state.side.sel];
    if (!item) return;
    if (item.kind === 'signin') {
      closeSidebar();
      startDeviceAuth();
      return;
    }
    if (item.kind !== 'channel') return;
    if (item.added) removeChannel(item.channel);
    else addChannel(item.channel);
    renderSidebar();
  }

  function formatViewers(count) {
    if (!count && count !== 0) return '';
    if (count >= 1000) return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'K viewers';
    return count + ' viewers';
  }

  // ------------------------------------------------------------------- auth

  /* Device Code Grant Flow — built for exactly this device class. Public
   * client, so no secret is involved and this is safe in a static page. */
  async function startDeviceAuth() {
    if (!CLIENT_ID) {
      toast('Set CLIENT_ID in app.js first.', 'err');
      return;
    }

    state.mode = 'setup';
    dom.setup.classList.remove('hidden');
    showSetup([
      el('h1', { text: 'Signing in…' }),
      el('p', { text: 'Asking Twitch for a code.' })
    ]);

    let data;
    try {
      const response = await fetch(DEVICE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: CLIENT_ID, scopes: SCOPES })
      });
      data = await response.json();
      if (!response.ok || !data.device_code) throw new Error(data.message || 'device request failed');
    } catch (err) {
      showSetup([
        el('h1', { text: 'Could not start sign-in' }),
        el('p', { text: String(err.message || err) }),
        el('p', { text: 'Press Back to continue without signing in.' })
      ]);
      return;
    }

    showSetup([
      el('h1', { text: 'Sign in on your phone' }),
      el('p', { text: 'On any other device, go to' }),
      el('div', { id: 'setup-url', text: 'twitch.tv/activate' }),
      el('p', { text: 'and enter this code:' }),
      el('div', { id: 'setup-code', text: data.user_code }),
      el('p', { text: 'This screen closes by itself once you are done. Press Back to skip.' })
    ]);

    const token = await pollForToken(data);
    if (!token) return;

    state.auth = token;
    save(LS_AUTH, token);
    closeSetup();
    toast('Signed in');
    state.followedAt = 0;
    await refreshFollowed();
  }

  async function pollForToken(device) {
    const intervalMs = Math.max(1, device.interval || 5) * 1000;
    const deadline = Date.now() + (device.expires_in || 1800) * 1000;

    while (Date.now() < deadline) {
      // Bail out if the user pressed Back on the setup screen.
      if (state.mode !== 'setup') return null;
      await sleep(intervalMs);
      if (state.mode !== 'setup') return null;

      let response;
      let data;
      try {
        response = await fetch(TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: CLIENT_ID,
            device_code: device.device_code,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
          })
        });
        data = await response.json();
      } catch (err) {
        continue; // transient network blip; keep polling until the deadline
      }

      if (response.ok && data.access_token) return tokenRecord(data);

      // 'authorization_pending' is the normal state until the code is entered.
      const message = String(data.message || '').toLowerCase();
      if (message.indexOf('pending') >= 0) continue;
      if (message.indexOf('slow down') >= 0) {
        await sleep(intervalMs);
        continue;
      }

      showSetup([
        el('h1', { text: 'Sign-in failed' }),
        el('p', { text: data.message || 'Twitch rejected the request.' }),
        el('p', { text: 'Press Back to continue without signing in.' })
      ]);
      return null;
    }

    showSetup([
      el('h1', { text: 'Code expired' }),
      el('p', { text: 'Press Back, then try again.' })
    ]);
    return null;
  }

  function tokenRecord(data) {
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in || 14400) * 1000
    };
  }

  /* Access tokens last 4 hours. Refresh tokens are SINGLE USE — the new one
   * must be stored or the next refresh fails. This is the only writer. */
  async function ensureToken() {
    if (!state.auth) return null;
    if (Date.now() < state.auth.expires_at - 60e3) return state.auth.access_token;
    if (!state.auth.refresh_token) {
      signOut();
      return null;
    }

    try {
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          grant_type: 'refresh_token',
          refresh_token: state.auth.refresh_token
        })
      });
      const data = await response.json();
      if (!response.ok || !data.access_token) throw new Error(data.message || 'refresh failed');
      state.auth = tokenRecord(data);
      save(LS_AUTH, state.auth);
      return state.auth.access_token;
    } catch (err) {
      toast('Session expired — sign in again.', 'warn');
      signOut();
      return null;
    }
  }

  function signOut() {
    state.auth = null;
    state.userId = null;
    state.followed = [];
    state.followedAt = 0;
    try {
      localStorage.removeItem(LS_AUTH);
    } catch (err) { /* nothing to clear */ }
    renderSidebar();
  }

  function showSetup(nodes) {
    dom.setupCard.textContent = '';
    for (const node of nodes) if (node) dom.setupCard.appendChild(node);
  }

  function closeSetup() {
    dom.setup.classList.add('hidden');
    state.mode = 'grid';
    renderSelection();
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // ------------------------------------------------------------------ helix

  async function helix(path, params) {
    const token = await ensureToken();
    if (!token) return null;
    const url = HELIX + path + (params ? '?' + new URLSearchParams(params) : '');
    const response = await fetch(url, {
      headers: { 'Client-Id': CLIENT_ID, Authorization: 'Bearer ' + token }
    });
    if (response.status === 401) {
      signOut();
      return null;
    }
    if (!response.ok) return null;
    return response.json();
  }

  async function refreshFollowed() {
    if (!state.auth || !CLIENT_ID) return;
    if (Date.now() - state.followedAt < FOLLOWED_TTL) return;
    state.followedAt = Date.now();

    try {
      if (!state.userId) {
        const users = await helix('users');
        if (!users || !users.data || !users.data.length) return;
        state.userId = users.data[0].id;
      }
      const streams = await helix('streams/followed', { user_id: state.userId, first: 100 });
      if (!streams || !streams.data) return;
      state.followed = streams.data.map((s) => ({
        login: s.user_login,
        name: s.user_name,
        game: s.game_name,
        viewers: s.viewer_count
      }));
      if (state.mode === 'sidebar') renderSidebar();
    } catch (err) {
      toast('Could not load followed channels.', 'warn');
    }
  }

  // ------------------------------------------------------------------ input

  const DIRS = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    Left: 'left', Right: 'right', Up: 'up', Down: 'down'
  };

  const OK_KEYS = ['Enter', 'Select', 'Accept', ' '];
  const BACK_KEYS = ['Escape', 'Esc', 'GoBack', 'BrowserBack', 'Backspace'];
  const AUDIO_KEYS = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'Pause', 'p'];
  const LAYOUT_NEXT = ['MediaFastForward', 'MediaTrackNext', 'FastForward'];
  const LAYOUT_PREV = ['MediaRewind', 'MediaTrackPrevious', 'Rewind'];
  const LIST_KEYS = ['ChannelUp', 'ChannelDown', 'Guide', 'ContextMenu', 'l'];

  function initInput() {
    /* First line of defence for same-document focus moves. Deferred, because
     * calling focus() while a focus event is still dispatching does not stick.
     *
     * Measured caveat: this does NOT recover focus that has moved into a
     * cross-origin player iframe — the parent document cannot pull it back
     * from inside the event. That case is caught by the periodic sweep in
     * init(), which is the guard that actually matters. */
    document.addEventListener('focusin', (event) => {
      if (event.target !== dom.sink) setTimeout(reclaimFocus, 0);
    });
    dom.sink.focus();

    // Capture phase, so nothing downstream sees the key first.
    window.addEventListener('keydown', (event) => {
      if (route(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);
  }

  function route(event) {
    const key = event.key;

    if (BACK_KEYS.indexOf(key) >= 0) return window.tvBack();

    if (state.mode === 'setup') return true; // swallow everything but Back

    if (state.mode === 'menu') return routeMenu(key);
    if (state.mode === 'sidebar') return routeSidebar(key);
    return routeGrid(key);
  }

  function routeGrid(key) {
    if (DIRS[key]) {
      spatialMove(DIRS[key]);
      return true;
    }
    if (OK_KEYS.indexOf(key) >= 0) {
      if (!state.tiles.length) openSidebar();
      else openMenu();
      return true;
    }
    if (LIST_KEYS.indexOf(key) >= 0) {
      openSidebar();
      return true;
    }
    // Media keys are a convenience, never the only path — every one of these
    // is also on the OK menu, because TVs route them inconsistently.
    if (AUDIO_KEYS.indexOf(key) >= 0) {
      const tile = state.tiles[state.sel];
      if (tile) setAudio(tile.channel);
      return true;
    }
    if (LAYOUT_NEXT.indexOf(key) >= 0) { cycleLayout(1); return true; }
    if (LAYOUT_PREV.indexOf(key) >= 0) { cycleLayout(-1); return true; }
    // Number keys: handy on a remote with a keypad, and for desktop testing.
    if (/^[1-9]$/.test(key)) {
      const tile = state.tiles[parseInt(key, 10) - 1];
      if (tile) {
        select(state.tiles.indexOf(tile));
        setAudio(tile.channel);
      }
      return true;
    }
    return false;
  }

  function routeMenu(key) {
    const dir = DIRS[key];
    const items = state.menu.items;
    if (dir === 'up' || dir === 'down') {
      const step = dir === 'down' ? 1 : -1;
      state.menu.sel = (state.menu.sel + step + items.length) % items.length;
      refreshMenu();
      return true;
    }
    if (dir === 'left' || dir === 'right') {
      const item = items[state.menu.sel];
      if (item && item.cycle) item.cycle(dir === 'right' ? 1 : -1);
      return true;
    }
    if (OK_KEYS.indexOf(key) >= 0) {
      const item = items[state.menu.sel];
      if (item && item.run) item.run();
      else if (item && item.cycle) item.cycle(1);
      return true;
    }
    return true; // the menu is modal; swallow the rest
  }

  function routeSidebar(key) {
    const dir = DIRS[key];
    const items = state.side.items;
    if (dir === 'up' || dir === 'down') {
      const step = dir === 'down' ? 1 : -1;
      state.side.sel = (state.side.sel + step + items.length) % items.length;
      renderSidebar();
      return true;
    }
    if (dir === 'right' || OK_KEYS.indexOf(key) >= 0) {
      activateSidebarItem();
      return true;
    }
    if (dir === 'left') {
      closeSidebar();
      return true;
    }
    return true; // modal
  }

  /* Called by the Android shell for the hardware Back key. Returning false
   * means "nothing left to dismiss" and the shell then exits the app — which
   * is what stops Back leaving a blank WebView behind. */
  window.tvBack = function tvBack() {
    if (state.mode === 'setup') { closeSetup(); return true; }
    if (state.mode === 'menu') { closeMenu(); return true; }
    if (state.mode === 'sidebar') { closeSidebar(); return true; }
    return false;
  };

  // ------------------------------------------------------------------- boot

  function restore() {
    const session = readHash() || load(LS_SESSION, null);
    if (!session || !session.channels || !session.channels.length) return;

    if (session.layout && LAYOUTS.indexOf(session.layout) >= 0) state.layout = session.layout;
    if (session.quality) state.quality = session.quality;
    if (session.railQuality) state.railQuality = session.railQuality;
    state.big = session.big || session.channels[0];

    for (const channel of session.channels.slice(0, MAX_TILES)) addChannel(channel);
    if (session.audio) setAudio(session.audio, true);
    state.sel = 0;
    render();
  }

  function init() {
    state.auth = load(LS_AUTH, null);
    initInput();
    render();
    restore();

    if (!SDK_READY) {
      toast('Twitch Embed SDK did not load — running in basic iframe mode.', 'warn');
    }

    if (state.auth) refreshFollowed();
    setInterval(() => {
      if (state.auth) refreshFollowed();
    }, FOLLOWED_TTL);

    /* The real focus guard. A player iframe can appear late, and the SDK
     * rebuilds its iframe on some transitions, so re-harden and reclaim focus
     * on a timer. Verified to be what actually recovers the remote after an
     * iframe takes focus — the focusin listener alone cannot. One second is
     * the worst-case dead-remote window, and the failure it prevents is not
     * diagnosable from a sofa. */
    setInterval(hardenFrames, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
