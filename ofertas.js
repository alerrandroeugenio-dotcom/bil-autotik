import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

export const CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
const COLUMNS = 'id,v,name,url,price,call,active,created_at';
let clientPromise;

async function client() {
  if (!CONFIGURED) throw Error('As ofertas salvas ainda não foram configuradas.');
  // Carregamento sob demanda: falha no serviço não impede a prévia ou o vídeo.
  if (!clientPromise) {
    clientPromise = import('https://esm.sh/@supabase/supabase-js@2.57.4')
      .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { detectSessionInUrl: false }
      }))
      .catch(() => {
        clientPromise = null;
        throw Error('Não foi possível conectar. Confira sua internet e tente novamente.');
      });
  }
  return clientPromise;
}

export function validUrl(u) {
  try {
    const a = new URL(u);
    return a.protocol === 'https:' && !a.username && !a.password &&
      a.hostname.includes('.') && u.length <= 3000;
  } catch { return false; }
}

export function validateOffer(d) {
  if (!d || d.v !== 1 || typeof d.url !== 'string' || !validUrl(d.url) ||
      typeof d.name !== 'string' || !d.name.trim() || d.name.length > 120 ||
      typeof d.price !== 'string' || d.price.length > 28 ||
      typeof d.call !== 'string' || d.call.length > 100) {
    throw Error('Confira o nome, o link HTTPS e os limites dos campos da oferta.');
  }
  return { v: 1, url: d.url, name: d.name, price: d.price, call: d.call };
}

export function publicLink(id, base = location.href) {
  const link = new URL(base);
  link.search = '';
  link.hash = '';
  link.searchParams.set('oferta', id);
  return link.href;
}

export async function currentUser() {
  const db = await client();
  const { data, error } = await db.auth.getUser();
  // Sem sessão é um estado normal, não uma falha de rede.
  if (error?.name === 'AuthSessionMissingError') return null;
  if (error) throw Error('Sua sessão expirou ou não pôde ser verificada. Entre novamente.');
  return data.user;
}

export async function signIn(email, password) {
  const db = await client();
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw Error('Não foi possível entrar. Confira e-mail, senha e conexão.');
  return data.user;
}

export async function signOut() {
  const db = await client();
  const { error } = await db.auth.signOut({ scope: 'local' });
  if (error) throw Error('Não foi possível sair. Tente novamente.');
}

export async function saveOffer(id, offer) {
  const payload = validateOffer(offer);
  const user = await currentUser();
  if (!user) throw Error('Entre na sua conta para salvar a oferta.');
  const db = await client();
  // Mesmo UUID em novas tentativas: uma resposta perdida não duplica a oferta.
  const { data, error } = await db.from('ofertas')
    .upsert({ id, owner_id: user.id, ...payload, active: true }, { onConflict: 'id' })
    .select(COLUMNS).single();
  if (error) throw Error('Não foi possível salvar. Confira a conexão e a autorização da conta.');
  return data;
}

export async function loadOffer(id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw Error('O identificador desta oferta é inválido.');
  }
  const db = await client();
  const { data, error } = await db.from('ofertas').select(COLUMNS)
    .eq('id', id).eq('active', true).maybeSingle();
  if (error) throw Error('Não foi possível carregar. Confira a conexão e tente novamente.');
  if (!data) throw Error('Esta oferta não existe ou foi desativada.');
  return validateOffer(data);
}

export async function listOffers() {
  const user = await currentUser();
  if (!user) throw Error('Entre para ver suas ofertas.');
  const db = await client();
  const { data, error } = await db.from('ofertas').select(COLUMNS)
    .eq('owner_id', user.id).order('created_at', { ascending: false });
  if (error) throw Error('Não foi possível carregar suas ofertas. Tente atualizar a lista.');
  return data;
}

export async function setActive(id, active) {
  const user = await currentUser();
  if (!user) throw Error('Entre para alterar a oferta.');
  const db = await client();
  const { data, error } = await db.from('ofertas').update({ active })
    .eq('id', id).eq('owner_id', user.id).select('id').single();
  if (error || !data) throw Error('Não foi possível alterar a oferta. Confira sua sessão e tente novamente.');
}
