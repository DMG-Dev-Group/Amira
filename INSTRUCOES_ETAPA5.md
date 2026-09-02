# Etapa 5 — Modo Atacado com Conta de Revendedor

## O que foi feito

1. **Cadastro com dois tipos de conta** (`cadastro.html`): toggle
   "Sou cliente" / "Tenho uma loja". Ao escolher revendedor, pede CNPJ
   (com máscara e validação real de dígito verificador) e razão social.

2. **CNPJ validado matematicamente** (`services/cnpj.js`): confere o
   formato e os dígitos verificadores, igual a Receita Federal faz —
   isso impede números aleatórios/digitação errada, mas **não confirma
   que a empresa existe de fato**. A validação real de quem é revendedor
   continua sendo a aprovação manual sua.

3. **Conta de revendedor nasce "pendente"**: o cliente já pode navegar
   pela loja normalmente, mas só vê os preços de atacado depois que você
   aprovar manualmente (no Firestore por agora — o botão de aprovar no
   painel admin vem na próxima etapa).

4. **Botão "📦 Atacado" só aparece pra revendedores aprovados** — clientes
   comuns e revendedores pendentes não veem esse botão na navbar.

5. **Página de Atacado com 3 estados**:
   - Visitante não logado → convite para criar conta de revendedor
   - Logado mas pendente/rejeitado/cliente comum → mensagem explicando
     o status, sem acesso ao catálogo
   - Revendedor aprovado → catálogo de atacado de verdade, com preço por
     unidade e quantidade mínima de cada produto

6. **Login redireciona revendedor aprovado direto pro atacado** —
   conforme você pediu, a home dele passa a ser a área de atacado.

7. **Segurança em duas camadas**:
   - Front-end: só revendedor aprovado vê/compra no modo atacado
   - **Firestore Rules**: mesmo que alguém manipule a requisição direto
     (sem passar pela interface), o banco rejeita a criação de qualquer
     pedido com item em modo atacado se quem está comprando não for
     revendedor aprovado — essa é a proteção que realmente importa.

8. **Carrinho mostra um selo "ATACADO"** nos itens compendidos nesse modo,
   pra ficar claro o que é o quê quando o carrinho tiver os dois tipos.

## Como aprovar um revendedor (por enquanto, manual)

1. No Firebase Console → Firestore Database → coleção `usuarios`
2. Encontre o documento da pessoa (pelo nome/e-mail/CNPJ)
3. Edite o campo `statusRevendedor` de `"pendente"` para `"aprovado"`
4. Da próxima vez que ela logar, a home já será o catálogo de atacado

O painel admin (próxima etapa) vai ter um botão pra fazer isso sem
precisar entrar no Firestore manualmente.

## Pontos de atenção

- A quantidade mínima de atacado é validada **por produto individual**,
  como você pediu — cada item precisa atingir seu próprio mínimo.
- O carrinho aceita itens de varejo e atacado juntos, sem problema.
- Se um produto não tiver `precoAtacado` configurado, ele simplesmente
  não aparece no catálogo de atacado (mas continua normal no varejo).

## Próxima etapa

Painel administrativo: gestão de produtos, pedidos, métricas e aprovação
de revendedores direto pela interface.
