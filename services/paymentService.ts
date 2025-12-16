// Serviço de Pagamento Multi-tenant (PIX + Point Smart 2)
// Baseado nas rotas do backend em server.js
import api from "./api";

export interface PaymentResponse {
  success: boolean;
  paymentId?: string;
  qrCode?: string;
  qrCodeCopyPaste?: string;
  status?: string;
  error?: string;
  message?: string;
}

export interface PaymentStatusResponse {
  success: boolean;
  id?: string;
  status?: string;
  statusDetail?: string;
  amount?: number;
  orderId?: string;
  reason?: string;
  error?: string;
}

/**
 * Criar pagamento PIX (QR Code na tela)
 * Endpoint: POST /api/payment/create-pix
 */
export async function createPixPayment(paymentData: {
  amount: number;
  description?: string;
  orderId: string;
  email?: string;
  payerName?: string;
}): Promise<PaymentResponse> {
  try {
    const response = await api.post("/api/payment/create-pix", {
      amount: paymentData.amount,
      description: paymentData.description || `Pedido ${paymentData.orderId}`,
      orderId: paymentData.orderId,
      email: paymentData.email || "cliente@totem.com.br",
      payerName: paymentData.payerName || "Cliente",
    });

    return {
      success: true,
      paymentId: response.data.id || response.data.paymentId, // Backend retorna "id"
      qrCode: response.data.qr_code_base64 || response.data.qrCodeBase64, // Backend retorna snake_case

      qrCodeCopyPaste: response.data.qr_code || response.data.qrCodeCopyPaste, // Backend retorna snake_case
      status: response.data.status,
    };
  } catch (error: any) {
    console.error("❌ Erro ao criar pagamento PIX:", error);
    return {
      success: false,
      error: error.response?.data?.error || "Erro ao criar pagamento PIX",
    };
  }
}

/**
 * Criar pagamento com Cartão (Point Smart 2)
 * Endpoint: POST /api/payment/create
 */
export async function createCardPayment(paymentData: {
  amount: number;
  description?: string;
  orderId: string;
  paymentMethod?: "credit" | "debit";
}): Promise<PaymentResponse> {
  try {
    const response = await api.post("/api/payment/create", {
      amount: paymentData.amount,
      description: paymentData.description || `Pedido ${paymentData.orderId}`,
      orderId: paymentData.orderId,
      paymentMethod: paymentData.paymentMethod,
    });

    return {
      success: true,
      paymentId: response.data.id,
      status: response.data.status,
    };
  } catch (error: any) {
    console.error("❌ Erro ao criar pagamento com cartão:", error);
    return {
      success: false,
      error:
        error.response?.data?.error || "Erro ao criar pagamento com cartão",
    };
  }
}

/**
 * Verificar status de pagamento (PIX ou Point)
 * Endpoint: GET /api/payment/status/:paymentId
 *
 * O backend detecta automaticamente se é PIX (Payments API) ou Point (Payment Intent API)
 */
export async function checkPaymentStatus(
  paymentId: string
): Promise<PaymentStatusResponse> {
  try {
    const response = await api.get(`/api/payment/status/${paymentId}`);

    // Mapeia campos do backend para o formato esperado pelo frontend
    return {
      success: true,
      id: response.data.paymentId || response.data.id || paymentId,
      status: response.data.status, // "approved", "pending", "canceled", "rejected", "FINISHED"
      statusDetail: response.data.paymentStatus || response.data.statusDetail,
      orderId: response.data.orderId,
      reason: response.data.reason,
      amount: response.data.amount,
    };
  } catch (error: any) {
    console.error("❌ Erro ao verificar status:", error);
    return {
      success: false,
      error: error.response?.data?.error || "Erro ao verificar status",
    };
  }
}

/**
 * Cancelar pagamento (PIX ou Point)
 * Endpoint: DELETE /api/payment/cancel/:paymentId
 */
