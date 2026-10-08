#!/usr/bin/env python3
"""Cabeçalho, menu mobile e rodapé compartilhados da loja.

O site é HTML estático sem build: cada página carrega a própria cópia da
"casca". Este script é a fonte única dela — edite aqui e rode:

    python3 scripts/casca.py

Ele substitui, em cada página da loja, o trecho entre os marcadores
<!-- casca:topo --> … <!-- /casca:topo --> e <!-- casca:rodape --> …
<!-- /casca:rodape -->. Os IDs são o contrato com os scripts
(nav-conta, nav-carrinho, nav-busca, navegacao-camadas, nav-mobile-menu,
nav-atacado-visibilidade, script.js, tema.js) — não renomeie.
"""
from pathlib import Path
import re
import sys

PAGINAS = Path(__file__).resolve().parent.parent / "frontend" / "src" / "pages"

# Páginas da loja com a casca completa. login/cadastro/avaliar-loja/404 têm
# layout próprio (tela focada), sem menu nem rodapé.
COM_CASCA = [
    "index.html", "produtos.html", "produto.html", "iphones.html", "atacado.html",
    "carrinho.html", "pedido-confirmado.html", "comprovante.html",
    "meus-pedidos.html", "perfil.html", "privacidade.html",
]

ICONE = {
    "busca": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    "conta": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    "sacola": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    "menu": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><path d="M3 8h18M3 16h12"/></svg>',
    "fechar": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19"/></svg>',
    "chevron": '<svg class="cat-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    "lua": '<svg class="tema-lua" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>',
    "sol": '<svg class="tema-sol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    "whatsapp": '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.6-.91-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.42.25-.69.25-1.29.18-1.41-.08-.13-.28-.2-.57-.35ZM12 0C5.37 0 0 5.37 0 12c0 2.12.55 4.11 1.51 5.83L.06 23.22a.75.75 0 0 0 .92.93l5.54-1.43A11.95 11.95 0 0 0 12 24c6.63 0 12-5.37 12-12S18.63 0 12 0Zm0 22c-1.9 0-3.7-.5-5.25-1.38l-.37-.21-3.9 1 1.03-3.77-.23-.38A9.96 9.96 0 0 1 2 12C2 6.48 6.48 2 12 2s10 4.48 10 10-4.48 10-10 10Z"/></svg>',
    "instagram": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/></svg>',
    "facebook": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h-2a4 4 0 0 0-4 4v3H7v4h2v7h4v-7h2.5l.5-4h-3V7a1 1 0 0 1 1-1h2V3Z"/></svg>',
}

SOL_SVG = (
    '<svg class="rodape__sol" viewBox="5 15 54 26" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true">'
    '<path d="M21 39a11 11 0 0 1 22 0" stroke-width="1.6"/><path d="M7 39h50" stroke-width="1.6"/>'
    '<path stroke-width="1.4" d="M18.21 34.52 11.55 32.36M20.27 30.48l-5.66-4.12M23.48 27.27l-4.12-5.66M27.52 25.21l-2.16-6.66M32 24.5v-7M36.48 25.21l2.16-6.66M40.52 27.27l4.12-5.66M43.73 30.48l5.66-4.12M45.79 34.52l6.66-2.16"/></svg>'
)

AVISOS = [
    "Perfumes originais · varejo e atacado",
    "Entrega em toda São Luís",
    "Monumental Shopping · 2º piso",
    "Pix, crédito e boleto",
]

WHATS = "https://wa.me/559884421875"


