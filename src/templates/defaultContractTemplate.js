export const DEFAULT_CONTRACT_TEMPLATE_HTML = `
<div class="contract-doc">
  <header class="contract-doc__header">
    <img src="{{company.logoUrl}}" alt="{{company.name}}" class="contract-doc__logo" />
    <h1 class="contract-doc__title">CONTRATO DE PRESTAÇÃO DE SERVIÇOS AUDIOVISUAIS</h1>
    <p class="contract-doc__subtitle">{{contract.title}}</p>
  </header>

  <p>
    Pelo presente instrumento particular, de um lado <strong>{{client.name}}</strong>,
    {{client.personTypeLabel}}, inscrito(a) no CPF/CNPJ sob nº <strong>{{client.documentFormatted}}</strong>,
    residente em {{client.address}}, {{client.city}}/{{client.state}},
    telefone {{client.phoneFormatted}}, WhatsApp {{client.whatsappFormatted}}, e-mail {{client.email}},
    doravante denominado(a) <strong>CONTRATANTE</strong>;
  </p>

  <p>
    e, de outro lado, <strong>{{company.name}}</strong>, com sede em {{company.address}},
    doravante denominada <strong>CONTRATADA</strong>;
  </p>

  <p>firmam o presente contrato, que se regerá pelas cláusulas a seguir:</p>

  <h2>CLÁUSULA 1 — DO OBJETO</h2>
  <p>
    A CONTRATADA compromete-se a prestar os seguintes serviços audiovisuais
    referentes a <strong>{{contract.title}}</strong>:
  </p>
  <ul class="contract-doc__list">
    {{#items}}
    <li><strong>{{serviceLabel}}</strong> — {{description}} — {{amountFormatted}}</li>
    {{/items}}
  </ul>
  <p>Valor total dos serviços: <strong>{{contract.totalAmountFormatted}}</strong>.</p>

  <h2>CLÁUSULA 2 — DO EVENTO</h2>
  <p>
    O evento ocorrerá em <strong>{{contract.eventDateFormatted}}</strong>,
    às <strong>{{contract.eventTime}}</strong>,
    no local <strong>{{contract.eventLocation}}</strong>,
    em <strong>{{contract.city}}</strong> / <strong>{{contract.state}}</strong>.
  </p>

  <h2>CLÁUSULA 3 — DO PAGAMENTO</h2>
  <p>O pagamento será realizado conforme o plano abaixo:</p>
  <ul class="contract-doc__list">
    {{#installments}}
    <li>{{numberLabel}} — vencimento em {{dueDateFormatted}} — {{expectedAmountFormatted}}</li>
    {{/installments}}
  </ul>
  <p>
    Entrada de {{contract.entryPercent}}% no valor de {{contract.entryAmountFormatted}},
    forma de pagamento: {{contract.entryPaymentMethodLabel}}.
  </p>

  <h2>CLÁUSULA 4 — DISPOSIÇÕES GERAIS</h2>
  <p>{{contract.description}}</p>
  <p>{{contract.notes}}</p>

  <p class="contract-doc__closing">
    E, por estarem de pleno acordo, firmam o presente contrato em
    <strong>{{contract.closingDateFormatted}}</strong>.
  </p>

  <p class="contract-doc__date">{{contract.city}}, {{todayFormatted}}.</p>

  <div class="contract-doc__signatures">
    <div class="contract-doc__signature">
      <div class="contract-doc__signature-line"></div>
      <p><strong>CONTRATANTE</strong><br>{{client.name}}</p>
    </div>
    <div class="contract-doc__signature">
      <div class="contract-doc__signature-line"></div>
      <p><strong>CONTRATADA</strong><br>{{company.name}}</p>
    </div>
  </div>
</div>
`.trim();

export const TEMPLATE_PLACEHOLDERS_HELP = `
<h4>Placeholders disponíveis</h4>
<p class="text-muted">Use <code>{{variavel}}</code> no modelo. Para listas, use blocos <code>{{#items}}...{{/items}}</code>.</p>
<ul class="template-help-list">
  <li><code>{{client.name}}</code> — Nome do cliente</li>
  <li><code>{{client.documentFormatted}}</code> — CPF/CNPJ</li>
  <li><code>{{client.phoneFormatted}}</code> — Telefone</li>
  <li><code>{{client.whatsappFormatted}}</code> — WhatsApp</li>
  <li><code>{{client.email}}</code> — E-mail</li>
  <li><code>{{client.address}}</code> — Endereço</li>
  <li><code>{{client.city}}</code> / <code>{{client.state}}</code></li>
  <li><code>{{contract.eventTypeLabel}}</code> — Modelo do evento (Casamento, Corporativo, Eventos)</li>
  <li><code>{{contract.title}}</code> — Título do contrato</li>
  <li><code>{{contract.description}}</code> — Descrição</li>
  <li><code>{{contract.eventDateFormatted}}</code> — Data do evento</li>
  <li><code>{{contract.eventTime}}</code> — Horário</li>
  <li><code>{{contract.eventLocation}}</code> — Local</li>
  <li><code>{{contract.city}}</code> / <code>{{contract.state}}</code></li>
  <li><code>{{contract.totalAmountFormatted}}</code> — Valor total</li>
  <li><code>{{contract.entryAmountFormatted}}</code> — Entrada</li>
  <li><code>{{contract.entryPercent}}</code> — % da entrada</li>
  <li><code>{{contract.closingDateFormatted}}</code> — Data de fechamento</li>
  <li><code>{{company.name}}</code> — Nome da empresa</li>
  <li><code>{{company.logoUrl}}</code> — Logo</li>
  <li><code>{{todayFormatted}}</code> — Data de hoje</li>
</ul>
<h4>Blocos de lista</h4>
<ul class="template-help-list">
  <li><code>{{#items}}</code> — Repete para cada serviço (<code>{{serviceLabel}}</code>, <code>{{description}}</code>, <code>{{amountFormatted}}</code>)</li>
  <li><code>{{#installments}}</code> — Repete para cada parcela (<code>{{numberLabel}}</code>, <code>{{dueDateFormatted}}</code>, <code>{{expectedAmountFormatted}}</code>)</li>
</ul>
`.trim();