export async function cancelPayment(
  paymentId: string
): Promise<PaymentResponse> {
  try {
    const response = await api.delete(`/api/payment/cancel/${paymentId}`);

    return {
      success: true,
      paymentId: response.data.id,
      status: response.data.status,
      message: response.data.message,
    };
  } catch (error: any) {
    console.error("❌ Erro ao cancelar pagamento:", error);
    return {
      success: false,
      error: error.response?.data?.error || "Erro ao cancelar pagamento",
    };
  }
}

/**
 * Configurar Point Smart 2 em modo PDV
 * Endpoint: POST /api/payment/point/configure
 */
export async function configurePoint(): Promise<PaymentResponse> {
  try {
    const response = await api.post("/api/payment/point/configure");

    return {
      success: true,
      message: response.data.message,
    };
  } catch (error: any) {
    console.error("❌ Erro ao configurar Point:", error);
    return {
      success: false,
      error: error.response?.data?.error || "Erro ao configurar Point",
    };
  }
}

/**
 * Obter status da Point Smart 2
 * Endpoint: GET /api/payment/point/status
 */
export async function getPointStatus(): Promise<PaymentResponse> {
  try {
    const response = await api.get("/api/payment/point/status");

    return {
      success: true,
      status: response.data.status,
      message: response.data.operating_mode,
    };
  } catch (error: any) {
    console.error("❌ Erro ao consultar Point:", error);
    return {
      success: false,
      error: error.response?.data?.error || "Erro ao consultar Point",
    };
  }
}

/**
 * Limpar fila de pagamentos da Point
 * Endpoint: POST /api/payment/clear-queue
 */
export async function clearPaymentQueue(): Promise<PaymentResponse> {
  try {
    const response = await api.post("/api/payment/clear-queue");

    return {
      success: true,
      message: response.data.message,
    };
  } catch (error: any) {
    console.error("❌ Erro ao limpar fila:", error);
    return {
      success: false,
      error: error.response?.data?.error || "Erro ao limpar fila",
    };
  }
}

/**
 * Helper para polling de status de pagamento
 * Verifica status a cada X segundos até aprovação, rejeição ou timeout
 *
 * @param paymentId - ID do pagamento
 * @param onStatusChange - Callback chamado a cada mudança de status
 * @param intervalMs - Intervalo entre verificações (padrão: 3000ms)
 * @param timeoutMs - Tempo máximo de polling (padrão: 300000ms = 5min)
 * @returns Promise que resolve com status final
 */
export async function startPaymentPolling(
  paymentId: string,
  onStatusChange: (status: PaymentStatusResponse) => void,
  intervalMs: number = 3000,
  timeoutMs: number = 300000
): Promise<PaymentStatusResponse> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = Math.floor(timeoutMs / intervalMs);

    console.log(
      `🔄 Iniciando polling de pagamento ${paymentId} (máx ${maxAttempts} tentativas)`
    );

    const interval = setInterval(async () => {
      attempts++;

      try {
        const result = await checkPaymentStatus(paymentId);

        // Chama callback com status atual
        onStatusChange(result);

        if (result.success) {
          console.log(
            `🔍 Polling ${paymentId} [${attempts}/${maxAttempts}]: ${result.status}`
          );

          // Status finais que param o polling
          if (
            result.status === "approved" ||
            result.status === "rejected" ||
            result.status === "canceled" ||
            result.status === "refunded"
          ) {
            console.log(`✅ Polling finalizado: ${result.status}`);
            clearInterval(interval);
            resolve(result);
          }
        }

        // Timeout
        if (attempts >= maxAttempts) {
          console.warn(
            `⏱️ Timeout no polling de ${paymentId} após ${attempts} tentativas`
          );
          clearInterval(interval);
          resolve({
            success: false,
            error: "Timeout ao verificar status do pagamento",
          });
        }
      } catch (error) {
        console.error(`❌ Erro no polling ${paymentId}:`, error);
        clearInterval(interval);
        reject(error);
      }
    }, intervalMs);
  });
}

