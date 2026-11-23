export interface WikiArticle {
  title: string;
  html: string;
  links: string[];
}

export type ArticleFetcher = (title: string) => Promise<WikiArticle>;

export const CURATED_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['Banana', 'Moon'],
  ['Pizza', 'World War II'],
  ['Coffee', 'Ancient Rome'],
  ['Lego', 'Black hole'],
  ['Penguin', 'Eiffel Tower'],
  ['Tetris', 'Albert Einstein'],
  ['Chocolate', 'Solar System'],
  ['Pirate', 'Olympics'],
  ['Sushi', 'Shakespeare'],
  ['Dinosaur', 'Internet'],
  ['Bicycle', 'Mount Everest'],
  ['Vampire', 'Mars'],
  ['Guitar', 'Statue of Liberty'],
  ['Volcano', 'Monopoly (game)'],
  ['Chess', 'Antarctica'],
  ['Pineapple', 'Isaac Newton'],
  ['Submarine', 'Cleopatra'],
  ['Pancake', 'DNA'],
  ['Kangaroo', 'Apollo 11'],
  ['Skateboard', 'French Revolution'],
  ['Potato', 'Milky Way'],
  ['Taco', 'Leonardo da Vinci'],
  ['Origami', 'Titanic'],
  ['Cactus', 'Jazz'],
];

const IGNORED_NAMESPACES = new Set([
  'file',
  'image',
  'media',
  'special',
  'talk',
  'user',
  'user_talk',
  'wikipedia',
  'wikipedia_talk',
  'project',
  'project_talk',
  'portal',
  'portal_talk',
  'template',
  'template_talk',
  'help',
  'help_talk',
  'category',
  'category_talk',
  'module',
  'module_talk',
  'mediawiki',
  'mediawiki_talk',
  'draft',
  'draft_talk',
  'timedtext',
  'book',
  'mos',
]);

const CACHE_LIMIT = 400;
const articleCache = new Map<string, WikiArticle>();

export function normalizeTitle(title: string): string {
  return title.trim().replace(/_/g, ' ').replace(/\s+/g, ' ').toLowerCase();
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function extractWikiTarget(href: string): string | null {
  if (!href.startsWith('/wiki/')) return null;
  const withoutPrefix = href.slice('/wiki/'.length);
  const cleanSlug = withoutPrefix.split('#')[0]?.split('?')[0] ?? '';
  if (!cleanSlug) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(cleanSlug);
  } catch {
    return null;
  }

  const colonIdx = decoded.indexOf(':');
  if (colonIdx > 0) {
    const ns = decoded.slice(0, colonIdx).replace(/\s+/g, '_').toLowerCase();
    if (IGNORED_NAMESPACES.has(ns)) {
      return null;
    }
  }

  const title = decoded.replace(/_/g, ' ').trim();
  return title || null;
}

const DROPPED_SELECTOR =
  'img, picture, svg, figure, figcaption, table, caption, .thumb, .thumbcaption, .gallery, .gallerytext';

export function sanitizeWikiHtml(rawHtml: string): { html: string; links: string[] } {
  const linkSet = new Set<string>();

  const stripped = new HTMLRewriter()
    .on(DROPPED_SELECTOR, {
      element(el) {
        el.remove();
      },
    })
    .transform(rawHtml);

  let cleaned = stripped
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<(link|meta|iframe|object|embed)\b[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  cleaned = cleaned.replace(
    /<a\b([^>]*?)href\s*=\s*(?:"([^"]*)"|'([^']*)')([^>]*)>([\s\S]*?)<\/a>/gi,
    (_match, _before, dqHref, sqHref, _after, inner) => {
      const href = dqHref ?? sqHref ?? '';
      const target = extractWikiTarget(href);
      if (!target) {
        return `<span class="wr-dead-link">${inner}</span>`;
      }
      linkSet.add(target);
      return `<a href="#" class="wr-link" data-wiki-title="${escapeAttr(target)}">${inner}</a>`;
    }
  );

  return {
    html: cleaned,
    links: Array.from(linkSet),
  };
}

function cacheSet(key: string, article: WikiArticle): void {
  if (!articleCache.has(key) && articleCache.size >= CACHE_LIMIT) {
    const oldest = articleCache.keys().next().value;
    if (oldest !== undefined) articleCache.delete(oldest);
  }
  articleCache.set(key, article);
}

function setCachedArticle(requestedTitle: string, article: WikiArticle): void {
  cacheSet(normalizeTitle(requestedTitle), article);
  cacheSet(normalizeTitle(article.title), article);
}

export async function fetchWikiArticle(
  title: string,
  fetchImpl: typeof fetch = fetch
): Promise<WikiArticle> {
  const cached = articleCache.get(normalizeTitle(title));
  if (cached) return cached;

  const url =
    'https://en.wikipedia.org/w/api.php?action=parse&format=json&formatversion=2' +
    `&redirects=1&disableeditsection=1&disabletoc=1&prop=text&page=${encodeURIComponent(title)}`;

  const response = await fetchImpl(url, {
    headers: {
      'User-Agent': 'LekPartyGame/1.0 (https://github.com/party-game)',
    },
  });

  if (!response.ok) {
    throw new Error(`Wikipedia returned ${response.status}`);
  }

  const data = (await response.json()) as {
    error?: { info?: string };
    parse?: { title?: string; text?: string };
  };

  if (data.error || !data.parse?.title || typeof data.parse.text !== 'string') {
    throw new Error(data.error?.info ?? 'Article not found');
  }

  const { html, links } = sanitizeWikiHtml(data.parse.text);
  const article: WikiArticle = {
    title: data.parse.title,
    html,
    links,
  };

  setCachedArticle(title, article);
  return article;
}
