# Etapa 1 — Login, Cadastro e Minha Conta com Firebase

## ⚠️ Projeto Firebase atual: AMBIENTE DE TESTES

A configuração agora aponta para o projeto **`flora-5754a`** (não mais
`florabeauty`). Isso está em `frontend/src/pages/services/firebase-config.js`,
`firebase.js` e `.firebaserc`. Quando quiser voltar pro projeto de produção,
é só trocar esses três lugares.

**Lembre-se de, no projeto `flora-5754a`:**
1. Ativar **Authentication → Sign-in method → E-mail/senha**
2. Publicar as regras: `firebase use flora-5754a && firebase deploy --only firestore:rules`

## O que foi feito

1. **Firebase Auth real**: login e cadastro agora criam contas de verdade
   (e-mail + senha), em vez de só formulários visuais.
2. **Perfil do usuário no Firestore**: toda conta nova ganha um documento em
   `usuarios/{uid}` com `nome`, `email` e `role: "cliente"`.
3. **Regras de segurança novas** (`firestore.rules`): a regra antiga liberava
   leitura/escrita pra qualquer um até 19/07/2026 — troquei por regras reais
   que já preparam o terreno pra produtos, carrinho, pedidos e métricas das
   próximas etapas.
4. **Navbar**: botão "Entrar" que muda pro seu nome quando você loga (e leva
   pro painel admin automaticamente se a conta for admin, ou pra "Minha
   Conta" se for cliente).
5. **Página "Minha Conta" (`perfil.html`)** — nova, com 3 abas:
   - **Dados pessoais**: nome, celular (com máscara), URL de foto de perfil
     (sem upload — ver explicação abaixo)
   - **Segurança**: trocar senha (com confirmação da senha atual, exigência
     do próprio Firebase) e botão de sair da conta
   - **Endereços**: CEP com busca automática via ViaCEP (gratuita), salvo
     como endereço padrão para facilitar compras futuras
6. **Reorganizei a pasta `services/`**: ela estava fora da pasta pública do
   Firebase Hosting (`frontend/src/pages`), então o `script.js` original
   **nunca teria funcionado depois do deploy**. Já corrigido.
7. **Corrigi um bug** no `nav-conta.js`: o import apontava pra ele mesmo
   (`../services/auth.js` dentro de um arquivo que já está em `services/`).

## Por que a foto de perfil é por URL, e não upload

O Firebase removeu o Cloud Storage do plano gratuito (Spark) — agora exige o
plano pago (Blaze, com cartão cadastrado) mesmo pra uso baixo. Pra evitar
custo e burocracia, a foto de perfil funciona por **link de imagem** (cole a
URL de uma foto já hospedada em algum lugar). Se não colar nada, o sistema
mostra automaticamente um avatar com as iniciais do nome.

## Como criar sua primeira conta de administrador

Por segurança, **não existe** um jeito de se cadastrar direto como admin
pelo site. Para tornar uma conta em admin:

1. Crie a conta normalmente pelo site (como cliente)
2. No Firebase Console, vá em **Firestore Database**
3. Encontre o documento em `usuarios/{seu-uid}` (o uid aparece em
   **Authentication** → lista de usuários)
4. Edite o campo `role` de `"cliente"` para `"admin"`

## Próxima etapa

Estrutura de produtos no Firestore + página de catálogo com busca e filtros
(estilo Mercado Livre).