export default {
  createPixPayment,
  createCardPayment,
  checkPaymentStatus,
  cancelPayment,
  configurePoint,
  getPointStatus,
  clearPaymentQueue,
  startPaymentPolling,
};

// ==========================================
// --- STONE PINPAD PAYMENT ---
// ==========================================

export interface StonePaymentResponse {
  success: boolean;
  id?: string;
  transactionId?: string;
  responseCode?: string;
  responseMessage?: string;
  authorizationCode?: string;
  cardBrand?: string;
  cardNumber?: string;
  status?: string;
  error?: string;
  message?: string;
  type?: string;
}

/**
 * Criar pagamento com Stone Pinpad (Cartão de Crédito ou Débito)
 * PRODUÇÃO: Chama TEF local diretamente e depois registra no backend
 */
export async function createStonePayment(paymentData: {
  amount: number; // Valor em centavos (100 = R$ 1,00)
  type: "CREDIT" | "DEBIT";
  installments?: number;
  orderId: string;
}): Promise<StonePaymentResponse> {
  try {
    console.log(`💳 [STONE] Processando pagamento...`);
    console.log(`   Valor: R$ ${(paymentData.amount / 100).toFixed(2)}`);
    console.log(`   Tipo: ${paymentData.type}`);
    console.log(`   Parcelas: ${paymentData.installments || 1}`);

    // 1. Chama TEF Stone local diretamente
    const tefResponse = await fetch(
      "http://localhost:6800/api/v1/transactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: paymentData.amount,
          type: paymentData.type.toUpperCase(),
          installments: paymentData.installments || 1,
          installmentType: "MERCHANT",
        }),
        signal: AbortSignal.timeout(120000), // 2 minutos de timeout
      }
    );

    if (!tefResponse.ok) {
      const errorData = await tefResponse.json().catch(() => ({}));
      throw new Error(
        errorData.message || `TEF respondeu com status ${tefResponse.status}`
      );
    }

    const tefData = await tefResponse.json();
    console.log(`✅ [STONE] Resposta TEF recebida:`, tefData);

    // Verifica se foi aprovado
    const approved = tefData.responseCode === "0000";

    if (!approved) {
      console.log(
        `❌ [STONE] Pagamento NEGADO! Código: ${tefData.responseCode}`
      );
      return {
        success: false,
        error: "Pagamento negado",
        responseCode: tefData.responseCode,
        responseMessage: tefData.responseMessage,
      };
    }

    // 2. Registra transação aprovada no backend
    console.log(`📝 [STONE] Registrando transação no backend...`);
    const registerResponse = await api.post("/api/payment/stone/register", {
      orderId: paymentData.orderId,
      transactionId: tefData.transactionId,
      authorizationCode: tefData.authorizationCode,
      amount: paymentData.amount,
      type: paymentData.type.toUpperCase(),
      installments: paymentData.installments || 1,
      cardBrand: tefData.cardBrand,
      cardNumber: tefData.cardNumber,
      responseCode: tefData.responseCode,
      responseMessage: tefData.responseMessage,
    });

    console.log(`✅ [STONE] Transação registrada no backend!`);

    return {
      success: true,
      id: tefData.transactionId,
      transactionId: tefData.transactionId,
      responseCode: tefData.responseCode,
      responseMessage: tefData.responseMessage,
      authorizationCode: tefData.authorizationCode,
      cardBrand: tefData.cardBrand,
      cardNumber: tefData.cardNumber,
      status: "approved",
      type: "stone",
    };
  } catch (error: any) {
    console.error("❌ Erro ao criar pagamento Stone:", error);

    // Erro de conexão com TEF
    if (error.name === "TypeError" && error.message.includes("fetch")) {
      return {
        success: false,
        error: "TEF Stone não está disponível",
        message: "Verifique se o aplicativo Stone está aberto e rodando",
      };
    }

    // Timeout
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return {
        success: false,
        error: "Timeout na operação",
        message: "O pagamento demorou muito tempo e foi cancelado",
      };
    }

    return {
      success: false,
      error:
        error.response?.data?.error ||
        "Erro ao processar pagamento Stone Pinpad",
      message: error.response?.data?.message || error.message,
    };
  }
}

