# 🔷 Integração Stone Pinpad - Documentação

## 📋 Resumo das Alterações

O sistema foi migrado do **Mercado Pago Point Smart 2** para a **Stone Pinpad** para processamento de pagamentos com cartão de crédito e débito.

---

## 🔧 Alterações Realizadas

### 1. Backend (server.js)

#### Novas rotas adicionadas:

- **POST `/api/payment/stone/create`** - Criar pagamento na Pinpad Stone
- **POST `/api/payment/stone/cancel`** - Cancelar transação Stone
- **GET `/api/payment/stone/status/:transactionId`** - Verificar status da transação
- **GET `/api/payment/stone/health`** - Verificar se o TEF Stone está disponível

#### Características:

- Comunicação com TEF local via `http://localhost:6800/api/v1/transactions`
- Timeout de 2 minutos para criação de pagamento
- Valores em **centavos** (ex: R$ 10,00 = 1000)
- Suporte a crédito (`CREDIT`) e débito (`DEBIT`)
- Parcelamento configurável (apenas para crédito)
- Validação de `responseCode === "0000"` para pagamentos aprovados

### 2. Frontend - paymentService.ts

#### Novas funções exportadas:

```typescript
// Criar pagamento Stone Pinpad
createStonePayment(paymentData: {
  amount: number;        // Valor em centavos
  type: "CREDIT" | "DEBIT";
  installments?: number;
  orderId: string;
})

// Verificar status da transação
checkStonePaymentStatus(transactionId: string)

// Cancelar pagamento
cancelStonePayment(transactionId: string)

// Verificar saúde do TEF
checkStoneHealth()
```

### 3. Frontend - PaymentPage.tsx

#### Mudanças principais:

1. **Importações atualizadas:**

   - Removido: `createCardPayment`, `checkPaymentStatus`, `cancelPayment`
   - Adicionado: `createStonePayment`, `checkStonePaymentStatus`, `cancelStonePayment`

2. **Função `handleCardPayment`:**

   - Converte valor para centavos: `Math.round(cartTotal * 100)`
   - Usa `createStonePayment` em vez de `createCardPayment`
   - Mensagem: "Conectando à Pinpad Stone..."

3. **Função `handleCancelPayment`:**

   - Detecta tipo de pagamento (Stone ou PIX)
   - Usa `cancelStonePayment` para cartões
   - Mantém cancelamento PIX separado

4. **Polling de status:**

   - React Query adaptado para chamar `checkStonePaymentStatus` em pagamentos com cartão
   - Reconhece `status === "approved"` automaticamente
   - Mantém polling para PIX inalterado

5. **Finalização de pedido:**
   - Removido: chamada para `clearPaymentQueue()` (específica do Mercado Pago)
   - Stone não requer limpeza de fila

---

## 🔌 Requisitos de Infraestrutura

### TEF Stone deve estar rodando localmente:

- **URL:** `http://localhost:6800`
- **API:** `/api/v1/transactions`
- **Timeout:** 2 minutos para pagamentos, 30 segundos para consultas

### Estrutura de Comunicação:

```
Frontend (React)
    ↓
paymentService.ts
    ↓
Backend (Express - server.js)
    ↓
TEF Stone Local (http://localhost:6800)
    ↓
Pinpad Stone (hardware)
```

---

## 📊 Fluxo de Pagamento com Cartão

1. **Usuário escolhe** Crédito ou Débito no PaymentPage
2. **Frontend** chama `createStonePayment` com:
   - `amount`: valor em centavos
   - `type`: "CREDIT" ou "DEBIT"
   - `orderId`: ID do pedido
3. **Backend** envia para TEF Stone (`POST /api/v1/transactions`)
4. **TEF Stone** comunica com a Pinpad (aguarda inserção do cartão)
5. **Polling** via React Query:
   - A cada 3 segundos chama `checkStonePaymentStatus`
   - Verifica se `status === "approved"`
6. **Aprovação:** Finaliza pedido e redireciona
7. **Rejeição:** Mostra mensagem de erro

---

## 🔒 Validações de Segurança

