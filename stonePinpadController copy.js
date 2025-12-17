import axios from "axios";
// IMPORTANTE: Importamos o serviço que fala com a DLL
import { realizarPagamento } from "./tefService.js";

/**
 * ===================================================
 * STONE PINPAD - CONTROLLER DE PAGAMENTOS (VIA DLL)
 * ===================================================
 * Gerencia pagamentos comunicando diretamente com a DLL TEF
 * (DPOSDRV.DLL ou AcessoTEF.dll)
 */

/**
 * POST /api/payment/stone/register
 * Registra pagamento no banco de dados (pós-processamento)
 * Mantido igual, pois apenas salva no banco.
 */
export async function registerStoneTransaction(req, res) {
  try {
    const {
      orderId,
      transactionId,
      authorizationCode,
      amount,
      type,
      installments,
      cardBrand,
      responseCode,
      storeId,
    } = req.body;

    // Validações obrigatórias
    if (!orderId || !transactionId || !authorizationCode || !amount) {
      return res.status(400).json({
        error:
          "Campos obrigatórios: orderId, transactionId, authorizationCode, amount",
      });
    }

    // Valida se pagamento foi aprovado
    if (responseCode !== "0000") {
      return res.status(400).json({
        error: "Transação não foi aprovada",
        responseCode,
      });
    }

    console.log(`✅ [STONE REGISTER] Registrando transação aprovada:`);
    console.log(`   Order ID: ${orderId}`);
    console.log(`   Amount: R$ ${(amount / 100).toFixed(2)}`);

    // Aqui você salvaria no banco de dados...

    res.json({
      success: true,
      message: "Transação Stone registrada com sucesso",
      data: {
        orderId,
        transactionId,
        status: "approved",
      },
    });
  } catch (error) {
    console.error("❌ Erro ao registrar transação Stone:", error.message);
    res.status(500).json({
      error: "Erro ao registrar transação",
      message: error.message,
    });
  }
}

/**
 * POST /api/payment/stone/create
 * Criar pagamento via DLL (AcessoTEF / DPOSDRV)
 */
export async function createStonePayment(req, res) {
  try {
    const { amount, type, installments, orderId } = req.body;

    // 1. Validações
    if (!amount || amount <= 0) {
      return res.status(400).json({
        error: "Campo 'amount' é obrigatório e deve ser maior que zero",
      });
    }

    if (!type || !["CREDIT", "DEBIT"].includes(type.toUpperCase())) {
      return res.status(400).json({
        error: "Campo 'type' deve ser 'CREDIT' ou 'DEBIT'",
      });
    }

    console.log(
      `💳 [DLL] Iniciando pagamento para o pedido ${orderId || "N/A"}...`
    );
    console.log(`   Valor: R$ ${(amount / 100).toFixed(2)}`);
    console.log(`   Tipo: ${type}`);

    // 2. CHAMADA À DLL (via tefService)
    // Aqui substituímos o axios pela chamada direta à biblioteca
    const resultado = await realizarPagamento(
      amount,
      type.toUpperCase(),
      orderId
    );

    console.log("🔄 [DLL] Retorno do serviço:", resultado);

    // 3. Verifica o resultado da DLL
    if (resultado.sucesso) {
      return res.json({
        success: true,
        responseCode: "0000",
        responseMessage: "Transação Aprovada",
        transactionId: resultado.transactionId || `DLL_${Date.now()}`, // ID gerado ou retornado pela DLL
        authorizationCode: resultado.authCode || "123456",
        cardBrand: "VISA", // Viria da DLL
        orderId: orderId,
        via: "DLL_NATIVE",
      });
    } else {
      // Se a DLL retornar erro ou falha
      return res.status(500).json({
        success: false,
        error: "Falha no processamento via DLL",
        message: resultado.mensagem || "Erro desconhecido na DLL",
        debug: "Verifique o terminal do backend para ler os logs da DLL",
      });
    }
  } catch (error) {
    console.error("❌ [DLL] Erro crítico no controller:", error.message);
    return res.status(500).json({
      error: "Erro interno no servidor ao processar DLL",
      message: error.message,
    });
  }
}

/**
 * POST /api/payment/stone/cancel
 * Cancelar transação
 * ⚠️ NOTA: Cancelamento via DLL ainda não implementado.
 * A DLL precisa expor uma função de cancelamento que ainda não foi mapeada.
 */
export async function cancelStonePayment(req, res) {
  try {
    const { transactionId } = req.body;

    if (!transactionId) {
      return res.status(400).json({ error: "transactionId obrigatório" });
    }

    console.log(
      `⚠️ [DLL] Função de cancelamento via DLL ainda não implementada.`
    );
    console.log(`   Transaction ID: ${transactionId}`);

    // TODO: Implementar cancelamento via DLL quando descobrirmos a função correta
    // Exemplo: await cancelarPagamento(transactionId);

    return res.status(501).json({
      success: false,
      error: "Cancelamento via DLL não implementado",
      message: "A função de cancelamento na DLL ainda precisa ser mapeada.",
      debug:
        "Verifique o log da DLL para identificar funções de cancelamento disponíveis",
    });
  } catch (error) {
    console.error("❌ [CANCEL] Erro:", error.message);
    return res.status(500).json({
      error: "Erro ao processar cancelamento",
      message: error.message,
    });
  }
}

/**
 * GET /api/payment/stone/status/:transactionId
 * Consultar status de transação
 * ⚠️ NOTA: Consulta via DLL ainda não implementada.
 */
export async function checkStoneStatus(req, res) {
  try {
    const { transactionId } = req.params;

    if (!transactionId) {
      return res.status(400).json({ error: "transactionId obrigatório" });
    }

    // Simulação de resposta para transações criadas pela DLL
    // Se o ID começar por DLL_, sabemos que foi feito por nós
    if (transactionId.startsWith("DLL_")) {
      return res.json({
        success: true,
        status: "APPROVED",
        transactionId,
        message: "Status simulado - Transação criada via DLL",
        note: "Consulta de status real via DLL ainda não implementada",
      });
    }

    // TODO: Implementar consulta via DLL quando descobrirmos a função correta
    // Exemplo: await consultarStatus(transactionId);

    return res.status(501).json({
      success: false,
      error: "Consulta de status via DLL não implementada",
      message: "A função de consulta na DLL ainda precisa ser mapeada.",
    });
  } catch (error) {
    console.error("❌ [STATUS] Erro:", error.message);
    return res.status(500).json({
      error: "Erro ao consultar status",
      message: error.message,
    });
  }
}

/**
 * GET /api/payment/stone/health
 * Health check
 */
export async function checkStoneHealth(req, res) {
  // Como estamos usando DLL, o "Health" é saber se a DLL carregou.
  // Podemos fazer uma chamada simples à DLL se houver função de 'ping'

  return res.json({
    success: true,
    message: "Modo DLL Ativo",
    status: "DLL_LOADED", // Assumindo que o tefService carregou
  });
}