/**
 * Verificar status de pagamento Stone
 * PRODUÇÃO: Consulta TEF local diretamente
 */
export async function checkStonePaymentStatus(
  transactionId: string
): Promise<StonePaymentResponse> {
  try {
    // Consulta TEF Stone local
    const response = await fetch(
      `http://localhost:6800/api/v1/transactions/${transactionId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(30000), // 30 segundos
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }

    const data = await response.json();

    // Mapeia status Stone
    const approved = data.responseCode === "0000";
    const status = approved ? "approved" : data.status || "pending";

    return {
      success: true,
      id: transactionId,
      transactionId: transactionId,
      responseCode: data.responseCode,
      responseMessage: data.responseMessage,
      status: status,
      type: "stone",
    };
  } catch (error: any) {
    console.error("❌ Erro ao verificar status Stone:", error);

    // Erro de conexão
    if (error.name === "TypeError" && error.message.includes("fetch")) {
      return {
        success: false,
        error: "TEF Stone não está disponível",
        message: "Não foi possível conectar ao TEF",
      };
    }

    return {
      success: false,
      error: error.message || "Erro ao verificar status Stone",
    };
  }
}

/**
 * Cancelar pagamento Stone
 * PRODUÇÃO: Cancela no TEF local e notifica backend
 */
export async function cancelStonePayment(
  transactionId: string
): Promise<StonePaymentResponse> {
  try {
    console.log(`🔄 [STONE] Cancelando transação: ${transactionId}`);

    // 1. Cancela no TEF Stone local
    const cancelUrl = `http://localhost:6800/api/v1/transactions/${transactionId}/cancel`;
    const tefResponse = await fetch(cancelUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(60000), // 1 minuto
    });

    if (!tefResponse.ok) {
      const errorData = await tefResponse.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${tefResponse.status}`);
    }

    const tefData = await tefResponse.json();
    console.log(`✅ [STONE] Cancelamento processado no TEF:`, tefData);

    // 2. Notifica backend (opcional, mas recomendado para auditoria)
    try {
      await api.post("/api/payment/stone/cancel", {
        transactionId: transactionId,
      });
      console.log(`✅ [STONE] Cancelamento registrado no backend`);
    } catch (backendError) {
      console.warn(
        `⚠️ [STONE] Erro ao registrar cancelamento no backend:`,
        backendError
      );
      // Não falha se backend não registrar, pois TEF já cancelou
    }

    return {
      success: true,
      transactionId: transactionId,
      message: "Transação cancelada com sucesso",
    };
  } catch (error: any) {
    console.error("❌ Erro ao cancelar pagamento Stone:", error);

    // Erro de conexão
    if (error.name === "TypeError" && error.message.includes("fetch")) {
      return {
        success: false,
        error: "TEF Stone não está disponível",
        message: "Não foi possível conectar ao TEF",
      };
    }

    return {
      success: false,
      error: error.message || "Erro ao cancelar pagamento Stone",
    };
  }
}

/**
 * Verificar saúde do TEF Stone
 * PRODUÇÃO: Consulta TEF local diretamente
 */
export async function checkStoneHealth(): Promise<StonePaymentResponse> {
  try {
    const response = await fetch("http://localhost:6800/health", {
      method: "GET",
      signal: AbortSignal.timeout(5000), // 5 segundos
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json().catch(() => ({}));

    return {
      success: true,
      message: "TEF Stone está online",
    };
  } catch (error: any) {
    console.error("❌ Erro ao verificar saúde Stone:", error);

    return {
      success: false,
      error: "TEF Stone não está disponível",
      message: "Verifique se o serviço está rodando em http://localhost:6800",
    };
  }
}
