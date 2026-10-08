export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall back below
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * The share sheet where there is one (phones), the clipboard otherwise. `navigator.share` needs
 * HTTPS and a tap, which is why nudges are always sent by a person.
 */
export async function shareOrCopy(data: {
  title?: string;
  text?: string;
  url: string;
}): Promise<ShareOutcome> {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (navigator.share && coarse) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    }
  }
  const text = data.text ? `${data.text} ${data.url}` : data.url;
  return (await copyText(text)) ? 'copied' : 'failed';
}

export function tableUrl(slug: string): string {
  return `${location.origin}/t/${slug}`;
}