### Backend:

- ✅ Validação de `amount > 0`
- ✅ Validação de `type` (apenas "CREDIT" ou "DEBIT")
- ✅ Timeout de 2 minutos (evita travamento)
- ✅ Tratamento de erro de conexão (TEF offline)
- ✅ Logs detalhados com prefixo `[STONE]`

### Frontend:

- ✅ Conversão correta para centavos
- ✅ Polling inteligente (para em status final)
- ✅ Cancelamento seguro (confirma com usuário)
- ✅ Mensagens de erro específicas

---

## 📝 Códigos de Resposta Stone

| Código | Significado              |
| ------ | ------------------------ |
| `0000` | Aprovado ✅              |
| `0001` | Transação negada         |
| `0002` | Transação não autorizada |
| `0003` | Erro de comunicação      |
| `0004` | Timeout                  |
| `9999` | Erro genérico            |

O backend mapeia automaticamente:

- `responseCode === "0000"` → `status: "approved"`
- Outros códigos → `status: "rejected"`

---

## 🧪 Como Testar

### 1. Verificar TEF Stone:

```bash
curl http://localhost:6800/health
```

Resposta esperada: `200 OK`

### 2. Health Check via API:

```bash
curl http://localhost:3001/api/payment/stone/health \
  -H "x-store-id: sushiman1"
```

### 3. Teste de Pagamento Completo:

1. Acesse o frontend em modo cliente
2. Adicione produtos ao carrinho
3. Vá para pagamento
4. Escolha "Cartão de Crédito" ou "Cartão de Débito"
5. **Verifique que:**
   - Mensagem "Conectando à Pinpad Stone..." aparece
   - Pinpad solicita inserção do cartão
   - Polling funciona (status atualiza a cada 3s)
   - Após aprovação, redireciona para tela de sucesso

---

## ⚠️ Troubleshooting

### Erro: "TEF Stone não está disponível"

**Causa:** Aplicativo Stone TEF não está rodando
**Solução:** Inicie o serviço Stone TEF Local

### Erro: "Timeout na operação"

**Causa:** Pagamento demorou mais de 2 minutos
**Solução:** Reduza o timeout ou verifique conexão com Pinpad

### Erro: "Não foi possível conectar em http://localhost:6800"

**Causa:** TEF não está escutando na porta 6800
**Solução:** Verifique configuração do TEF Stone

### Pagamento não finaliza

**Causa:** Polling não detecta status "approved"
**Solução:** Verificar logs do backend para `responseCode` recebido

---

## 🔄 Compatibilidade com PIX

O sistema mantém **total compatibilidade** com pagamentos PIX:

- PIX usa rotas `/api/payment/create-pix` e `/api/payment/status/:paymentId`
- Stone usa rotas `/api/payment/stone/*`
- Frontend detecta automaticamente qual API usar baseado no tipo de pagamento

---

## 📦 Arquivos Modificados

| Arquivo                      | Mudança                       |
| ---------------------------- | ----------------------------- |
| `server.js`                  | ➕ 4 novas rotas Stone        |
| `paymentService.ts`          | ➕ 4 novas funções Stone      |
| `PaymentPage.tsx`            | 🔄 Adaptado para Stone Pinpad |
| `INTEGRACAO_STONE_PINPAD.md` | ➕ Documentação criada        |

---

## ✅ Checklist de Deploy

- [ ] TEF Stone instalado e rodando
- [ ] Porta 6800 liberada no firewall
- [ ] Backend atualizado com novas rotas
- [ ] Frontend recompilado (`npm run build`)
- [ ] Teste de pagamento aprovado em produção
- [ ] Teste de cancelamento funcionando
- [ ] Logs sendo gerados corretamente
- [ ] Equipe treinada no novo fluxo

---

## 📞 Suporte

Para problemas com integração Stone Pinpad:

- Consultar logs do backend: `[STONE]` prefix
- Verificar status do TEF: `GET /api/payment/stone/health`
- Consultar documentação Stone: API v1 Transactions

---

**Última atualização:** 16/12/2025
**Versão:** 1.0.0
