# 🎌 Japão Golden Route — App de Viagem (PWA para iPhone)

App interativo baseado no seu roteiro de 16 dias (24/07 a 08/08/2026): Tóquio · Kyoto · Nara · Hiroshima · Miyajima · Osaka.

É um **PWA (Progressive Web App)**: instala na tela de início do iPhone como um app de verdade, usa o GPS pelo Safari, funciona **offline** (roteiro, favoritos, anotações, checklist) e **online** (mapa, rotas, avaliações, cotação do iene).

---

## 🚀 Como colocar no seu iPhone (passo a passo)

O app precisa ficar em um endereço **https** (o GPS do iPhone só funciona em conexões seguras). A forma mais fácil e gratuita:

### Opção A — Netlify Drop (mais fácil, ~2 minutos)
1. Acesse **https://app.netlify.com/drop** no PC (crie conta grátis se pedir);
2. Arraste a pasta inteira `C:\Dev\roteiro-japao-app` para a página;
3. Ele gera um link tipo `https://seu-app.netlify.app` — abra esse link no **Safari do iPhone**;
4. Toque no botão **Compartilhar** (quadrado com seta) → **Adicionar à Tela de Início**;
5. Pronto: o ícone ⛩️ aparece na tela como um app. Abra por ele (tela cheia, sem barra do navegador).

### Opção B — GitHub Pages (grátis, endereço permanente)
1. Crie um repositório no GitHub e envie os arquivos desta pasta;
2. Em *Settings → Pages*, ative o Pages na branch `main`;
3. Abra a URL gerada no Safari do iPhone e "Adicionar à Tela de Início".

### Testar no PC antes
```
cd C:\Dev\roteiro-japao-app
python -m http.server 8000
```
Abra http://localhost:8000 (no PC o GPS funciona em localhost).

### Primeira vez no iPhone
- Ao tocar em **Perto de mim** ou no botão 📍 do mapa, o iPhone pergunta se permite a localização → **Permitir ao Usar o App**;
- Abra todas as abas uma vez com internet: o app guarda tudo em cache e passa a funcionar offline;
- No Japão, o mapa carrega novas áreas quando há internet (eSIM/WiFi) e mantém em cache as regiões já vistas.

---

## 📱 Estrutura do app (abas)

| Aba | O que faz |
|---|---|
| 🏠 **Início** | Nome/datas/cidades da viagem, contagem regressiva, card "Hoje" durante a viagem, bases de hospedagem, alertas |
| 📅 **Roteiro** | Os 16 dias em agenda: horários, locais, transporte, observações e os locais de cada dia (toque para detalhes) |
| 🗺️ **Mapa** | Mapa interativo com os ~90 locais em ícones por categoria, sua posição em tempo real, filtros e rotas |
| 📍 **Perto** | Locais ordenados por distância de você, com tempo estimado, filtro por categoria e raio |
| ⭐ **Favoritos** | Tudo que você marcou: Quero ir / Já visitei / Talvez / Pular / Importante |
| 🏙️ **Cidades** | Guia por cidade: transporte, bairros, dicas, pontos turísticos, restaurantes, compras |
| ⚙️ **Mais** | "O que fazer agora?", checklist, conversor ¥⇄R$, frases em japonês, emergências, etiqueta, documentos |

Além disso: **busca global** (🔍 no topo), ficha de cada local com endereço, horário, preço, distância, botões **Rota no Apple Maps / Google Maps**, status, e **anotações pessoais** por local.

## 🧱 Modelo de dados (js/data.js)

- `TRIP` — nome, datas, resumo, bases, alertas;
- `PLACES[]` — cada local: `{id, nome, cidade, cat, lat, lng, desc, addr, hours, preco, rating, roteiro (true = do roteiro / false = sugestão extra), dias[]}`;
- `DAYS[]` — cada dia: `{d, date, cidade, titulo, periodos[{t, desc}], transporte, obs, places[ids]}`;
- `CITY_INFO`, `CHECKLIST`, `FRASES`, `EMERGENCIA`, `ETIQUETA` — conteúdo das demais telas.

### Como editar o roteiro
Tudo é editado em **`js/data.js`** (texto simples):
- Mudar um horário/observação → edite o dia em `DAYS`;
- Adicionar um restaurante → copie um bloco em `PLACES`, ajuste nome/lat/lng (pegue as coordenadas no Google Maps: clique com o botão direito no lugar → copiar coordenadas);
- Para o local aparecer num dia, inclua o `id` dele em `DAYS[n].places`.
Depois de editar, reenvie a pasta ao Netlify/GitHub (o app instalado se atualiza sozinho ao abrir com internet).

## 🔒 Privacidade
- A localização é pedida pelo próprio iOS na primeira vez e usada **somente no aparelho** para distâncias e "perto de mim";
- Nada é enviado a servidores; favoritos e anotações ficam no armazenamento local do iPhone.

## 🌐 Online × Offline
- **Offline:** roteiro completo, fichas dos locais, favoritos, anotações, checklist, frases, conversor (última cotação salva), áreas do mapa já visitadas;
- **Online:** carregamento de novas áreas do mapa (OpenStreetMap), rotas no Apple/Google Maps, fotos e avaliações (link Google), cotação do iene em tempo real.

## 🔮 Melhorias futuras sugeridas
1. **Busca de lugares ao vivo** (Google Places/Foursquare API) para restaurantes fora da base — exige chave de API paga;
2. **Avisos de horário de funcionamento** ("fecha em 30 min") cruzando o relógio com o campo `hours`;
3. **Fotos dos locais** nos cards (adicionar campo `img` em `PLACES` com URLs);
4. **Compartilhamento** do dia/roteiro via link;
5. **Notificações** ("amanhã: DisneySea — ingresso comprado?") via Web Push (iOS 16.4+ suporta em PWA instalado);
6. **Versão nativa Swift/SwiftUI** — ver abaixo.

## 🍎 Caminho nativo (Swift/SwiftUI), se um dia tiver um Mac
A arquitetura deste PWA traduz direto para iOS nativo:
- **SwiftUI + TabView** (7 abas) ≙ `#tabbar`;
- **MapKit** (`Map`, `Marker`, `MKDirections`) ≙ Leaflet; **CoreLocation** ≙ `navigator.geolocation`;
- **SwiftData** com modelos `Place`, `Day`, `Favorite`, `Note` ≙ `data.js` + `localStorage`;
- `Info.plist`: `NSLocationWhenInUseUsageDescription` com o texto de privacidade;
- Publicação: conta Apple Developer (US$ 99/ano) + TestFlight/App Store.
O `data.js` pode ser convertido para JSON e embarcado no bundle do app nativo sem retrabalho.
