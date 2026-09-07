# Sai da Frente!

**[Jogar online](https://lucas-d-s-1.github.io/sai-da-frente/)**

Quebra-cabeça de trânsito em português: mova os veículos no próprio eixo e leve o carro vermelho à saída.

- **Campanha:** 72 fases únicas, de 2 a 40 movimentos mínimos, com estrelas e títulos por progresso. Dicas limitam a medalha da tentativa a duas estrelas. Desfazer é livre na campanha.
- **Racha do dia:** três fases iguais para todos, em dificuldade crescente. Menos movimentos vence; tempo em segundos desempata. Sem dicas e sem desfazer. Repetições são permitidas, guardando o melhor resultado.
- **Amigos:** use “Convidar um amigo” ou termine o racha e compartilhe sua marca. Quem abrir o link recebe o mesmo desafio e pode devolver o próprio resultado.
- **Medalhas:** ouro no mínimo possível, prata até 25% acima do mínimo, bronze por concluir. A sequência conta dias consecutivos de rachadas concluídas, sem crédito extra por repetições.

O desafio muda às 00h UTC (21h de Brasília). Convites de dias anteriores continuam funcionando. O tempo começa ao revelar cada etapa, continua ao alternar de aba e pausa entre etapas. Reiniciar, sair do modo ou recarregar encerra a tentativa atual. Não há retomada de tentativa parcial.

No teclado, use Tab para escolher um veículo, setas para mover uma casa e Shift + seta para deslizar até o limite. Mouse e toque permitem arrastar várias casas em um único movimento.

## Disputa e armazenamento

Não há cadastro, servidor de pontuações ou placar global: a comparação acontece pelo link compartilhado. Progresso e recordes ficam neste navegador e não sincronizam automaticamente entre aparelhos. A comparação inclui o resultado do convite, seu recorde local e sua tentativa atual quando for diferente.

O link inclui apelido, data, tempo e as jogadas das três etapas. O destinatário verifica se cada jogada é legal, se as fases foram resolvidas e se a soma dos movimentos está correta. Isso detecta resultados inconsistentes, mas **não comprova autoria, ausência de ajuda externa ou tempo real**. É uma disputa amistosa; o navegador informa o tempo.

Os links usam regras `v1`. Não reordenar as fases nem mudar o sorteio dessa versão, pois isso invalidaria convites existentes. Uma mudança dessas exige uma nova versão preservando a anterior.

## Rodar localmente

Sem build ou dependências de produção. Abra `index.html`, ou sirva a pasta:

```sh
python -m http.server 4173 --bind 127.0.0.1
```

Abra `http://127.0.0.1:4173/`. Compartilhe o endereço publicado, pois links locais só funcionam no próprio computador.

## Validar

Com Node.js 22 ou mais recente:

```sh
node --check js/app.js
node --max-old-space-size=256 tools/test.js
```

Os testes verificam as 72 fases e seus mínimos, legalidade das soluções, regras por data, codificação UTF-8, rejeição de resultados inválidos, desempate, medalhas, sequência e limite do solucionador. `tools/selftest.js` é um alias para o mesmo conjunto de testes.

A revisão também foi testada em Chrome com sessões independentes: campanha, vitória/reinício, dicas, três etapas do racha, envio e retorno de resultados, armazenamento indisponível e layouts desktop/celular.

## Publicação

O workflow `.github/workflows/pages.yml` testa e publica no GitHub Pages a cada atualização de `main`. Nas configurações do repositório, a origem do Pages é **GitHub Actions**. Apenas `index.html`, `styles.css` e `js/` entram na hospedagem; testes e documentação ficam no repositório.

## Estrutura

- `js/engine.js`: regras e solucionador BFS ótimo, preservados da base original; limite de estados reforçado.
- `js/levels.js`: catálogo original validado, preservado para estabilidade dos convites.
- `js/competition.js`: regras versionadas e verificação dos resultados.
- `js/app.js`: interação, campanha, racha, armazenamento e compartilhamento.
- `tools/test.js`: verificações automáticas.

Projeto independente inspirado em quebra-cabeças de trânsito; sem afiliação com fabricantes do jogo físico.
