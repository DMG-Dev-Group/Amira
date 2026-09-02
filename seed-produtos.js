/**
 * Script para popular o Firestore com produtos de exemplo.
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
 */

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const serviceAccount = require("./service-account.json");

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

const produtos = [
  {
    nome: "Perfume Asaad Dourado 100ml",
    sku: "PRF-AS-001",
    codigoBarras: "7891234567890",
    peso: 250,
    descricao: "Fragrância marcante com notas amadeiradas e toque dourado, ideal para ocasiões especiais.",
    categoria: "perfumes",
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
    categoria: "perfumes",
    imagemURL: "https://images.unsplash.com/photo-1541643600914-78b084683601?w=600",
    precoVarejo: 129.9,
    precoAtacado: 99.9,
    estoqueVarejo: 18,
    estoqueAtacado: 48,
    ativo: true,
    destaque: true
  },
  {
    nome: "Kit Maquiagem Completo",
    sku: "MKP-KIT-003",
    codigoBarras: "7891234567892",
    peso: 480,
    descricao: "Kit com base, corretivo, paleta de sombras e batom líquido. Tudo que você precisa para um look completo.",
    categoria: "maquiagem",
    imagemURL: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=600",
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
    nome: "Batom Líquido Matte Vinho",
    sku: "MKP-BTM-004",
    codigoBarras: "7891234567893",
    peso: 35,
    descricao: "Cor intensa e longa duração, acabamento matte aveludado.",
    categoria: "maquiagem",
    imagemURL: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=600",
    precoVarejo: 39.9,
    precoAtacado: 28.9,
    estoqueVarejo: 40,
    estoqueAtacado: 100,
    ativo: true,
    destaque: false
  },
  {
    nome: "Colar Dourado Banhado a Ouro",
    sku: "ACS-CLR-005",
    codigoBarras: "7891234567894",
    peso: 60,
    descricao: "Colar delicado banhado a ouro 18k, hipoalergênico, acompanha case para presente.",
    categoria: "acessorios",
    imagemURL: "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600",
    precoVarejo: 89.9,
    precoAtacado: 69.9,
    estoqueVarejo: 15,
    estoqueAtacado: 40,
    ativo: true,
    destaque: true
  },
  {
    nome: "Brincos Argola Pequena",
    sku: "ACS-BRN-006",
    codigoBarras: "7891234567895",
    peso: 20,
    descricao: "Brincos de argola em aço inoxidável, não escurecem e não causam alergia.",
    categoria: "acessorios",
    imagemURL: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600",
    precoVarejo: 34.9,
    precoAtacado: 24.9,
    estoqueVarejo: 30,
    estoqueAtacado: 80,
    ativo: true,
    destaque: false
  },
  {
    nome: "Kit Presente Dia das Mães",
    sku: "KIT-PDM-007",
    codigoBarras: "7891234567896",
    peso: 620,
    descricao: "Caixa especial com perfume 50ml, colar dourado e cartão personalizado.",
    categoria: "kits",
    imagemURL: "https://images.unsplash.com/photo-1607290332146-1c0a44731b2c?w=600",
    precoVarejo: 219.9,
    precoAtacado: null,
    estoqueVarejo: 8,
    estoqueAtacado: 0,
    // Exemplo de produto SEM entrega (R2 item 7): só retirada na loja.
    freteDisponivel: false,
    ativo: true,
    destaque: true
  }
];

async function popular() {
  const colecao = db.collection("produtos");
  for (const produto of produtos) {
    const docRef = await colecao.add({
      ...produto,
      criadoEm: FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp()
    });
    console.log(`✓ Criado: ${produto.nome} (${docRef.id})`);
  }
  console.log(`\n${produtos.length} produtos criados com sucesso!`);
  process.exit(0);
}

popular().catch((erro) => {
  console.error("Erro ao popular produtos:", erro);
  process.exit(1);
});
