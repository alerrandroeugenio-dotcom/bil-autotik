import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import { webcrypto } from 'node:crypto';

const root = new URL('../', import.meta.url).pathname;
const html = await fs.readFile(root + 'index.html', 'utf8');
const service = await fs.readFile(root + 'ofertas.js', 'utf8');
const script = html.split('<script type="module">')[1].split('</script>')[0];
const rows = new Map();
let writes = 0;
let failNext = false;
let loseResponse = false;

class Element {
  constructor() { this.hidden = false; this.value = ''; this.textContent = ''; this.children = []; this.style = {}; this.events = {}; }
  addEventListener(name, fn) { (this.events[name] ||= []).push(fn); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  removeAttribute(name) { delete this[name]; }
  focus() {}
  select() {}
  pause() {}
  getContext() {
    return new Proxy({}, { get: (_, key) => key === 'measureText' ? t => ({ width: t.length * 12 }) :
      key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {} });
  }
}

async function app({ configured = true, url = 'https://bil.example/', loggedIn = false } = {}) {
  const elements = {};
  for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    const el = new Element();
    el.hidden = /\bhidden\b/.test(match[0]);
    el.value = match[0].match(/\bvalue="([^"]*)"/)?.[1] || '';
    elements[match[1]] = el;
  }
  elements.channel.value = 'instagram';
  const state = { user: loggedIn ? { id: 'owner-a', email: 'owner@example.com' } : null, clipboard: '' };
  const db = {
    auth: {
      getUser: async () => state.user ? { data: { user: state.user } } :
        { data: { user: null }, error: { name: 'AuthSessionMissingError' } },
      signInWithPassword: async ({ email, password }) => {
        if (password !== 'correct') return { error: {} };
        state.user = { id: 'owner-a', email };
        return { data: { user: state.user } };
      },
      signOut: async () => { state.user = null; return {}; }
    },
    from: () => {
      let payload, action = 'select';
      const filters = [];
      const q = {
        select() { return q; },
        upsert(p) { payload = p; action = 'upsert'; return q; },
        update(p) { payload = p; action = 'update'; return q; },
        eq(k, v) { filters.push([k, v]); return q; },
        order() { return q; },
        single() { return execute(true); },
        maybeSingle() { return execute(true); },
        then(resolve, reject) { return execute(false).then(resolve, reject); }
      };
      async function execute(single) {
        await new Promise(r => setImmediate(r));
        if (failNext) { failNext = false; return { error: {} }; }
        if (action === 'upsert') {
          if (!state.user || payload.owner_id !== state.user.id) return { error: {} };
          const old = rows.get(payload.id);
          if (old && old.owner_id !== state.user.id) return { error: {} };
          const row = { created_at: old?.created_at || new Date().toISOString(), ...payload };
          rows.set(payload.id, row); writes++;
          if (loseResponse) { loseResponse = false; return { error: {} }; }
          return { data: row };
        }
        const matching = [...rows.values()].filter(row => (row.active || row.owner_id === state.user?.id) &&
          filters.every(([k, v]) => row[k] === v));
        if (action === 'update') {
          const row = matching.find(row => row.owner_id === state.user?.id);
          if (!row) return { error: {} };
          Object.assign(row, payload);
          return { data: { id: row.id } };
        }
        return { data: single ? matching[0] || null : matching };
      }
      return q;
    }
  };
  const context = vm.createContext({
    URL, URLSearchParams, crypto: webcrypto, console, setTimeout, clearTimeout, setInterval, clearInterval,
    performance, Blob, File,
    location: new URL(url),
    navigator: { clipboard: { writeText: async t => { state.clipboard = t; } } },
    document: {
      getElementById: id => elements[id],
      createElement: () => new Element(),
      querySelectorAll: () => Object.values(elements['offers-list'].children).flatMap(card => card.children.flatMap(
        child => child.children?.length ? child.children : [child])),
      addEventListener() {}, removeEventListener() {}
    },
    window: { addEventListener() {} }
  });
  const sdk = new vm.SyntheticModule(['createClient'], function() { this.setExport('createClient', () => db); }, { context });
  await sdk.link(() => {}); await sdk.evaluate();
  const config = new vm.SourceTextModule(`export const SUPABASE_URL = '${configured ? 'https://test.supabase.co' : ''}'; export const SUPABASE_PUBLISHABLE_KEY = '${configured ? 'public-test-key' : ''}';`, { context });
  await config.link(() => {}); await config.evaluate();
  const offers = new vm.SourceTextModule(service, { context, importModuleDynamically: async () => sdk });
  await offers.link(() => config); await offers.evaluate();
  const main = new vm.SourceTextModule(script, { context });
  await main.link(() => offers); await main.evaluate();
  await settle();
  return { elements, state, offers: offers.namespace, context,
    fill(d = {}) {
      const values = { affiliate: 'https://loja.example/produto?afiliado=bil', name: 'Produto de teste', price: 'R$ 199,90', call: 'Confira!', ...d };
      for (const [id, value] of Object.entries(values)) { elements[id].value = value; for (const fn of elements[id].events.input || []) fn(); }
    },
    async click(id) { await elements[id].onclick(); await settle(); }
  };
}
async function settle() { for (let i = 0; i < 12; i++) await new Promise(r => setImmediate(r)); }
let checks = 0;
function check(label, fn) { fn(); checks++; console.log('PASS', label); }

