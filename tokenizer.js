const WHITELIST = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'li', 'td', 'th', 'figcaption', 'blockquote', 'label', 'button', 'dt', 'dd',
  'a', 'strong', 'em'
]);

const SKIP_TAGS = new Set([
  'script', 'style', 'svg', 'noscript', 'pre', 'code', 'template', 'head'
]);

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
  'meta', 'param', 'source', 'track', 'wbr'
]);

function isNameChar(ch) {
  return /[A-Za-z0-9:-]/.test(ch);
}

module.exports = function tokenize(html) {
  const results = [];
  const stack = [];
  const skipStack = [];
  let skipDepth = 0;
  let id = 0;

  let i = 0;
  while (i < html.length) {
    const ch = html[i];
    if (ch !== '<') {
      i += 1;
      continue;
    }

    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      if (end === -1) break;
      i = end + 3;
      continue;
    }

    const next = html[i + 1];
    if (next === '!' || next === '?') {
      const end = html.indexOf('>', i + 2);
      if (end === -1) break;
      i = end + 1;
      continue;
    }

    const isClosing = next === '/';
    let j = isClosing ? i + 2 : i + 1;

    if (!isClosing && !/[A-Za-z]/.test(html[j] || '')) {
      i += 1;
      continue;
    }

    let nameStart = j;
    while (j < html.length && isNameChar(html[j])) j += 1;
    if (j === nameStart) {
      i += 1;
      continue;
    }

    const tag = html.slice(nameStart, j).toLowerCase();

    let quote = null;
    let k = j;
    while (k < html.length) {
      const c = html[k];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '>') {
        break;
      }
      k += 1;
    }

    if (k >= html.length) break;

    let selfClosing = false;
    if (!isClosing) {
      if (VOID_TAGS.has(tag)) {
        selfClosing = true;
      } else {
        let m = k - 1;
        while (m > j && /\s/.test(html[m])) m -= 1;
        if (html[m] === '/') selfClosing = true;
      }
    }

    if (isClosing) {
      if (skipDepth > 0 && skipStack[skipStack.length - 1] === tag) {
        skipDepth -= 1;
        skipStack.pop();
      }

      if (skipDepth === 0) {
        const top = stack[stack.length - 1];
        if (top && top.tag === tag) {
          stack.pop();
          const innerHTMLEnd = i;
          const innerHTML = html.slice(top.innerHTMLStart, innerHTMLEnd);
          if (innerHTML.trim()) {
            results.push({
              id: top.id,
              tag: top.tag,
              innerHTMLStart: top.innerHTMLStart,
              innerHTMLEnd,
              innerHTML
            });
          }
        }
      }

      i = k + 1;
      continue;
    }

    if (skipDepth === 0 && tag === 'p') {
      const top = stack[stack.length - 1];
      if (top && top.tag === 'p') {
        stack.pop();
        const innerHTMLEnd = i;
        const innerHTML = html.slice(top.innerHTMLStart, innerHTMLEnd);
        if (innerHTML.trim()) {
          results.push({
            id: top.id,
            tag: top.tag,
            innerHTMLStart: top.innerHTMLStart,
            innerHTMLEnd,
            innerHTML
          });
        }
      }
    }

    if (SKIP_TAGS.has(tag) && !selfClosing) {
      skipDepth += 1;
      skipStack.push(tag);
    }

    if (skipDepth === 0 && WHITELIST.has(tag) && !selfClosing && stack.length === 0) {
      stack.push({
        id: id++,
        tag,
        innerHTMLStart: k + 1
      });
    }

    i = k + 1;
  }

  return results;
};
