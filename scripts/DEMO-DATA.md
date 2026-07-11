# Dados demonstrativos — Albas Films ADM

Use estes dados **apenas em ambiente de teste**. Não utilize dados reais de clientes.

## Exemplo manual (via interface)

### 1. Cliente
- **Nome:** Ana e Rafael
- **Tipo:** Pessoa física
- **Telefone:** (11) 99999-9999
- **E-mail:** ana.rafael@email.com
- **Cidade:** São Paulo / SP

### 2. Contrato
- **Título:** Casamento Ana e Rafael
- **Tipo:** Casamento
- **Data do evento:** escolha uma data futura
- **Serviços:**
  - Storymaker — R$ 900,00
  - Teaser — R$ 500,00
  - Deslocamento — R$ 180,00
- **Total:** R$ 1.580,00
- **Entrada:** 30% (R$ 474,00)
- **Parcelas:** 5x de R$ 221,20

### 3. Pagamentos de teste
Após criar o contrato, registre:
- Entrada de R$ 474,00 via Pix
- Primeira parcela parcial de R$ 100,00
- Complemento de R$ 121,20 na mesma parcela

Isso valida pagamentos parciais e atualização automática de saldos.

## Observação

Um script automatizado com Firebase Admin SDK pode ser adicionado futuramente.
Requer service account (não incluir no repositório).
