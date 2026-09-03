/**
 * Script para popular o Firestore com CAMADAS de filtro e produtos de exemplo.
 *
 * COMO USAR:
 * 1. No Firebase Console do projeto de testes (flora-5754a):
 *    Configurações do projeto → Contas de serviço → Gerar nova chave privada
 *    Isso baixa um arquivo .json — salve como "service-account.json" nesta
 *    mesma pasta (NUNCA suba esse arquivo pro GitHub ou envie pra ninguém).
 *
 * 2. Instale as dependências:
 *    npm install firebase-admin
 *
 * 3. Rode:
 *    node seed-produtos.js
 *
 * O script é IDEMPOTENTE para as camadas: ele usa o slug como id do
 * documento, então rodar de novo atualiza em vez de duplicar. Os produtos
 * são sempre adicionados — apague a coleção "produtos" antes de re-semear.
 */

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const serviceAccount = require("./service-account.json");

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

// ── Camadas de filtro ────────────────────────────────────────────────────
// A camada de menor "ordem" é a PRINCIPAL: navbar, menu sanduíche, rodapé
// e a seção "Nossas categorias" da home. As opções da principal têm
// imagem de capa; as demais, não.
const camadas = [
  {
    slug: "tipo",
    nome: "Tipo",
    ordem: 1,
    opcoes: [
      { nome: "Perfumes", slug: "perfumes", imagemURL: "https://images.unsplash.com/photo-1594035910387-fea47794261f?w=600" },
      { nome: "Bodysplash", slug: "bodysplash", imagemURL: "https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=600" },
      { nome: "Decante", slug: "decante", imagemURL: "https://images.unsplash.com/photo-1541643600914-78b084683601?w=600" },
      { nome: "Miniatura", slug: "miniatura", imagemURL: "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=600" }
    ]
  },
  {
    slug: "origem",
    nome: "Origem",
    ordem: 2,
    opcoes: [
      { nome: "Árabe", slug: "arabe", imagemURL: "" },
      { nome: "Brand", slug: "brand", imagemURL: "" }
    ]
  },
  {
    slug: "genero",
    nome: "Gênero",
    ordem: 3,
    opcoes: [
      { nome: "Masculino", slug: "masculino", imagemURL: "" },
      { nome: "Feminino", slug: "feminino", imagemURL: "" }
    ]
  }
];

// ── Produtos de exemplo ──────────────────────────────────────────────────
// "filtros" é a fonte de verdade da filtragem. "categoria" é gravado com a
// 1ª opção da camada principal só como ponte de compatibilidade.
function comCategoriaLegado(produto) {
  const principal = (produto.filtros && produto.filtros.tipo) || [];
  return { ...produto, categoria: principal[0] || "" };
}

