# Integração Stone Pinpad via DLL

## 📋 Resumo das Alterações

Este documento descreve as alterações realizadas para integrar o sistema de pagamento Stone Pinpad utilizando comunicação direta com a DLL (DPOSDRV.DLL ou AcessoTEF.dll) ao invés de comunicação HTTP na porta 6800.

## 🔧 Arquivos Modificados

### 1. **services/paymentService.ts** (Frontend)

**Alterações principais:**

- ✅ `createStonePayment()` - Agora chama `/api/payment/stone/create` no backend
- ✅ `checkStonePaymentStatus()` - Agora chama `/api/payment/stone/status/:id` no backend
- ✅ `cancelStonePayment()` - Agora chama `/api/payment/stone/cancel` no backend
- ✅ `checkStoneHealth()` - Agora chama `/api/payment/stone/health` no backend

**Antes:** Frontend chamava diretamente `http://localhost:6800/api/v1/transactions`
**Depois:** Frontend chama o backend que usa a DLL nativa

### 2. **stonePinpadController copy.js** (Backend Controller)

**Funções implementadas:**

#### ✅ `createStonePayment(req, res)`

- Recebe: `{ amount, type, installments, orderId }`
- Chama: `realizarPagamento()` do tefService.js
- Retorna: Status da transação via DLL

#### ⚠️ `cancelStonePayment(req, res)`

- Status: **Não implementado** (aguardando mapeamento da função de cancelamento na DLL)
- Retorna: HTTP 501 (Not Implemented)

#### ⚠️ `checkStoneStatus(req, res)`

- Status: **Parcialmente implementado** (retorna status simulado para transações DLL\_\*)
- Retorna: Status simulado ou HTTP 501

#### ✅ `checkStoneHealth(req, res)`

- Retorna: Status da DLL (se carregou com sucesso)

#### ✅ `registerStoneTransaction(req, res)`

- Registra transação aprovada no banco de dados (mantido do código original)

### 3. **tefService.js** (Serviço de Comunicação com DLL)

**Funções principais:**

#### `realizarPagamento(valor, tipo, idPedido)`

- Carrega a DLL usando `koffi`
- Mapeia funções: `InicializaDPOS`, `ConfiguraEmpresaLojaPDV`, `InicializaSessaoCB`
- Executa pagamento via DLL
- Retorna: `{ sucesso: boolean, mensagem: string, codigo: number }`

**Fluxo:**

1. Inicializa o driver (`InicializaDPOS`)
2. Configura loja (`ConfiguraEmpresaLojaPDV`)
3. Executa venda (`InicializaSessaoCB`)
4. Retorna resultado

### 4. **server.js** (Rotas do Backend)

**Novas rotas adicionadas:**

```javascript
// Importação do controller
import * as stonePinpadController from "./stonePinpadController copy.js";

// Rotas
app.post("/api/payment/stone/create", stonePinpadController.createStonePayment);
app.post("/api/payment/stone/cancel", stonePinpadController.cancelStonePayment);
app.get(
  "/api/payment/stone/status/:transactionId",
  stonePinpadController.checkStoneStatus
);
app.get("/api/payment/stone/health", stonePinpadController.checkStoneHealth);
app.post("/api/payment/stone/register" /* já existia */);
```

## 🔄 Fluxo de Pagamento

### Antes (HTTP):

```
Frontend → http://localhost:6800 → Stone TEF → Pinpad
         ↓
         Backend (apenas registro)
```

### Depois (DLL):

```
Frontend → Backend → tefService.js → DLL → Pinpad
         ↓
         Banco de Dados (registro automático)
```

## 📦 Dependências

### Backend:

- `koffi` - Biblioteca para carregar e usar DLLs nativas em Node.js
- DLL: `DPOSDRV.DLL` (deve estar na pasta `tef/`)

### Instalação:

```bash
npm install koffi
```

## 🚀 Como Usar

### 1. Configurar DLL

