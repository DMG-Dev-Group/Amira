// ── Validação de CNPJ ──────────────────────────────────────────────────────
// Valida o formato e os dígitos verificadores do CNPJ. Isso NÃO confirma
// que a empresa existe de fato (pra isso precisaria de uma consulta à
// Receita Federal) — só impede erros de digitação e números aleatórios
// óbvios. A aprovação real de quem é revendedor continua manual (admin).

export function formatarCNPJ(valor) {
  let v = valor.replace(/\D/g, "").slice(0, 14);
  v = v.replace(/(\d{2})(\d)/, "$1.$2");
  v = v.replace(/(\d{3})(\d)/, "$1.$2");
  v = v.replace(/(\d{3})(\d)/, "$1/$2");
  v = v.replace(/(\d{4})(\d{1,2})$/, "$1-$2");
  return v;
}

export function validarCNPJ(cnpj) {
  const digitos = cnpj.replace(/\D/g, "");

  if (digitos.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digitos)) return false; // todos os dígitos iguais

  const calcularDigito = (base) => {
    let pesos = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    const soma = base
      .split("")
      .reduce((acc, num, i) => acc + Number(num) * pesos[i], 0);

    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const doze = digitos.slice(0, 12);
  const digito1 = calcularDigito(doze);
  const treze = doze + digito1;
  const digito2 = calcularDigito(treze);

  return digitos === treze + digito2;
}

/**
 * Consulta a BrasilAPI (gratuita, sem necessidade de chave) para descobrir
 * dados públicos do CNPJ — em especial se é um MEI (Empresário Individual).
 *
 * Retorna null em qualquer falha (CNPJ não encontrado, API fora do ar,
 * sem internet, etc.) — o cadastro NUNCA deve ser bloqueado por causa
 * dessa consulta. Ela é só um enriquecimento informativo para o admin
 * decidir a aprovação, não uma trava de segurança.
 */
export async function consultarCNPJ(cnpj) {
  const digitos = cnpj.replace(/\D/g, "");
  if (digitos.length !== 14) return null;

  try {
    const resposta = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digitos}`);
    if (!resposta.ok) return null;

    const dados = await resposta.json();

    // Natureza jurídica "213-5" = Empresário Individual, que é a base
    // jurídica de TODO MEI. Empresas com outras naturezas (LTDA, etc.)
    // não podem ser MEI, mesmo que o porte venha como "ME".
    const codigoNatureza = String(dados.codigo_natureza_juridica || dados.natureza_juridica || "");
    const ehEmpresarioIndividual = codigoNatureza.includes("213");

    // O campo "porte" e/ou "opcao_pelo_mei" variam conforme a fonte de
    // dados, então checamos ambos os indícios disponíveis.
    const portePequeno = (dados.porte || "").toUpperCase().includes("ME");
    const optanteMei = dados.opcao_pelo_mei === true;

    return {
      razaoSocial: dados.razao_social || null,
      situacaoCadastral: dados.descricao_situacao_cadastral || null,
      porte: dados.porte || null,
      provavelMEI: optanteMei || (ehEmpresarioIndividual && portePequeno),
      naturezaJuridica: dados.natureza_juridica || null
    };
  } catch (erro) {
    console.error("Consulta de CNPJ indisponível (não bloqueia o cadastro):", erro);
    return null;
  }
}