def topo(pagina: str) -> str:
    hero = " data-hero" if pagina == "index.html" else ""
    atual = {
        "iphones.html": "nav-btn-iphones",
        "atacado.html": "nav-btn-atacado",
    }.get(pagina)

    def aria(id_):
        return ' aria-current="page"' if id_ == atual else ""

    avisos = "".join(
        f'<span class="faixa-aviso__item{" ativo" if i == 0 else ""}">{t}</span>'
        for i, t in enumerate(AVISOS)
    )
    # produtos.html faz a própria busca (filtra a grade); as outras usam
    # services/nav-busca.js. O form e o input têm os mesmos IDs nas duas.
    dicas = "" if pagina == "produtos.html" else (
        '<div class="busca-folha__dicas" aria-label="Sugestões">'
        '<a href="produtos.html?busca=lattafa">Lattafa</a>'
        '<a href="produtos.html?busca=body%20splash">Body splash</a>'
        '<a href="produtos.html?busca=miniatura">Miniaturas</a>'
        '<a href="iphones.html">iPhones</a></div>'
    )
    return f'''<!-- casca:topo -->
  <a class="pular" href="#conteudo">Pular para o conteúdo</a>
  <div class="faixa-aviso" aria-label="Avisos da loja">{avisos}</div>
  <header class="topo" id="navbar"{hero}>
    <div class="moldura topo__barra">
      <div class="topo__esq">
        <button class="mobile-menu-btn" id="mobile-menu-btn" aria-label="Abrir menu" aria-expanded="false" aria-controls="mobile-menu-panel">{ICONE["menu"]}</button>
        <div class="nav-categorias-wrapper">
          <button class="nav-categorias-btn" id="categoriasBtn" aria-expanded="false" aria-haspopup="true" aria-controls="categoriasDropdown">Coleção {ICONE["chevron"]}</button>
          <div class="nav-categories-dropdown" id="categoriasDropdown" aria-hidden="true">
            <ul class="dropdown-list" id="dropdown-categorias-home">
              <li><a href="produtos.html">Ver todos os produtos</a></li>
            </ul>
          </div>
        </div>
        <a href="iphones.html" id="nav-btn-iphones" class="topo__link"{aria("nav-btn-iphones")}>iPhones</a>
        <a href="atacado.html" id="nav-btn-atacado" class="topo__link"{aria("nav-btn-atacado")}>Atacado</a>
      </div>
      <div class="topo__logo nav-logo">
        <a href="index.html" aria-label="Amira — início">
          <img class="logo-amira logo-amira--escuro" src="images/amira-marca-escuro.svg" alt="Amira" width="76" height="57">
          <img class="logo-amira logo-amira--claro" src="images/amira-marca-claro.svg" alt="" width="76" height="57">
        </a>
      </div>
      <div class="topo__dir">
        <button class="topo__icone" id="busca-abrir" aria-label="Buscar produtos" aria-expanded="false" aria-controls="busca-folha">{ICONE["busca"]}</button>
        <a href="login.html" class="nav-account-btn" id="nav-account-btn" aria-label="Minha conta">{ICONE["conta"]}<span class="topo__conta-txt" id="nav-account-label">Entrar</span></a>
        <a href="carrinho.html" class="nav-carrinho-btn" id="nav-carrinho-btn" aria-label="Sacola">{ICONE["sacola"]}<span class="nav-carrinho-contador" id="nav-carrinho-contador" hidden></span></a>
        <button id="theme-toggle" class="theme-toggle" aria-label="Alternar tema claro e escuro">{ICONE["lua"]}{ICONE["sol"]}</button>
      </div>
    </div>
  </header>

  <div class="busca-folha" id="busca-folha" role="dialog" aria-modal="true" aria-label="Buscar produtos">
    <div class="moldura">
      <div class="busca-folha__topo">
        <span class="rotulo">Buscar na Amira</span>
        <button class="topo__icone" id="busca-fechar" aria-label="Fechar busca">{ICONE["fechar"]}</button>
      </div>
      <form class="nav-busca-form" id="nav-busca-form" role="search">
        <input type="search" id="nav-busca-input" placeholder="Perfume, marca ou nota…" autocomplete="off" enterkeyhint="search" aria-label="Buscar produtos">
        <button type="submit" aria-label="Buscar" id="search">{ICONE["busca"]}</button>
      </form>
      {dicas}
    </div>
  </div>
  <div class="veu" id="busca-veu"></div>

  <div class="mobile-menu-overlay" id="mobile-menu-overlay"></div>
  <aside class="mobile-menu-panel" id="mobile-menu-panel" aria-hidden="true" aria-label="Menu">
    <div class="mobile-menu-header">
      <span class="mobile-menu-title">Menu</span>
      <button class="mobile-menu-close" id="mobile-menu-close" aria-label="Fechar menu">{ICONE["fechar"]}</button>
    </div>
    <nav class="mobile-menu-links" aria-label="Navegação principal">
      <div class="mobile-menu-category-group">
        <a href="produtos.html" class="mobile-menu-link mobile-menu-category-toggle" aria-expanded="false">Coleção</a>
        <div id="mobile-menu-camada-links"></div>
      </div>
      <a href="produtos.html" class="mobile-menu-link">Todos os produtos</a>
      <a href="iphones.html" class="mobile-menu-link">iPhones</a>
      <a href="atacado.html" class="mobile-menu-link" id="mobile-nav-atacado">Atacado</a>
      <a href="login.html" class="mobile-menu-link" id="mobile-nav-perfil"><span id="mobile-nav-perfil-label">Entrar</span></a>
      <a href="meus-pedidos.html" class="mobile-menu-link" id="mobile-nav-pedidos" style="display:none;">Meus pedidos</a>
      <a href="carrinho.html" class="mobile-menu-link" id="mobile-nav-carrinho" style="display:none;">Sacola <span class="mobile-menu-badge" id="mobile-carrinho-badge" style="display:none;"></span></a>
    </nav>
    <div class="mobile-menu-footer">
      <a href="{WHATS}" class="link-fio" target="_blank" rel="noopener">Falar no WhatsApp</a>
      <button id="theme-toggle-mobile" class="theme-toggle" aria-label="Alternar tema claro e escuro">{ICONE["lua"]}{ICONE["sol"]}</button>
    </div>
  </aside>
  <!-- /casca:topo -->'''