Coloque a DLL na pasta correta:

```
/tef/DPOSDRV.DLL
```

### 2. Iniciar Backend

```bash
npm run dev
# ou
node server.js
```

O backend irá:

- ✅ Carregar a DLL automaticamente
- ✅ Mapear as funções necessárias
- ✅ Exibir logs de sucesso/erro

### 3. Frontend

O frontend funcionará normalmente. Ao processar um pagamento Stone:

```typescript
const result = await createStonePayment({
  amount: 1000, // R$ 10,00 em centavos
  type: "CREDIT", // ou "DEBIT"
  installments: 1,
  orderId: "order_123",
});

if (result.success) {
  console.log("Pagamento aprovado:", result.transactionId);
} else {
  console.error("Erro:", result.error);
}
```

## 📝 Formato de Resposta

### Sucesso:

```json
{
  "success": true,
  "responseCode": "0000",
  "responseMessage": "Transação Aprovada",
  "transactionId": "DLL_1234567890",
  "authorizationCode": "123456",
  "cardBrand": "VISA",
  "orderId": "order_123",
  "via": "DLL_NATIVE"
}
```

### Erro:

```json
{
  "success": false,
  "error": "Falha no processamento via DLL",
  "message": "Mensagem de erro detalhada",
  "debug": "Verifique o terminal do backend..."
}
```

## ⚠️ Funcionalidades Pendentes

### Cancelamento de Transação

- Status: **Não implementado**
- Motivo: Função de cancelamento na DLL ainda não foi mapeada
- Próximos passos: Identificar função correta na DLL (ex: `CancelarTransacao`, `EstornarPagamento`)

### Consulta de Status

- Status: **Parcialmente implementado**
- Comportamento atual: Retorna status simulado para transações iniciadas pela DLL
- Próximos passos: Mapear função de consulta na DLL

## 🐛 Troubleshooting

### DLL não carrega

**Erro:** `ERRO CRÍTICO NA DLL: cannot load library`
**Solução:**

1. Verifique se a DLL está na pasta `tef/`
2. Verifique se o caminho está correto no `tefService.js`
3. Certifique-se que é a DLL de 32 ou 64 bits correta

### Pagamento não processa

**Erro:** `Falha na chamada da função CB`
**Solução:**

1. Verifique os logs do backend
2. Confirme que o pinpad está conectado
3. Teste os parâmetros de entrada (Cupom, Valor, Tipo)

### Frontend não conecta

**Erro:** `Backend não está respondendo`
**Solução:**

1. Certifique-se que o backend está rodando
2. Verifique se a porta está correta (padrão: 3001)
3. Confira as configurações de CORS

## 📊 Logs

### Backend (DLL)

```
🔌 [TEF] Carregando driver: C:\...\tef\DPOSDRV.DLL
✅ DPOSDRV.DLL carregada. Mapeando funções...
🚀 Funções mapeadas com sucesso! Pronto para vender.
```

### Durante Pagamento

```
💳 [DLL] Iniciando pagamento para o pedido order_123...
   Valor: R$ 10.00
   Tipo: CREDIT
🔄 Iniciando Pagamento via InicializaSessaoCB...
   -> InicializaDPOS: 1
👉 Enviando Venda: Cupom=order_123, Valor=1000, Tipo=C
✅ RETORNO DA DLL: 1
```

## 🔐 Segurança

- ✅ A DLL roda apenas no servidor backend
- ✅ Frontend não tem acesso direto à DLL
- ✅ Todas as transações são registradas no banco
- ✅ Logs detalhados para auditoria

## 📚 Referências

- [Documentação Koffi](https://github.com/Koromix/koffi)
- [Stone TEF - Documentação oficial](https://portal.stone.com.br/)
- INTEGRACAO_STONE_PINPAD.md (documentação anterior)

---

**Última atualização:** 17 de Dezembro de 2025
**Versão:** 1.0
**Status:** ✅ Pronto para produção (pagamento básico implementado)
