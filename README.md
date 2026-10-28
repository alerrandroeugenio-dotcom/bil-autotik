# Bil Autotik

Gerador de vídeo vertical no navegador e páginas públicas de ofertas de afiliado.
HTML e JavaScript sem build; pode continuar na hospedagem estática atual.

## Versão 2.2

- Mantém prévia em canvas, vídeo MP4/H.264 de 8 segundos sem áudio, download e compartilhamento.
- Mantém os links antigos com `#oferta=`.
- Com Supabase configurado: login, ofertas persistidas, lista de ofertas próprias,
  edição mantendo o link `?oferta=UUID`, desativação e reativação.
- Sem configuração: vídeo e links completos antigos continuam disponíveis;
  a interface avisa que não há histórico. Falhas no banco não geram um link falso de sucesso.
- Somente os textos e o destino são persistidos. Fotos e vídeos continuam locais.

## Ativar ofertas salvas

1. Crie um projeto Supabase, ou use um projeto existente dedicado ao aplicativo.
2. Execute `schema.sql` no SQL Editor do projeto.
3. Em Authentication > Users, crie sua conta com e-mail e senha e confirme o e-mail.
   Desative novos cadastros públicos nas configurações de Authentication.
4. Copie o UUID da conta criada e execute no SQL Editor:

   ```sql
   insert into public.bil_admins (user_id)
   values ('COLE-O-UUID-DA-SUA-CONTA')
   on conflict do nothing;
   ```

5. Em `config.js`, preencha a Project URL e a **publishable key** do projeto:

   ```js
   export const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
   export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_...';
   ```

   São dados públicos. Nunca use `service_role`, `sb_secret_...`, senha ou URL
   de conexão do Postgres. As permissões reais são aplicadas no banco (RLS).
6. Publique os arquivos na hospedagem atual e entre pela tela do Bil.

Não há signup na interface. Mesmo outra conta autenticada não pode publicar
sem estar na lista `bil_admins`. Visitantes leem ofertas ativas sem login.
Os dados da oferta publicada são públicos; não use a tabela para dados privados.
Uma oferta desativada deixa de ser consultável por visitantes, mas isso não apaga
capturas ou cópias que alguém já tenha feito.

## Arquivos

| Arquivo | Função |
| --- | --- |
| `index.html` | Editor, vídeo, login, lista e página pública |
| `ofertas.js` | Validação, sessão e operações no Supabase |
| `config.js` | Endereço e chave pública do projeto |
| `schema.sql` | Tabelas, índice, concessões e políticas RLS |

O SDK Supabase é carregado sob demanda, pelo esm.sh, na versão fixa 2.57.4.
A criação do vídeo não usa esse serviço. Módulos JavaScript exigem servir os
arquivos por HTTP/HTTPS; abrir `index.html` por `file://` não é suportado.
Não é necessário configurar rotas ou rewrites: os novos links usam a query da página.

## Verificar antes de divulgar

Verificação automatizada de lógica (Node 20+):

```sh
node --experimental-vm-modules tests/smoke.mjs
```

Os testes executam o script real da página e `ofertas.js`, com DOM e respostas do
SDK simulados. Cobrem links antigos, login, salvar, reabrir, editar, desativar,
reativar, falha de gravação, resposta perdida e operações concorrentes. Não validam
um navegador real, a gravação MP4, o carregamento do CDN nem as políticas do banco.
Essas verificações exigem o serviço configurado e o teste no navegador abaixo.

1. Sem `config.js` preenchido: criar um link completo e abri-lo em outro navegador.
2. Com o serviço configurado: entrar, salvar uma oferta e copiar o link.
3. Recarregar, entrar novamente se necessário e recuperar a oferta na lista.
4. Abrir o link numa janela anônima: o comprador deve ver o botão da loja sem login.
5. Editar preço e destino, salvar e recarregar o mesmo link na janela anônima.
6. Desativar: a janela anônima deve mostrar oferta indisponível. Reativar e repetir.
7. Conferir que usuário sem autorização não publica e que uma conta não altera
   ofertas de outra, fazendo requisições diretas à API em um projeto de teste.
8. Escolher foto, gerar vídeo e testar download/compartilhamento no celular.

Para teste local, execute `python -m http.server 8000` nesta pasta e abra
`http://localhost:8000`. O suporte a gravação MP4 depende do navegador.

## Limites desta etapa

Não inclui publicação automática nas redes, catálogo de lojas, importação de
produtos, acompanhamento de comissão, upload de mídia ou prévias sociais por oferta.
"Minhas ofertas" guarda os registros atuais; não é um histórico de versões.
Links antigos `#oferta=` são snapshots independentes e não podem ser desativados
pelo banco. Para atualizar ou desativar uma oferta, divulgue o novo link salvo.
