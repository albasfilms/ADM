# Albas Films — Sistema de Administração

Sistema web para gerenciamento de clientes, contratos, serviços, parcelas e pagamentos da **Albas Films**.

## Objetivo

Centralizar o acompanhamento financeiro e operacional de serviços audiovisuais (fotografia, storymaker, filmmaker, teasers, casamentos, eventos etc.), incluindo entradas, parcelas, pagamentos recebidos e valores pendentes.

## Tecnologias

- HTML5, CSS3, JavaScript (ES Modules)
- [Vite](https://vitejs.dev/)
- [Firebase Authentication](https://firebase.google.com/docs/auth) (e-mail e senha)
- [Cloud Firestore](https://firebase.google.com/docs/firestore)
- [Firebase Hosting](https://firebase.google.com/docs/hosting)
- [Lucide Icons](https://lucide.dev/)
- Compatível com [Vercel](https://vercel.com/)

## Instalação

```bash
git clone https://github.com/albasfilms/ADM.git
cd ADM
npm install
```

## Configuração do Firebase

1. Acesse o [Firebase Console](https://console.firebase.google.com/)
2. Crie um projeto (ou use um existente)
3. Ative **Authentication → E-mail/Senha**
4. Crie um banco **Cloud Firestore**
5. Em **Configurações do projeto → Seus apps**, registre um app Web
6. Copie as credenciais públicas do SDK

## Variáveis de ambiente

Copie o arquivo de exemplo e preencha com os dados do Firebase:

```bash
cp .env.example .env
```

Variáveis necessárias:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

> **Importante:** nunca commite o arquivo `.env`. A configuração pública do Firebase no navegador **não substitui** as regras de segurança do Firestore.

## Primeiro administrador

1. No Firebase Console, vá em **Authentication → Users**
2. Clique em **Add user** e crie um usuário com e-mail e senha
3. Copie o **UID** do usuário criado
4. No Firestore, crie o documento `users/{uid}` com:

```json
{
  "name": "Administrador",
  "email": "admin@exemplo.com",
  "role": "admin",
  "active": true,
  "createdAt": "<serverTimestamp>",
  "updatedAt": "<serverTimestamp>"
}
```

> Use o tipo `timestamp` do Firestore para `createdAt` e `updatedAt`.

## Publicar regras do Firestore

```bash
cp .firebaserc.example .firebaserc
# Edite .firebaserc com o ID do seu projeto

firebase login
firebase deploy --only firestore:rules
```

## Criar índices

Os índices compostos serão adicionados conforme as consultas forem implementadas. Para publicar:

```bash
firebase deploy --only firestore:indexes
```

## Executar localmente

```bash
npm run dev
```

Acesse `http://localhost:5173`

## Gerar build

```bash
npm run build
```

Os arquivos serão gerados em `dist/`.

## Publicar no GitHub Pages

URL do site: `https://albasfilms.github.io/ADM/`

### Pré-requisitos

1. O código precisa estar no repositório `albasfilms/ADM` (push na branch `main`)
2. Em **Settings → Secrets and variables → Actions**, cadastre os secrets:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
3. Em **Settings → Pages**, em **Source**, selecione **GitHub Actions** (não "Deploy from a branch")

O workflow `.github/workflows/deploy-pages.yml` faz o build e publica automaticamente a cada push na `main`.

### Erro de permissão no push

Se aparecer `Permission denied to Pehalba`, a conta logada no Git não tem acesso de escrita ao repositório `albasfilms/ADM`. Soluções:

- Fazer login/push com a conta **albasfilms**, ou
- Adicionar o usuário **Pehalba** como colaborador em **Settings → Collaborators** do repositório

## Publicar no Firebase Hosting

```bash
npm run build
firebase deploy --only hosting
```

## Publicar na Vercel

1. Importe o repositório na Vercel
2. Configure as variáveis de ambiente (`VITE_FIREBASE_*`)
3. Build command: `npm run build`
4. Output directory: `dist`

O roteamento por hash (`#/`) funciona sem configuração extra de rewrites.

## Estrutura do banco de dados

```
users/{userId}
clients/{clientId}
contracts/{contractId}
contracts/{contractId}/items/{itemId}
contracts/{contractId}/installments/{installmentId}
contracts/{contractId}/installments/{installmentId}/payments/{paymentId}
auditLogs/{logId}
settings/general
```

### Coleção `users`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| name | string | Nome do usuário |
| email | string | E-mail |
| role | string | `admin` ou `collaborator` |
| active | boolean | Conta ativa |
| createdAt | timestamp | Data de criação |
| updatedAt | timestamp | Última atualização |

Valores monetários serão armazenados em **centavos** (inteiros) a partir da Etapa 3.

## Cuidados de segurança

- Sem cadastro público — usuários criados pelo Firebase Console
- Acesso bloqueado para não autenticados
- Apenas usuários ativos na coleção `users` podem acessar
- Perfis `admin` e `collaborator` com permissões distintas
- Regras do Firestore com princípio do menor privilégio
- Auditoria para exclusões e estornos (Etapa 4)
- Nunca commitar `.env`, service accounts ou dados reais

## Etapas de desenvolvimento

| Etapa | Status | Conteúdo |
|-------|--------|----------|
| 1 | ✅ | Vite, layout, CSS, Firebase, login, rotas |
| 2 | ✅ | Clientes — CRUD, busca, filtros, paginação, detalhes |
| 3 | ✅ | Contratos, itens, entrada, geração de parcelas |
| 4 | ✅ | Pagamentos parciais, saldos, auditoria |
| 5 | ✅ | Dashboard, indicadores, gráficos, alertas |
| 6 | ✅ | Relatórios, exportação CSV, revisão de segurança |

## Próximos recursos planejados

- Cadastro completo de clientes e contratos
- Geração automática de parcelas com correção de centavos
- Pagamentos parciais com histórico
- Dashboard com gráficos (Chart.js)
- Relatórios com exportação CSV
- Geração de PDF
- Upload de comprovantes (Firebase Storage)
- Script de dados demonstrativos

## Licença

Projeto privado — Albas Films.
