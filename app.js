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
  const LOGIN_URL = 'https://www.twitch.tv/login';
  const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
  const HELIX = 'https://api.twitch.tv/helix/';
  const SDK_READY = !!(window.Twitch && window.Twitch.Player);

  /* Android WebView puts "; wv" in its user agent. The playback sign-in is
   * offered only there, because it is worthless anywhere else: it depends on
   * the shell permitting third-party cookies, and a desktop browser blocks
   * them with no equivalent switch. */
  const IN_SHELL = /;\s*wv\b/.test(navigator.userAgent);

  /* Nine tiles is a geometry limit, not a hardware one: three rows is as many
   * as fit above Twitch's autoplay size minimum at the declared viewport (see
   * the meta comment in index.html), and three columns of 16:9 is what three
   * rows implies.
   *
   * The hardware limit is separate and lower. Android commonly allows about
   * four concurrent hardware video decoders, and past that MediaCodec fails to
   * allocate and a tile goes BLACK rather than erroring visibly — there is
   * nothing to catch. So SAFE_TILES is what is known to work and MAX_TILES is
   * what the layout can express; crossing between them warns once and then
   * lets the device answer for itself. Tune from `adb logcat | grep -i codec`
   * on the actual box, never from what worked elsewhere. */
  const SAFE_TILES = 4;
  const MAX_TILES = 9;

  /* Five tiles is where the label bar starts costing more video height than it
   * is worth. Matches #stage.dense in index.html. */
  const DENSE_FROM = 5;

  const QUALITY_TARGETS = ['auto', '160p', '360p', '480p', '720p'];
  const QUALITY_TIERS = ['160p', '360p', '480p', '720p'];   // ascending, no 'auto'
  const LAYOUTS = ['auto', 'even', 'focus'];

  /* Sessions saved before the nine-tile layouts, and hashes typed from memory. */
  const LAYOUT_ALIASES = { '2x2': 'even', '2x1': 'even', grid: 'even', solo: 'auto' };

  const FOLLOWED_TTL = 90e3;

  /* A paused player is nudged back to life by the sweep in init(). Bounded so
   * that a player paused for a reason we cannot fix — a mature-content gate,
   * a sub-only stream — is not hammered with play() once a second forever. */
  const RESUME_TRIES = 5;

  /* Two different waits, because the two failures are not alike.
   *
   * A tile that has already played once and then stopped is the bug this all
   * exists for, and it should come back quickly.
   *
   * A tile that has NEVER played may simply still be starting, and on a Shield
   * with three tiles that was measured taking upwards of 30 seconds from load.
   * Treating it as broken any earlier means tearing down a player that was
   * about to work — which is worse than waiting.
   *
   * That wait has to scale with the tile count, because the tiles contend: nine
   * players negotiating autoplay, fetching manifests and claiming decoders all
   * at once are all slower than three were. The constants are set so that three
   * tiles still give the 60s that was actually measured, and nine give two
   * minutes. Both are deliberately far past anything observed — a wait that is
   * too long only delays the safety net, while one that is too short tears down
   * players that were about to work. */
  const RESUME_GRACE = 8e3;
  const START_GRACE_BASE = 30e3;
  const START_GRACE_PER_TILE = 10e3;
  const START_GRACE_MAX = 120e3;

  function startGrace() {
    return Math.min(START_GRACE_MAX,
      START_GRACE_BASE + START_GRACE_PER_TILE * state.tiles.length);
  }

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
    app: $('#app'),
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
    quality: 'auto',     // main tile
    railQuality: 'auto', // every other tile
    mode: 'grid',        // grid | sidebar | menu | setup
    menu: { items: [], sel: 0 },
    side: { items: [], sel: 0 },
    auth: null,          // { access_token, refresh_token, expires_at }
    userId: null,
    followed: [],
    followedAt: 0,
    warnedFallback: false,
    warnedDecoders: false,
    warnedUndersized: {},   // geometry key -> already logged; see warnIfUndersized()
    setupConfirm: null   // OK handler while the setup screen is up, if any
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
      layout: normalizeLayout(params.get('layout')) || 'auto',
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

  /* Returns null for anything unrecognised so the caller can fall back, rather
   * than silently pinning a stored session to a layout that no longer exists. */
  function normalizeLayout(value) {
    const name = LAYOUT_ALIASES[value] || value;
    return LAYOUTS.indexOf(name) >= 0 ? name : null;
  }

  // ------------------------------------------------------------------ toast

  let toastTimer = null;

  /* The toast and the hints share one strip beneath the stage and swap places,
   * because a toast floating over the grid occludes the players and pauses
   * them. See the hints/toast comment in index.html. */
  function toast(message, kind) {
    dom.toast.textContent = message;
    dom.toast.className = kind || '';
    dom.hints.classList.add('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      dom.toast.classList.add('hidden');
      dom.hints.classList.remove('hidden');
    }, 3200);
  }

  // ------------------------------------------------------------------- tile

  let tileSeq = 0;

  class Tile {
    constructor(channel) {
      this.channel = channel;
      this.id = 'tmv-player-' + (++tileSeq);
      this.muted = true;
      this.online = true;
      this.paused = false;
      this.everPlayed = false;
      this.resumeTries = 0;
      this.remounted = false;
      this.mountedAt = Date.now();   // reset by mount(); see resume()
      this.qualities = [];
      this.appliedQuality = null;
      this.videoH = 0;               // set by layoutStage(); drives 'auto' quality
      this.build();
      // mount() is deliberately NOT called here: the Embed SDK resolves the
      // container by id via getElementById, so the element has to be in the
      // document first. addChannel() appends, then mounts.
    }

    build() {
      // The SDK owns playerEl and may replace its contents, so the offline
      // card is a sibling rather than a child of it.
      this.playerEl = el('div', { class: 'tile-player', id: this.id });
      this.offlineEl = el('div', { class: 'tile-offline hidden' }, [
        el('div', { text: 'Offline' }),
        el('div', { text: this.channel })
      ]);
      this.videoEl = el('div', { class: 'tile-video' }, [this.playerEl, this.offlineEl]);

      this.numEl = el('div', { class: 'tile-num' });
      this.nameEl = el('div', { class: 'tile-name', text: this.channel });
      this.badgesEl = el('div', { class: 'tile-badges' });

      /* The bar is a real grid row BENEATH the video, not an overlay. Anything
       * painted over the player makes Twitch's autoplay check fail — see the
       * tile comment in index.html. Kept as a field because layoutStage()
       * measures its height: it is the one part of a tile that is not 16:9, so
       * every rectangle in every layout is derived from it. */
      this.barEl = el('div', { class: 'tile-bar' }, [this.numEl, this.nameEl, this.badgesEl]);
      this.el = el('div', { class: 'tile' }, [this.videoEl, this.barEl]);
    }

    mount() {
      this.mountedAt = Date.now();
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
        this.markPlaying();
      });
      this.player.addEventListener(P.ONLINE, () => this.setOnline(true));
      this.player.addEventListener(P.OFFLINE, () => this.setOnline(false));

      /* Nothing in this app ever asks a player to pause — Play/Pause on the
       * remote is bound to the audio swap. So a PAUSE here always means Twitch
       * paused itself, and the only cause seen in practice is the player being
       * covered up. Guarded because an older SDK may not define the constant,
       * and addEventListener(undefined, …) would silently never fire. */
      if (P.PAUSE) this.player.addEventListener(P.PAUSE, () => { this.paused = true; });
      if (P.PLAY) this.player.addEventListener(P.PLAY, () => this.markPlaying());
    }

    markPlaying() {
      this.paused = false;
      this.everPlayed = true;
      this.resumeTries = 0;
      this.remounted = false;
    }

    /* isPaused() reads state the embed already mirrors into this page, so this
     * is cheap enough to poll once a second. It throws while the player is
     * being torn down, hence the fall back to the event-driven flag. */
    isPausedNow() {
      const paused = safeCall(() => this.player.isPaused());
      return paused === undefined ? this.paused : !!paused;
    }

    /* Showing nothing, and will not fix itself.
     *
     * Two different states land here and only one of them is what isPaused()
     * reports. Measured in Chrome: isPaused() is false for a player that was
     * never allowed to start — it only goes true after a real pause. So a tile
     * that has never once reported playback is judged stuck on that basis
     * instead, or a refused autoplay would sit behind a play button forever
     * with nothing retrying it.
     *
     * The grace periods leave the embed's own autoplay negotiation alone: a
     * player that is still starting up looks exactly like a stuck one, and the
     * two cases get very different waits — see RESUME_GRACE / START_GRACE. */
    isStuck() {
      if (!this.player || !this.online) return false;
      const age = Date.now() - this.mountedAt;
      if (this.everPlayed) return age >= RESUME_GRACE && this.isPausedNow();
      return age >= startGrace();
    }

    /* The embed never restarts itself once it has paused, so the app has to
     * ask. No-op in the iframe fallback, which exposes no player API — there
     * the only cure is a reload. */
    resume() {
      if (!this.player || !this.online) return;

      if (!this.isStuck()) {
        /* Only a player known to be running may clear the counters. A tile that
         * is merely still inside its start grace must NOT be recorded as having
         * played, or everPlayed would latch on a player that never started and
         * isPausedNow() — false for exactly that case — would disable the whole
         * ladder for it. */
        if (this.everPlayed) this.markPlaying();
        return;
      }
      this.paused = true;

      /* Last resort, once per pause, after play() has been ignored five times:
       * build the player again. Autoplay is the one path known to work on this
       * hardware, so give the tile a fresh one rather than leave a black box on
       * screen. Bounded by `remounted` — a tile that cannot play at all (sub
       * only, mature gate) must not sit in a reload loop. */
      if (this.resumeTries >= RESUME_TRIES) {
        if (!this.remounted) {
          this.remounted = true;
          this.remount();
        }
        return;
      }

      this.resumeTries++;
      safeCall(() => this.player.play());
      // Re-assert the exclusive-audio invariant: whatever restarted the player
      // must not be allowed to bring a second stream back audible.
      this.setMuted(this.muted);
    }

    /* The Embed SDK does not fill the container it is given, it REPLACES that
     * node with one of its own carrying the same id — so the playerEl captured
     * in build() is a detached node from the moment the player mounts. Anything
     * that needs the live container has to resolve it by id. Measured in
     * Chrome; a stale reference here silently produced a tile that never came
     * back, because replaceWith() on a detached node does nothing. */
    liveContainer() {
      return document.getElementById(this.id) || this.playerEl;
    }

    /* Deliberately throws the iframe away, which is the one case where that is
     * wanted — everywhere else in this app tiles are never re-parented, because
     * moving an element containing an iframe reloads it. */
    remount() {
      if (this.player) safeCall(() => this.player.destroy());
      this.player = null;
      this.qualities = [];
      this.appliedQuality = null;
      this.resumeTries = 0;
      // The replacement is a different player and gets judged on its own
      // record, not on what the one before it managed. `remounted` is
      // deliberately NOT cleared here — that is the loop guard.
      this.everPlayed = false;
      this.paused = false;

      const fresh = el('div', { class: 'tile-player', id: this.id });
      const current = this.liveContainer();
      if (current && current.parentNode) current.replaceWith(fresh);
      else this.videoEl.insertBefore(fresh, this.offlineEl);   // belt and braces
      this.playerEl = fresh;
      this.mount();
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
      this.playerEl.appendChild(this.frame);
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
      const isBig = this.channel === state.big;
      const set = isBig ? state.quality : state.railQuality;
      return set === 'auto' ? autoQuality(this.videoH, state.tiles.length, isBig) : set;
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

  /* 'auto' resolves two limits at once.
   *
   * The budget is by tile count, and it is the one that matters. It reproduces
   * exactly what was measured on the Shield — 720p solo, 480p main and 360p
   * rail at four up — and then holds flat, because the ceiling that actually
   * bites past four tiles is the NUMBER of concurrent hardware decoders, which
   * no choice of resolution changes. Dropping everything to 160p at nine tiles
   * would look terrible and buy nothing against the failure it was meant to
   * prevent.
   *
   * The pixel rule is the cheap half: never fetch more rows than the tile can
   * show. It rarely binds under the budget, but it keeps the whole thing honest
   * if a denser layout is added later.
   *
   * "Smallest tier at or above the tile" rather than "nearest tier", and the
   * difference is not cosmetic: nearest hands a 203px tile 160p, which is an
   * upscale — deliberately fetching fewer rows than the tile is about to draw.
   * The point of this half is to stop paying for pixels that get thrown away,
   * not to blur the picture, so it may only ever round up. */
  function autoBudget(count, isBig) {
    if (count <= 2) return isBig ? '720p' : '480p';
    return isBig ? '480p' : '360p';
  }

  function autoQuality(videoH, count, isBig) {
    const cap = autoBudget(count, isBig);
    if (!videoH) return cap;          // before the first layout pass
    let pick = QUALITY_TIERS[QUALITY_TIERS.length - 1];
    for (const tier of QUALITY_TIERS) {
      if (parseInt(tier, 10) >= videoH) { pick = tier; break; }   // ascending
    }
    return QUALITY_TIERS.indexOf(pick) < QUALITY_TIERS.indexOf(cap) ? pick : cap;
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

  // --------------------------------------------------------------- playback

  /* Shrink the stage so an open panel sits BESIDE the tiles rather than over
   * them. A player that gets covered is a player Twitch pauses — this is the
   * fix for the menu killing every stream, and the resume path below is only
   * the safety net. Resizing tiles is free; re-parenting them is what would
   * reload the iframes, and nothing here moves an element. */
  let shiftTimer = null;

  function setShift(side) {
    clearTimeout(shiftTimer);
    if (side) snapClosedPanels();
    dom.app.classList.toggle('shift-left', side === 'left');
    dom.app.classList.toggle('shift-right', side === 'right');
    /* Synchronously, in the same turn as the padding change. Tiles are placed
     * in px, so narrowing the stage does not move them — they would keep their
     * old rectangles and hang out under the panel, which is the occlusion that
     * pauses every stream. The ResizeObserver would also catch this, but only
     * on the next frame and only while frames are being produced; a paused or
     * throttled renderer delivers no callbacks at all. The known state changes
     * therefore ask directly, and the observer stays as the backstop for the
     * ones nothing thought to announce. */
    layoutStage();
  }

  /* Widening the stage the instant a panel starts sliding away puts tiles back
   * under a panel that is still on screen for another 180ms — brief, but it is
   * the very thing being fixed. So the stage stays narrow until the slide is
   * over, and only then do the players get their nudge. */
  function unshiftAfterSlide() {
    clearTimeout(shiftTimer);
    shiftTimer = setTimeout(() => {
      dom.app.classList.remove('shift-left', 'shift-right');
      layoutStage();       // widen the tiles back out; see setShift()
      resumePlayback(true);
    }, 240);
  }

  /* Going straight from one panel to the other would otherwise leave the
   * outgoing one animating across a stage that has already moved under it.
   * Take it off-screen in a single frame instead: kill the transition, force
   * the layout to commit, then hand the transition back for the next open. */
  function snapClosedPanels() {
    for (const panel of [dom.menu, dom.sidebar]) {
      if (panel.classList.contains('open')) continue;
      panel.classList.add('snap');
      void panel.offsetWidth;
      panel.classList.remove('snap');
    }
  }

  /* The setup screen is the one overlay that genuinely has to cover the
   * screen — a sign-in code has to be legible from the sofa — so streams do
   * pause there, and this is what starts them again afterwards. `force` clears
   * the attempt budget, for when we know the cause has just gone away. */
  function resumePlayback(force) {
    if (state.mode === 'setup') return;
    for (const tile of state.tiles) {
      if (force) tile.resumeTries = 0;
      tile.resume();
    }
  }

  function anyPaused() {
    return state.tiles.some((tile) => tile.isStuck());
  }

  // ----------------------------------------------------------------- layout

  /* Streams are 16:9. Everything here follows from that and from one number.
   *
   * Twitch refuses autoplay below roughly 400x300 CSS px of player, and says so
   * in the console as "minimum requirements for autoplay were not met: size".
   * That is a floor on the SMALLEST tile in any layout, and at nine tiles it is
   * the constraint that decides the whole design: with the stage box at the
   * declared 2880 viewport, three rows leave 365px of video per tile and four
   * rows leave 245 — so three rows is the ceiling, and three rows of 16:9 is
   * what makes nine the tile limit. See the meta viewport comment in
   * index.html for where those numbers come from.
   *
   * Every plan below therefore sizes each tile to the largest 16:9 video its
   * cell can hold, rather than stretching it to fill the cell and letting the
   * player letterbox itself inside. That is worth real screen: the stage box is
   * close to 2:1 and a 3x3 of 16:9 is 16:9, so a stretched 3x3 spends about a
   * quarter of its area on black bars that the tile could have used. */
  const VIDEO_AR = 16 / 9;
  const MIN_PLAYER_W = 400;
  const MIN_PLAYER_H = 300;

  /* Focus layouts: one big tile plus the rest, expressed as a uniform cell grid
   * with the big tile spanning a block of cells at the top left. The free cells
   * are then filled in reading order — the strip beside the big tile, then the
   * band underneath it.
   *
   * Each row is chosen so the free cells come out equal to the number of small
   * tiles, or one over. Both other outcomes are bad: too few and a tile has
   * nowhere to go, too many and the grid has visible holes in it. The columns
   * are also bounded by the size minimum — five columns puts the small tiles at
   * 508x286 and under the floor, which is why nothing here is wider than four.
   *
   * n=5 and n=8 carry the one spare cell, and it lands in the bottom band where
   * a short row gets centred, so it reads as space rather than as a gap. */
  const FOCUS_PLANS = {
    /* Two rows even for two tiles, which looks like one row too many until you
     * work it out: cells are the size of a tile, so a big tile spanning one row
     * is exactly one row tall, and being 16:9 it is then exactly as wide as a
     * small one. A one-row focus layout cannot have a big tile at all. */
    2: { cols: 3, rows: 2, sc: 2, sr: 2 },
    3: { cols: 3, rows: 2, sc: 2, sr: 2 },
    4: { cols: 4, rows: 3, sc: 3, sr: 3 },
    5: { cols: 3, rows: 3, sc: 2, sr: 2 },
    6: { cols: 3, rows: 3, sc: 2, sr: 2 },
    7: { cols: 4, rows: 3, sc: 3, sr: 2 },
    8: { cols: 4, rows: 3, sc: 2, sr: 2 },
    9: { cols: 4, rows: 3, sc: 2, sr: 2 }
  };

  function remPx() {
    return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  }

  /* What a cell would be if the stage were divided evenly. Only used to work
   * out how big a 16:9 tile can be; nothing is placed on it. */
  function cellGrid(box, gap, cols, rows) {
    return {
      cellW: (box.w - (cols - 1) * gap) / cols,
      cellH: (box.h - (rows - 1) * gap) / rows
    };
  }

  /* Where tiles actually go: a block of uniform cells the size of the fitted
   * tile, centred in the stage.
   *
   * This is the difference between a video wall and a scatter. A 3x3 of 16:9 is
   * itself 16:9, but the stage box is nearer 2:1, so ~660px of width has
   * nowhere to go. Centring each tile in an evenly divided cell spreads that
   * slack into the gutters — 220px of dead space between every column, rows
   * still tight, and the grid reads as broken rather than as deliberate.
   * Sizing the cells to the tiles instead puts all of it in the outer margins,
   * where it reads as a centred wall. It also keeps the columns of a focus
   * layout aligned with the band underneath it, which per-cell centring does
   * not.
   *
   * Fractional columns are deliberate: a half-cell offset is how a short row
   * gets centred without disturbing the rhythm of the full ones. */
  function compactGrid(box, gap, tileW, tileH, cols, rows) {
    const x0 = (box.w - (cols * tileW + (cols - 1) * gap)) / 2;
    const y0 = (box.h - (rows * tileH + (rows - 1) * gap)) / 2;
    return {
      x: (c) => x0 + c * (tileW + gap),
      y: (r) => y0 + r * (tileH + gap)
    };
  }

  /* The largest 16:9 video that fits a block, plus the label bar underneath it,
   * centred in the block. The bar is the only part of a tile that is not 16:9,
   * so it is subtracted before the aspect fit and added back after. */
  function fitTile(x, y, w, h, bar) {
    const videoH = Math.min(h - bar, w / VIDEO_AR);
    const videoW = videoH * VIDEO_AR;
    return {
      x: x + (w - videoW) / 2,
      y: y + (h - (videoH + bar)) / 2,
      w: videoW,
      h: videoH + bar,
      videoW: videoW,
      videoH: videoH
    };
  }

  /* Equal tiles. Every (cols, rows) that can hold n is tried and the one giving
   * the biggest video wins, so this needs no per-count table and stays right for
   * a stage of any shape — which matters, because opening a side panel changes
   * that shape. Ties go to the fewest columns, which is the one with the fewest
   * empty cells. */
  function planEven(n, box, gap, bar) {
    let best = null;
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const cell = cellGrid(box, gap, cols, rows);
      if (cell.cellW <= 0 || cell.cellH - bar <= 0) continue;
      const tile = fitTile(0, 0, cell.cellW, cell.cellH, bar);
      const score = tile.videoW * tile.videoH;
      if (!best || score > best.score) best = { cols: cols, rows: rows, tile: tile, score: score };
    }
    if (!best) return null;

    const grid = compactGrid(box, gap, best.tile.w, best.tile.h, best.cols, best.rows);
    const rects = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / best.cols);
      const inRow = Math.min(best.cols, n - row * best.cols);
      const col = (i - row * best.cols) + (best.cols - inRow) / 2;   // centre a short last row
      rects.push(fitTile(grid.x(col), grid.y(row), best.tile.w, best.tile.h, bar));
    }
    return rects;
  }

  /* One big tile plus the rest. Returns rects indexed to match state.tiles, so
   * the big tile keeps its own index and nothing has to be reordered — tiles are
   * never re-parented, and their DOM order is not their visual order. */
  function planFocus(n, box, gap, bar, bigIndex) {
    const plan = FOCUS_PLANS[n];
    if (!plan) return null;
    const cell = cellGrid(box, gap, plan.cols, plan.rows);
    if (cell.cellW <= 0 || cell.cellH - bar <= 0) return null;
    const small = fitTile(0, 0, cell.cellW, cell.cellH, bar);
    const grid = compactGrid(box, gap, small.w, small.h, plan.cols, plan.rows);

    /* The strip beside the big tile first, then the band underneath it. A short
     * strip is centred vertically and a short band row horizontally, so the one
     * spare cell that some counts carry reads as space rather than as a hole. */
    const cells = [];
    const stripCols = plan.cols - plan.sc;
    const stripUse = Math.min(n - 1, stripCols * plan.sr);
    const stripRows = stripCols ? Math.ceil(stripUse / stripCols) : 0;
    const stripTop = (plan.sr - stripRows) / 2;
    for (let r = 0; r < stripRows; r++) {
      for (let c = plan.sc; c < plan.cols && cells.length < stripUse; c++) {
        cells.push({ c: c, r: r + stripTop });
      }
    }
    for (let r = plan.sr; r < plan.rows; r++) {
      const left = (n - 1) - cells.length;
      if (left <= 0) break;
      const inRow = Math.min(plan.cols, left);
      const offset = (plan.cols - inRow) / 2;    // centre the short row, if any
      for (let i = 0; i < inRow; i++) cells.push({ c: offset + i, r: r });
    }
    if (cells.length < n - 1) return null;

    const rects = [];
    rects[bigIndex] = fitTile(
      grid.x(0), grid.y(0),
      plan.sc * small.w + (plan.sc - 1) * gap,
      plan.sr * small.h + (plan.sr - 1) * gap,
      bar);

    let next = 0;
    for (let i = 0; i < n; i++) {
      if (i === bigIndex) continue;
      const at = cells[next++];
      rects[i] = fitTile(grid.x(at.c), grid.y(at.r), small.w, small.h, bar);
    }
    return rects;
  }

  function meetsMinimum(rects) {
    return rects.every((r) => r.videoW >= MIN_PLAYER_W && r.videoH >= MIN_PLAYER_H);
  }

  function planFor(n, box, gap, bar) {
    const even = planEven(n, box, gap, bar);
    if (n < 2) return even;

    // 'auto' keeps tiles equal except at three, where a big-plus-two reads far
    // better than two-over-one-centred. This is the layout the app shipped with.
    const wantFocus = state.layout === 'focus' || (state.layout === 'auto' && n === 3);
    if (!wantFocus || !even) return even;

    const bigIndex = Math.max(0, state.tiles.findIndex((t) => t.channel === state.big));
    const focus = planFocus(n, box, gap, bar, bigIndex);
    if (!focus) return even;

    /* Never let the chosen layout starve a tile below the autoplay minimum when
     * the other layout would not. This is not theoretical: opening a side panel
     * takes about a third of the stage width, and the four-column focus plans
     * drop to 401x226 while an even 3x3 holds 546x307. The cost of getting it
     * wrong is a tile that silently never starts, which is not diagnosable from
     * a sofa. */
    if (meetsMinimum(focus) || !meetsMinimum(even)) return focus;
    return even;
  }

  /* Sized below what Twitch will autoplay. Nothing can be done about it from
   * here — it means the stage is too small for this many tiles — but it is the
   * single most likely cause of "some tiles are black", and the shell forwards
   * console output to logcat, so say so there rather than leaving it to be
   * bisected again.
   *
   * A set of seen geometries rather than just the last one: opening and closing
   * a side panel alternates between two of them, so remembering one key means
   * re-logging on every single toggle. The set is bounded by tile count times
   * the handful of stage widths that exist. */
  function warnIfUndersized(rects) {
    const worst = rects.reduce((a, b) => (b.videoW * b.videoH < a.videoW * a.videoH ? b : a));
    if (worst.videoW >= MIN_PLAYER_W && worst.videoH >= MIN_PLAYER_H) return;
    const key = rects.length + ':' + Math.round(worst.videoW) + 'x' + Math.round(worst.videoH);
    if (state.warnedUndersized[key]) return;
    state.warnedUndersized[key] = true;
    console.warn('[tmvtv] smallest player is ' + key.split(':')[1] + ' CSS px, under Twitch\'s '
      + MIN_PLAYER_W + 'x' + MIN_PLAYER_H + ' autoplay minimum — expect size rejections');
  }

  /* Positions every tile. Called from render() and from the ResizeObserver, so
   * it also covers a side panel shrinking the stage and a change of screen. */
  function layoutStage() {
    const n = state.tiles.length;
    if (!n) return;
    const box = { w: dom.stage.clientWidth, h: dom.stage.clientHeight };
    if (box.w <= 0 || box.h <= 0) return;

    /* The bar is measured rather than assumed, because .dense changes it and
     * every rectangle is derived from it. render() applies .dense before
     * calling here; reading the rect forces the style to be committed first. */
    const bar = state.tiles[0].barEl.getBoundingClientRect().height;
    const rects = planFor(n, box, remPx(), bar);
    if (!rects) return;

    state.tiles.forEach((tile, i) => {
      const rect = rects[i];
      if (!rect) return;
      tile.el.style.left = rect.x + 'px';
      tile.el.style.top = rect.y + 'px';
      tile.el.style.width = rect.w + 'px';
      tile.el.style.height = rect.h + 'px';
      tile.videoH = rect.videoH;
      tile.applyQuality();     // 'auto' follows the tile size; a no-op if unchanged
    });
    warnIfUndersized(rects);
  }

  // ------------------------------------------------------------------- grid

  function addChannel(channel) {
    channel = normalizeChannel(channel);
    if (!channel) return;
    if (state.tiles.some((t) => t.channel === channel)) return;
    if (state.tiles.length >= MAX_TILES) {
      toast(MAX_TILES + ' streams is the limit — remove one first.', 'warn');
      return;
    }
    /* Said once, and worth saying: past this point a tile that goes black is
     * almost certainly MediaCodec failing to allocate a decoder, which produces
     * no error anywhere the app can see. Warning is all that can be done. */
    if (state.tiles.length >= SAFE_TILES && !state.warnedDecoders) {
      state.warnedDecoders = true;
      toast('More than ' + SAFE_TILES + ' streams — if a tile stays black, this box has run out of video decoders.', 'warn');
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
    if (!count) {
      dom.emptyMsg.innerHTML = CLIENT_ID
        ? 'Press <b>OK</b> to open your channel list.'
        : 'Set <b>CLIENT_ID</b> in <b>app.js</b> to load your followed channels, or open this page with <b>#c=channel1,channel2</b>.';
    }

    /* Set as one string so nothing can leave a stale layout class behind, and
     * before layoutStage(), which measures a bar whose height .dense changes. */
    dom.stage.className = (count ? '' : 'hidden ') + (count >= DENSE_FROM ? 'dense ' : '') + 'n-' + count;

    /* Never re-append a tile. Moving an element that contains an iframe reloads
     * that iframe, so reordering the DOM here would restart every player on
     * each layout change. layoutStage() positions tiles by index instead, which
     * needs no DOM order at all. */
    state.tiles.forEach((tile, index) => {
      tile.numEl.textContent = String(index + 1);
      tile.renderBadges();
    });

    layoutStage();
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

    /* Only offered when there is something to fix. Streams should never still
     * be paused by the time this menu is on screen, so if this item appears at
     * all it means the automatic resume gave up — a mature-content gate or a
     * sub-only stream, neither of which a D-pad can clear. */
    if (anyPaused()) {
      items.push({
        label: 'Restart paused streams',
        run: () => { closeMenu(); resumePlayback(true); }
      });
    }

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

    /* Nothing to do with the item above: that one signs in for *metadata*,
     * this one for *playback*. See playbackSignIn(). */
    if (IN_SHELL) {
      items.push({
        label: 'Twitch account for playback…',
        run: () => { closeMenu(); playbackSignIn(); }
      });
    }

    state.menu = { items: items, sel: 0 };
    state.mode = 'menu';
    dom.menuTitle.textContent = tile ? tile.channel : 'Multi-View';
    setShift('right');   // before .open, so the tiles are clear of the panel
    dom.menu.classList.add('open');
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
    dom.menu.classList.remove('open');
    unshiftAfterSlide();
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
    setShift('left');    // before .open, so the tiles are clear of the panel
    dom.sidebar.classList.add('open');
    renderSelection();
    renderSidebar();
    refreshFollowed();
  }

  function closeSidebar() {
    dom.sidebar.classList.remove('open');
    unshiftAfterSlide();
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
    state.setupConfirm = null;   // this screen has no OK action
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

  /* Playback sign-in — unrelated to the device-code flow above, and the two
   * get confused constantly, so: that one authenticates *metadata* and fixes
   * the followed list. This one is about the *player*.
   *
   * The players are third-party iframes with no Twitch session, which is why
   * ads play, sub-only channels refuse and mature gates stop a tile. There is
   * no embed API call that hands a session to a player — that part of CLAUDE.md
   * is still true. The only route is the browser's cookie jar: load twitch.tv
   * as a top-level page in this same WebView so Twitch sets its cookie
   * first-party, and let the shell's setAcceptThirdPartyCookies carry it into
   * the iframes.
   *
   * It is a one-off; WebView cookies persist and Twitch sessions are long.
   * Signing out again means coming back here and using Twitch's own menu.
   *
   * Treat this as an experiment until it has been watched on the device. It
   * turns on whether Twitch marks its auth cookie SameSite=None, which is not
   * observable from this origin — a Lax cookie is never sent cross-site and
   * nothing here can change that. Hence the deliberately unpromising wording
   * on screen: it must not read as a feature that is known to work. */
  function playbackSignIn() {
    state.mode = 'setup';
    state.setupConfirm = () => { location.href = LOGIN_URL; };
    dom.setup.classList.remove('hidden');
    showSetup([
      el('h1', { text: 'Twitch account for playback' }),
      el('p', { text: 'The streams play logged out, which is why they show ads and why sub-only channels will not start.' }),
      el('p', { text: 'Signing in to Twitch itself here may fix that — Turbo and subscriptions would then apply. It may also change nothing; Twitch decides.' }),
      el('p', { text: 'The grid closes and Twitch opens. Sign in, then press Back to return. Your streams come back as they were.' }),
      el('p', { text: 'Press OK to go to Twitch, or Back to stay here.' })
    ]);
  }

  function showSetup(nodes) {
    dom.setupCard.textContent = '';
    for (const node of nodes) if (node) dom.setupCard.appendChild(node);
  }

  function closeSetup() {
    dom.setup.classList.add('hidden');
    state.setupConfirm = null;
    state.mode = 'grid';
    renderSelection();
    resumePlayback(true);
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

    /* The setup screen swallows everything but Back, except that a screen may
     * offer a single OK action — the device-code screen has none, the playback
     * sign-in confirms with it. */
    if (state.mode === 'setup') {
      if (OK_KEYS.indexOf(key) >= 0 && state.setupConfirm) state.setupConfirm();
      return true;
    }

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

    state.layout = normalizeLayout(session.layout) || state.layout;
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
    setInterval(() => {
      hardenFrames();
      /* Second job for the same tick: restart anything Twitch paused behind
       * our back. The UI no longer covers the players, so in normal use this
       * finds nothing — it is what recovers the grid after the sign-in screen,
       * an Android TV screensaver, or the app being backgrounded. */
      resumePlayback(false);
    }, 1000);

    /* The layout is px geometry, so it has to be recomputed whenever the stage
     * changes shape — which happens without any state change at all: opening a
     * side panel pads the stage in by a third of its width. Watching the element
     * catches that, a screen change and the desktop dev loop alike. Setting tile
     * styles does not resize the stage, so this cannot feed back on itself. */
    if (window.ResizeObserver) {
      new ResizeObserver(() => layoutStage()).observe(dom.stage);
    } else {
      window.addEventListener('resize', layoutStage);
    }

    // Coming back from the launcher pauses everything; do not wait a second.
    // Re-place the tiles too: nothing observes the stage while the renderer is
    // throttled, so any reshape that happened meanwhile arrives unannounced.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      layoutStage();
      resumePlayback(true);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