def rodape(pagina: str) -> str:
    return f'''<!-- casca:rodape -->
  <footer class="rodape">
    <div class="moldura">
      <div class="rodape__grade">
        <div>
          {SOL_SVG}
          <p class="rodape__frase">Sua <em>essência</em>, nossa paixão.</p>
          <p class="rodape__endereco">Monumental Shopping, 2º piso<br>São Luís — MA</p>
          <div class="rodape__social">
            <a href="#" aria-label="Instagram da Amira">{ICONE["instagram"]}</a>
            <a href="#" aria-label="Facebook da Amira">{ICONE["facebook"]}</a>
            <a href="{WHATS}" aria-label="WhatsApp da Amira" target="_blank" rel="noopener">{ICONE["whatsapp"]}</a>
          </div>
        </div>
        <div class="rodape__col">
          <h4>Coleção</h4>
          <ul id="footer-categorias-lista">
            <li><a href="produtos.html">Todos os produtos</a></li>
            <li><a href="iphones.html">iPhones</a></li>
          </ul>
        </div>
        <div class="rodape__col">
          <h4>A Amira</h4>
          <ul>
            <li><a href="atacado.html">Atacado</a></li>
            <li><a href="cadastro.html">Seja revendedora</a></li>
            <li><a href="avaliar-loja.html">Avalie a loja</a></li>
            <li><a href="privacidade.html">Privacidade</a></li>
            <li><a href="privacidade.html#cookies" data-abrir-cookies>Preferências de cookies</a></li>
          </ul>
        </div>
        <div class="rodape__col">
          <h4>Atendimento</h4>
          <ul>
            <li><a href="{WHATS}?text=Ol%C3%A1%2C%20Amira!" target="_blank" rel="noopener">WhatsApp</a></li>
            <li><a href="perfil.html">Minha conta</a></li>
            <li><a href="meus-pedidos.html">Meus pedidos</a></li>
            <li><a href="carrinho.html">Sacola</a></li>
          </ul>
        </div>
      </div>
      <p class="rodape__marca" aria-hidden="true">AMIRA</p>
      <div class="rodape__base">
        <p>© 2026 Amira — Atacado e Varejo</p>
        <div class="rodape__pagamentos" aria-label="Formas de pagamento"><span>Pix</span><span>Crédito</span><span>Boleto</span></div>
      </div>
    </div>
  </footer>
  <a href="{WHATS}" class="whatsapp-btn" target="_blank" rel="noopener" aria-label="Falar no WhatsApp">{ICONE["whatsapp"]}</a>
  <!-- /casca:rodape -->'''


def substituir(html: str, marca: str, novo: str) -> str:
    padrao = re.compile(rf"<!-- casca:{marca} -->.*?<!-- /casca:{marca} -->", re.S)
    if not padrao.search(html):
        raise SystemExit(f"marcador casca:{marca} ausente")
    return padrao.sub(lambda _: novo, html, count=1)


def main():
    for nome in COM_CASCA:
        caminho = PAGINAS / nome
        html = caminho.read_text(encoding="utf-8")
        html = substituir(html, "topo", topo(nome))
        html = substituir(html, "rodape", rodape(nome))
        caminho.write_text(html, encoding="utf-8")
        print("casca aplicada:", nome)


if __name__ == "__main__":
    sys.exit(main())