const produtos = [
  {
    nome: "Perfume Asaad Dourado 100ml",
    sku: "PRF-AS-001",
    codigoBarras: "7891234567890",
    peso: 250,
    descricao: "Fragrância marcante com notas amadeiradas e toque dourado, ideal para ocasiões especiais.",
    filtros: { tipo: ["perfumes"], origem: ["arabe"], genero: ["masculino"] },
    imagemURL: "https://images.unsplash.com/photo-1594035910387-fea47794261f?w=600",
    precoVarejo: 189.9,
    precoAtacado: 149.9,
    estoqueVarejo: 24,
    estoqueAtacado: 60,
    ativo: true,
    destaque: true
  },
  {
    nome: "Perfume Copa Floral 50ml",
    sku: "PRF-CP-002",
    codigoBarras: "7891234567891",
    peso: 150,
    descricao: "Aroma floral suave com toques cítricos, perfeito para o dia a dia.",
    filtros: { tipo: ["perfumes"], origem: ["brand"], genero: ["feminino"] },
    imagemURL: "https://images.unsplash.com/photo-1541643600914-78b084683601?w=600",
    precoVarejo: 129.9,
    precoAtacado: 99.9,
    estoqueVarejo: 18,
    estoqueAtacado: 48,
    ativo: true,
    destaque: true
  },
  {
    nome: "Perfume Unissex Âmbar Noir 100ml",
    sku: "PRF-AN-003",
    codigoBarras: "7891234567892",
    peso: 260,
    descricao: "Âmbar, baunilha e couro numa fragrância que veste bem em qualquer pessoa.",
    filtros: { tipo: ["perfumes"], origem: ["arabe"], genero: ["masculino", "feminino"] },
    imagemURL: "https://images.unsplash.com/photo-1587017539504-67cfbddac569?w=600",
    precoVarejo: 149.9,
    precoAtacado: 119.9,
    estoqueVarejo: 12,
    estoqueAtacado: 30,
    descontoAtivo: true,
    descontoTipo: "percentual",
    descontoPercentual: 10,
    ativo: true,
    destaque: true
  },
  {
    nome: "Bodysplash Vanilla Dream 250ml",
    sku: "BDS-VD-004",
    codigoBarras: "7891234567893",
    peso: 300,
    descricao: "Bruma corporal leve de baunilha e algodão, para refrescar o dia todo.",
    filtros: { tipo: ["bodysplash"], origem: ["brand"], genero: ["feminino"] },
    imagemURL: "https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=600",
    precoVarejo: 59.9,
    precoAtacado: 39.9,
    estoqueVarejo: 40,
    estoqueAtacado: 100,
    ativo: true,
    destaque: false
  },
  {
    nome: "Decante Oud Royal 10ml",
    sku: "DEC-OR-005",
    codigoBarras: "7891234567894",
    peso: 40,
    descricao: "Porção de 10ml do clássico árabe para você testar antes do frasco cheio.",
    filtros: { tipo: ["decante"], origem: ["arabe"], genero: ["masculino"] },
    imagemURL: "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=600",
    precoVarejo: 34.9,
    precoAtacado: 24.9,
    estoqueVarejo: 30,
    estoqueAtacado: 80,
    ativo: true,
    destaque: true
  },
  {
    nome: "Miniatura Brand Rosé 15ml",
    sku: "MIN-BR-006",
    codigoBarras: "7891234567895",
    peso: 60,
    descricao: "Versão de bolsa do best-seller floral. Cabe em qualquer necessaire.",
    filtros: { tipo: ["miniatura"], origem: ["brand"], genero: ["feminino"] },
    imagemURL: "https://images.unsplash.com/photo-1610461888750-10bfc601b874?w=600",
    precoVarejo: 44.9,
    precoAtacado: 29.9,
    estoqueVarejo: 25,
    estoqueAtacado: 70,
    ativo: true,
    destaque: false
  },
  {
    nome: "Kit Decantes Árabes (4x5ml)",
    sku: "DEC-KIT-007",
    codigoBarras: "7891234567896",
    peso: 120,
    descricao: "Quatro decantes de 5ml dos árabes mais pedidos. Só retirada na loja.",
    filtros: { tipo: ["decante", "miniatura"], origem: ["arabe"], genero: ["masculino", "feminino"] },
    imagemURL: "https://images.unsplash.com/photo-1607290332146-1c0a44731b2c?w=600",
    precoVarejo: 129.9,
    precoAtacado: null,
    estoqueVarejo: 8,
    estoqueAtacado: 0,
    freteDisponivel: false,
    ativo: true,
    destaque: true
  },
  {
    nome: "Perfume Brand Intense Man 100ml",
    sku: "PRF-BIM-008",
    codigoBarras: "7891234567897",
    peso: 250,
    descricao: "Aromático fougère com lavanda e madeira. Assinatura discreta para o dia.",
    filtros: { tipo: ["perfumes"], origem: ["brand"], genero: ["masculino"] },
    imagemURL: "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=600",
    precoVarejo: 159.9,
    precoAtacado: 124.9,
    estoqueVarejo: 20,
    estoqueAtacado: 50,
    ativo: true,
    destaque: false
  }
].map(comCategoriaLegado);

async function popularCamadas() {
  const colecao = db.collection("camadas");
  for (const camada of camadas) {
    await colecao.doc(camada.slug).set(
      { ...camada, criadoEm: FieldValue.serverTimestamp() },
      { merge: true }
    );
    console.log(`✓ Camada: ${camada.nome} (${camada.opcoes.length} opções)`);
  }
}

async function popularProdutos() {
  const colecao = db.collection("produtos");
  for (const produto of produtos) {
    const docRef = await colecao.add({
      ...produto,
      criadoEm: FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp()
    });
    console.log(`✓ Produto: ${produto.nome} (${docRef.id})`);
  }
}

async function popular() {
  await popularCamadas();
  await popularProdutos();
  console.log(`\n${camadas.length} camadas e ${produtos.length} produtos criados com sucesso!`);
  process.exit(0);
}

popular().catch((erro) => {
  console.error("Erro ao popular o Firestore:", erro);
  process.exit(1);
});
