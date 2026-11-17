import * as cheerio from 'cheerio';

/**
 * Rewrites a fetched page so every link, image, stylesheet, script and form
 * points back through /private/p/<token>. Node port of the PHP miniProxy.
 */

const SKIP = /^(data|blob|javascript|about|mailto|tel|sms|magnet|intent):/i;

export const QUERY_KEY = '__px_u';
export const FORM_FLAG = '__px_f';

export function proxyPrefix(token: string): string {
  return `/private/p/${token}?${QUERY_KEY}=`;
}

/** Absolute http(s) URL for `rel` relative to `base`, or null if it should be left alone. */
export function absolute(rel: string, base: string): string | null {
  const r = rel.trim();
  if (!r || r.startsWith('#') || SKIP.test(r)) return null;
  try {
    const u = new URL(r, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

function proxify(rel: string, base: string, prefix: string): string {
  if (rel.trim().startsWith('/private/p/')) return rel;
  const abs = absolute(rel, base);
  return abs ? prefix + encodeURIComponent(abs) : rel;
}

export function rewriteCss(css: string, base: string, prefix: string): string {
  return css
    .replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (m, q, u) => {
      const abs = absolute(u, base);
      return abs ? `url(${q}${prefix + encodeURIComponent(abs)}${q})` : m;
    })
    .replace(/@import\s+(['"])([^'"]+)\1/gi, (m, q, u) => {
      const abs = absolute(u, base);
      return abs ? `@import ${q}${prefix + encodeURIComponent(abs)}${q}` : m;
    });
}

function rewriteSrcset(srcset: string, base: string, prefix: string): string {
  return srcset
    .split(',')
    .map(part => {
      const bits = part.trim().split(/\s+/);
      if (!bits[0]) return part;
      bits[0] = proxify(bits[0], base, prefix);
      return bits.join(' ');
    })
    .join(', ');
}

/** Small script put at the top of every page so links made by JavaScript also go through the proxy. */
function clientScript(target: string, prefix: string): string {
  const json = (v: string) => JSON.stringify(v).replace(/</g, '\\u003c');
  return `(function(){
var T=${json(target)},P=${json(prefix)},H=location.protocol+'//'+location.host,K=${json(QUERY_KEY)},F=${json(FORM_FLAG)};
function px(u){
  if(u==null)return u;
  var s=String(u).trim();
  if(!s||s.charAt(0)==='#'||/^(data|blob|javascript|about|mailto|tel|sms):/i.test(s))return u;
  if(s.indexOf('/private/p/')===0||s.indexOf(H+'/private/p/')===0)return u;
  var a;try{a=new URL(s,T);}catch(e){return u;}
  if(a.protocol!=='http:'&&a.protocol!=='https:')return u;
  return P+encodeURIComponent(a.href);
}
// Pages here cannot use real cookies or storage (that is the safety lock), so give them throwaway in-memory versions instead of errors.
try{var jar={};Object.defineProperty(document,'cookie',{configurable:true,get:function(){return Object.keys(jar).map(function(k){return k+'='+jar[k];}).join('; ');},set:function(v){var p=String(v).split(';')[0],i=p.indexOf('=');if(i>0)jar[p.slice(0,i).trim()]=p.slice(i+1).trim();}});}catch(e){}
function mem(){var d={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null;},setItem:function(k,v){d[k]=String(v);},removeItem:function(k){delete d[k];},clear:function(){d={};},key:function(i){return Object.keys(d)[i]||null;},get length(){return Object.keys(d).length;}};}
['localStorage','sessionStorage'].forEach(function(n){try{window[n].length;}catch(e){try{Object.defineProperty(window,n,{configurable:true,value:mem()});}catch(e2){}}});
if(window.fetch){var of=window.fetch;window.fetch=function(i,o){try{if(typeof i==='string'||i instanceof URL)i=px(String(i));else if(i&&i.url)i=new Request(px(i.url),i);}catch(e){}return of.call(this,i,o);};}
if(window.XMLHttpRequest){var oo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(){var a=[].slice.call(arguments);if(a[1]!=null)a[1]=px(String(a[1]));return oo.apply(this,a);};}
var ow=window.open;window.open=function(u){var a=[].slice.call(arguments);if(u)a[0]=px(String(u));return ow.apply(window,a);};
if(navigator.sendBeacon){var ob=navigator.sendBeacon.bind(navigator);navigator.sendBeacon=function(u,d){return ob(px(String(u)),d);};}
['pushState','replaceState'].forEach(function(n){var o=history[n];history[n]=function(s,t,u){try{return u==null?o.call(history,s,t):o.call(history,s,t,px(String(u)));}catch(e){}};});
document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a)return;var h=a.getAttribute('href'),n=px(h);if(n!==h)a.setAttribute('href',n);},true);
document.addEventListener('submit',function(e){var f=e.target;if(!f||!f.getAttribute)return;var act=f.getAttribute('action')||'';if(act.indexOf('/private/p/')===0)return;
  var abs;try{abs=new URL(act||T,T).href;}catch(x){return;}
  if((f.getAttribute('method')||'get').toLowerCase()==='get'){var base=P.split('?')[0];f.setAttribute('action',base);
    [[K,abs],[F,'1']].forEach(function(p){var el=document.createElement('input');el.type='hidden';el.name=p[0];el.value=p[1];f.appendChild(el);});}
  else f.setAttribute('action',P+encodeURIComponent(abs));},true);
})();`;
}

export function rewriteHtml(html: string, pageUrl: string, token: string): string {
  const prefix = proxyPrefix(token);
  const $ = cheerio.load(html);

  // A <base> tag changes what relative links mean; honour it, then remove it.
  let base = pageUrl;
  const baseHref = $('base[href]').first().attr('href');
  if (baseHref) base = absolute(baseHref, pageUrl) ?? pageUrl;
  $('base').remove();

  // The page is re-encoded as UTF-8; drop the site's own security policy and
  // integrity checks (they would block the rewritten copy).
  $('meta[charset]').remove();
  $('meta[http-equiv]').each((_, el) => {
    const v = ($(el).attr('http-equiv') || '').toLowerCase();
    if (v === 'content-security-policy' || v === 'content-type') $(el).remove();
  });
  $('[integrity]').removeAttr('integrity');

  // Forms: GET forms carry the real address in hidden fields (the browser
  // replaces the query string on submit); other forms carry it in the action.
  $('form').each((_, el) => {
    const f = $(el);
    const abs = absolute(f.attr('action') || pageUrl, base) ?? pageUrl;
    const method = (f.attr('method') || 'get').toLowerCase();
    if (method === 'get') {
      f.attr('action', `/private/p/${token}`);
      f.append($('<input type="hidden">').attr('name', QUERY_KEY).attr('value', abs));
      f.append($('<input type="hidden">').attr('name', FORM_FLAG).attr('value', '1'));
    } else {
      f.attr('action', prefix + encodeURIComponent(abs));
    }
  });
  $('[formaction]').each((_, el) => {
    const v = $(el).attr('formaction');
    if (v) $(el).attr('formaction', proxify(v, base, prefix));
  });

  for (const attr of ['href', 'src', 'poster', 'data', 'background', 'xlink:href']) {
    $(`[${attr.replace(':', '\\:')}]`).each((_, el) => {
      if (el.type === 'tag' && el.name === 'form') return;
      const v = $(el).attr(attr);
      if (v != null) $(el).attr(attr, proxify(v, base, prefix));
    });
  }
  $('[srcset]').each((_, el) => {
    const v = $(el).attr('srcset');
    if (v) $(el).attr('srcset', rewriteSrcset(v, base, prefix));
  });
  $('[style]').each((_, el) => {
    const v = $(el).attr('style');
    if (v) $(el).attr('style', rewriteCss(v, base, prefix));
  });
  $('style').each((_, el) => {
    $(el).text(rewriteCss($(el).text(), base, prefix));
  });
  $('meta[http-equiv]').each((_, el) => {
    if (($(el).attr('http-equiv') || '').toLowerCase() !== 'refresh') return;
    const c = $(el).attr('content') || '';
    const m = /^(\s*\d*\s*;\s*url\s*=\s*)(['"]?)(.+?)\2\s*$/i.exec(c);
    if (m) $(el).attr('content', m[1] + proxify(m[3], base, prefix));
  });

  const head = $('head');
  const inject = `<meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><script>${clientScript(base, prefix)}</script>`;
  if (head.length) head.prepend(inject);
  else $.root().children().first().before(inject);

  return $.html();
}