const legacy = await app({ configured: false });
legacy.fill();
await legacy.click('offer-generate');
const legacyUrl = legacy.elements['offer-url'].value;
check('sem configuração mantém link completo e avisa ausência de histórico', () => {
  assert.match(legacyUrl, /#oferta=/); assert.match(legacy.elements['offer-status'].textContent, /não fica salva/);
});
const legacyBuyer = await app({ configured: false, url: legacyUrl });
check('link legado abre em contexto separado sem sessão', () => {
  assert.equal(legacyBuyer.elements.buyer.hidden, false); assert.equal(legacyBuyer.elements['offer-name'].textContent, 'Produto de teste');
});
const invalid = await app({ url: 'https://bil.example/?oferta=invalid' });
check('identificador inválido não mostra botão de compra', () => {
  assert.equal(invalid.elements['bad-offer'].hidden, false); assert.equal(invalid.elements.buyer.hidden, true);
});
const editor = await app();
editor.fill();
await editor.click('offer-generate');
check('não cria link salvo sem login', () => {
  assert.equal(rows.size, 0); assert.match(editor.elements['offer-status'].textContent, /Entre/); assert.equal(editor.elements['offer-result'].hidden, true);
});
editor.elements['login-email'].value = 'owner@example.com'; editor.elements['login-password'].value = 'correct';
await editor.elements['login-form'].onsubmit({ preventDefault() {} });
await editor.click('offer-generate');
const link = editor.elements['offer-url'].value;
const id = new URL(link).searchParams.get('oferta');
check('login e salvamento retornam link estável confirmado', () => {
  assert.equal(rows.size, 1); assert.equal(editor.elements['offer-result'].hidden, false); assert.equal(rows.get(id).name, 'Produto de teste');
});
await editor.click('offer-generate');
check('repetir botão sem alterações não duplica registro', () => { assert.equal(rows.size, 1); assert.equal(writes, 1); });
editor.elements.channel.value = 'whatsapp';
await editor.click('copy');
check('legenda WhatsApp contém URL resolvida, sem Promise', () => {
  assert.ok(editor.state.clipboard.includes(link)); assert.ok(!editor.state.clipboard.includes('[object Promise]'));
});
const buyer = await app({ url: link });
check('comprador sem login recupera oferta pelo identificador', () => {
  assert.equal(buyer.elements.buyer.hidden, false); assert.equal(buyer.elements.buy.href, rows.get(id).url);
});
const reopened = await app({ loggedIn: true });
check('nova sessão recupera oferta no histórico', () => { assert.equal(reopened.elements['offers-list'].children.length, 1); });
const card = reopened.elements['offers-list'].children[0];
card.children[3].children[0].onclick();
reopened.fill({ price: 'R$ 149,90', affiliate: 'https://loja.example/novo?ref=bil' });
await reopened.click('offer-generate');
check('editar mantém UUID e atualiza preço e destino', () => {
  assert.equal(reopened.elements['offer-url'].value, link); assert.equal(rows.size, 1); assert.equal(rows.get(id).price, 'R$ 149,90');
});
const updatedBuyer = await app({ url: link });
check('mesmo link público lê os dados novos', () => {
  assert.equal(updatedBuyer.elements['offer-price'].textContent, 'R$ 149,90'); assert.match(updatedBuyer.elements.buy.href, /novo/);
});
await reopened.elements['offers-list'].children[0].children[3].children[1].onclick(); await settle();
const inactiveBuyer = await app({ url: link });
check('desativar remove oferta do comprador e mantém histórico', () => {
  assert.equal(inactiveBuyer.elements['bad-offer'].hidden, false); assert.equal(rows.get(id).active, false); assert.equal(reopened.elements['offers-list'].children.length, 1);
});
await reopened.elements['offers-list'].children[0].children[3].children[1].onclick(); await settle();
const activeBuyer = await app({ url: link });
check('reativar recupera o mesmo link', () => { assert.equal(activeBuyer.elements.buyer.hidden, false); });
await reopened.click('new-offer'); reopened.fill({ name: 'Segunda oferta' });
failNext = true; await reopened.click('offer-generate');
check('falha no salvamento não apresenta sucesso nem link novo', () => {
  assert.equal(reopened.elements['offer-result'].hidden, true); assert.equal(rows.size, 1); assert.match(reopened.elements['offer-status'].textContent, /Não foi possível/);
});
loseResponse = true; await reopened.click('offer-generate');
await reopened.click('offer-generate');
check('resposta perdida e nova tentativa reaproveitam UUID', () => { assert.equal(rows.size, 2); });
await reopened.click('new-offer'); reopened.fill({ name: 'Oferta concorrente' });
await Promise.all([reopened.elements['offer-generate'].onclick(), reopened.elements['copy'].onclick()]); await settle();
check('operações concorrentes compartilham um salvamento', () => { assert.equal(rows.size, 3); });
await reopened.click('logout');
check('sair limpa histórico e estado da oferta selecionada', () => {
  assert.equal(reopened.elements['offers-list'].children.length, 0); assert.equal(reopened.elements['offer-result'].hidden, true); assert.equal(reopened.elements['login-form'].hidden, false);
});
check('validação rejeita JavaScript, credenciais e textos fora do limite', () => {
  for (const url of ['javascript:alert(1)', 'http://loja.example', 'https://u:p@loja.example']) {
    assert.equal(editor.offers.validUrl(url), false);
  }
  assert.throws(() => editor.offers.validateOffer({v:1,url:'https://loja.example',name:'a'.repeat(121),price:'',call:''}));
});
check('link salvo remove fragmento legado e parâmetros anteriores', () => {
  assert.equal(editor.offers.publicLink(id, legacyUrl + '&outro=1'), link);
});
console.log(`${checks} checks passed. SDK/database responses simulated; no real Supabase connection or browser engine used.`);
