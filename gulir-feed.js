/* Feed navigation is local-only. Refresh replaces cards only after new data is ready. */
function randomSeed() {
  try { return globalThis.crypto.getRandomValues(new Uint32Array(1))[0] || 1; }
  catch { return ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0) || 1; }
}

export function createGulirFeed({ root, button, status, getData, append, replace, retry, notice, currentUnit, refreshed, isActive = () => !root.hidden }) {
  const seen = new Set();
  const seed = randomSeed();
  let sequence = 0, busy = false, pull = null;
  const nextSeed = () => (seed + Math.imul(++sequence, 7919)) >>> 0;
  const remember = items => items.forEach(item => seen.add(item.unitKey));
  function show(text) {
    status.textContent = text;
    status.hidden = !text || !isActive();
  }
  function loading(value, text = 'Memuat ayat berikutnya…') {
    busy = value;
    root.setAttribute('aria-busy', String(value));
    button.disabled = value || !getData();
    button.setAttribute('aria-busy', String(value));
    show(value ? text : '');
  }
  async function more({ force = false } = {}) {
    if (busy || !getData() || (!force && root.querySelector('[data-feed-retry]'))) return false;
    loading(true);
    root.querySelector('[data-feed-retry]')?.remove();
    try {
      const result = await getData().batch({ seed: nextSeed(), exclude: seen, count: 10 });
      if (result.items.length) {
        remember(result.items);
        append(result.items);
        return true;
      }
      retry(result.failures ? 'Ayat berikutnya belum bisa dimuat. Bacaan yang sudah terbuka tetap tersedia; periksa koneksi lalu coba lagi.' : 'Pilihan yang tersedia sudah dibaca. Ganti ayat untuk mengacak lagi, atau buka surah dari Pustaka.', { refresh: false });
    } catch {
      retry('Pemuatan terhenti. Bacaan yang sudah terbuka tidak dihapus; coba lagi atau buka Pustaka.', { refresh: false });
    } finally { loading(false); }
    return false;
  }
  async function refresh({ initial = false } = {}) {
    if (busy || !getData()) return false;
    pull = null;
    loading(true, 'Menyiapkan pilihan ayat baru…');
    try {
      let recycled = false;
      let result = await getData().batch({ seed: nextSeed(), exclude: seen, count: 10 });
      if (!result.items.length && seen.size && !result.failures) {
        // A limited offline collection can be shuffled again, but never start with the current unit.
        const unit = currentUnit?.();
        result = await getData().batch({ seed: nextSeed(), exclude: new Set(unit ? [unit] : []), count: 10 });
        recycled = true;
      }
      if (!result.items.length) {
        const message = result.failures ? 'Pilihan baru belum bisa dimuat. Periksa koneksi atau buka surah yang tersimpan di Pustaka.' : 'Belum ada pilihan ayat lain yang tersedia offline. Buka Pustaka, atau unduh lebih banyak surah dari pembaca lengkap.';
        if (!root.querySelector('.verse')) retry(message, { refresh: true });
        else notice(`${message} Bacaan saat ini tetap ditampilkan.`);
        return false;
      }
      if (recycled) seen.clear();
      remember(result.items);
      replace(result.items);
      root.scrollTo({ top: 0, behavior: 'instant' });
      if (!initial) {
        refreshed?.();
        notice(globalThis.navigator?.onLine === false ? 'Pilihan ayat offline diacak kembali.' : 'Pilihan ayat diperbarui.');
      }
      return true;
    } catch {
      if (!root.querySelector('.verse')) retry('Pilihan ayat belum bisa dimuat. Periksa koneksi atau buka Pustaka.', { refresh: true });
      else notice('Belum bisa mengganti ayat. Bacaan saat ini tetap ditampilkan.');
      return false;
    } finally { loading(false); }
  }
  button.addEventListener('click', () => refresh());
  function cancelPull() { pull = null; if (!busy) show(''); }
  root.addEventListener('touchstart', event => {
    cancelPull();
    if (busy || !getData() || !isActive() || root.scrollTop > 1 || event.touches.length !== 1) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest('button,a,input,select,textarea') || target.closest('.verse-text')?.scrollTop > 1) return;
    const touch = event.touches[0];
    pull = { x: touch.clientX, y: touch.clientY, distance: 0 };
  }, { passive: true });
  root.addEventListener('touchmove', event => {
    if (!pull) return;
    if (event.touches.length !== 1 || root.scrollTop > 1 || !isActive()) { cancelPull(); return; }
    const touch = event.touches[0], dy = touch.clientY - pull.y, dx = Math.abs(touch.clientX - pull.x);
    if (dy < 0 || (dx > 16 && dx > dy)) { cancelPull(); return; }
    if (dy < 8 || dy < dx * 1.3) return;
    if (event.cancelable) event.preventDefault();
    pull.distance = Math.min(dy / 2, 100);
    show(pull.distance >= 52 ? 'Lepas untuk ganti ayat' : 'Tarik ke bawah untuk ganti ayat');
  }, { passive: false });
  root.addEventListener('touchend', () => {
    const ready = pull && pull.distance >= 52;
    cancelPull();
    if (ready) refresh();
  }, { passive: true });
  root.addEventListener('touchcancel', cancelPull, { passive: true });
  let frame = 0;
  root.addEventListener('scroll', () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (isActive() && root.querySelector('.verse') && root.scrollTop >= root.scrollHeight - root.clientHeight * 4) more();
    });
  }, { passive: true });
  globalThis.addEventListener('online', () => {
    if (isActive() && root.querySelector('[data-feed-retry]')) {
      if (root.querySelector('.verse')) more({ force: true });
      else refresh({ initial: true });
    }
  });
  return {
    more, refresh, remember,
    ready() { button.disabled = busy || !getData(); },
    reset() { seen.clear(); },
    cancelPull,
    get busy() { return busy; },
  };
}
