# Fotos no ImageKit

As fotos de produto, categorias, banners e do carrossel da home ficam no
ImageKit. O Firestore guarda só a URL (antes era a foto inteira em base64,
~90 KB por produto em toda leitura — o catálogo chegava a 18,5 MB).

## Como funciona

1. No painel admin, a pessoa escolhe a foto como sempre.
2. O navegador pede uma assinatura a `POST /api/imagekit-auth` (só admin).
3. A foto vai direto do navegador para o ImageKit, que devolve a URL.
4. O produto é salvo com essa URL.
5. A loja pede cada foto no tamanho da tela (`services/imagens.js`):
   `...jpg?tr=w-480,c-at_max` — o ImageKit reduz e converte para WebP/AVIF.

Sem as variáveis de ambiente, o painel continua salvando em base64 (modo
antigo) — nada trava. A foto de perfil do cliente continua em base64 de
propósito (cliente não tem acesso à assinatura).

## Configurar (uma vez)

1. Criar a conta no ImageKit.
2. Em **Developer options → API keys**, copiar Public key, Private key e
   URL-endpoint.
3. Na Vercel (**Settings → Environment Variables**), criar:
   `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT`.
4. Fazer um novo deploy (variável nova só vale depois do deploy).
5. Testar: cadastrar/editar um produto com foto e conferir que a imagem
   salva começa com `https://ik.imagekit.io/`.

## Migrar as fotos que já estão no banco

Na raiz do projeto, com um `.env` contendo `FIREBASE_SERVICE_ACCOUNT`,
`IMAGEKIT_PRIVATE_KEY` e `IMAGEKIT_URL_ENDPOINT`:

```bash
npm install
node --env-file=.env scripts/migrar-imagens-imagekit.js
node --env-file=.env scripts/migrar-imagens-imagekit.js --executar
```

O primeiro comando só simula. O segundo envia e grava, salvando antes o
valor original de cada campo em `backup-imagens/` (fora do git). Pode
rodar de novo: o que já é URL é ignorado.

## Limites do plano grátis

Espaço: ~14 MB hoje (de 3 GB). Tráfego: ~1 MB por visita nova — 20 GB/mês
dão ~20 mil visitas. Acompanhar o consumo no painel do ImageKit.
Fotos trocadas ganham nome novo (`useUniqueFileName`), então não é preciso
"purge" de cache.
