export function formatMoney(value) {
  if (value == null) return '—';
  return `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function formatMoneyPrecise(value) {
  if (value == null) return '—';
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPct(value, decimals = 2) {
  if (value == null) return '—';
  return `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(decimals)}%`;
}

export function formatLargeNumber(value) {
  if (value == null) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toLocaleString()}`;
}

export function formatShareCount(value) {
  if (value == null) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(0)}M`;
  return value.toLocaleString();
}

export function formatNumber(value, decimals = 2) {
  if (value == null) return '—';
  return Number(value).toFixed(decimals);
}
