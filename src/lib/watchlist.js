import fs from 'fs';
import path from 'path';

const WATCHLIST_PATH = path.join(process.cwd(), 'watchlist.json');

const DEFAULT_WATCHLIST = {
  watchlists: [
    { id: 'default', name: 'My Watchlist', stocks: [] }
  ],
  activeWatchlistId: 'default',
};

export function loadWatchlist() {
  if (!fs.existsSync(WATCHLIST_PATH)) {
    return { ...DEFAULT_WATCHLIST, watchlists: [{ ...DEFAULT_WATCHLIST.watchlists[0] }] };
  }
  try {
    const raw = fs.readFileSync(WATCHLIST_PATH, 'utf-8');
    const data = JSON.parse(raw);

    // Migrate old single-watchlist format
    if (data.stocks && !data.watchlists) {
      const migrated = {
        watchlists: [
          { id: 'default', name: 'My Watchlist', stocks: data.stocks }
        ],
        activeWatchlistId: 'default',
      };
      fs.writeFileSync(WATCHLIST_PATH, JSON.stringify(migrated, null, 2));
      return migrated;
    }

    return data;
  } catch {
    return { ...DEFAULT_WATCHLIST, watchlists: [{ ...DEFAULT_WATCHLIST.watchlists[0] }] };
  }
}

export function saveWatchlist(data) {
  fs.writeFileSync(WATCHLIST_PATH, JSON.stringify(data, null, 2));
}
