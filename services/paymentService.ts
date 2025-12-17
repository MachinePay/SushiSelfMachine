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
 * NOVA VERSÃO: Chama backend que se comunica com DLL nativa
 */
export async function createStonePayment(paymentData: {
  amount: number; // Valor em centavos (100 = R$ 1,00)
  type: "CREDIT" | "DEBIT";
  installments?: number;
  orderId: string;
}): Promise<StonePaymentResponse> {
  try {
    console.log(`💳 [STONE] Processando pagamento via DLL...`);
    console.log(`   Valor: R$ ${(paymentData.amount / 100).toFixed(2)}`);
    console.log(`   Tipo: ${paymentData.type}`);
    console.log(`   Parcelas: ${paymentData.installments || 1}`);

    // Chama o backend que usa a DLL nativa
    const response = await api.post("/api/payment/stone/create", {
      amount: paymentData.amount,
      type: paymentData.type.toUpperCase(),
      installments: paymentData.installments || 1,
      orderId: paymentData.orderId,
    });

    const data = response.data;
    console.log(`✅ [STONE] Resposta do backend:`, data);

    // Verifica se foi aprovado
    if (!data.success) {
      console.log(`❌ [STONE] Pagamento NEGADO!`);
      return {
        success: false,
        error: data.error || "Pagamento negado",
        message: data.message,
        responseCode: data.responseCode,
        responseMessage: data.responseMessage,
      };
    }

    return {
      success: true,
      id: data.transactionId,
      transactionId: data.transactionId,
      responseCode: data.responseCode || "0000",
      responseMessage: data.responseMessage || "Transação Aprovada",
      authorizationCode: data.authorizationCode,
      cardBrand: data.cardBrand,
      cardNumber: data.cardNumber,
      status: "approved",
      type: "stone",
    };
  } catch (error: any) {
    console.error("❌ Erro ao criar pagamento Stone:", error);

    // Erro de resposta do backend
    if (error.response) {
      return {
        success: false,
        error: error.response.data?.error || "Erro ao processar pagamento",
        message: error.response.data?.message || error.message,
      };
    }

    // Erro de conexão
    if (error.request) {
      return {
        success: false,
        error: "Backend não está respondendo",
        message: "Verifique se o servidor backend está rodando",
      };
    }

    return {
      success: false,
      error: "Erro ao processar pagamento Stone Pinpad",
      message: error.message,
    };
  }
}

/**
 * Verificar status de pagamento Stone
 * NOVA VERSÃO: Consulta através do backend que usa a DLL
 */
export async function checkStonePaymentStatus(
  transactionId: string
): Promise<StonePaymentResponse> {
  try {
    // Consulta status via backend
    const response = await api.get(
      `/api/payment/stone/status/${transactionId}`
    );

    const data = response.data;

    return {
      success: data.success,
      id: transactionId,
      transactionId: transactionId,
      responseCode: data.responseCode,
      responseMessage: data.responseMessage,
      status: data.status,
      type: "stone",
    };
  } catch (error: any) {
    console.error("❌ Erro ao verificar status Stone:", error);

    // Erro de resposta do backend
    if (error.response) {
      return {
        success: false,
        error: error.response.data?.error || "Erro ao verificar status",
        message: error.response.data?.message || error.message,
      };
    }

    // Erro de conexão
    if (error.request) {
      return {
        success: false,
        error: "Backend não está respondendo",
        message: "Verifique se o servidor backend está rodando",
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
 * NOVA VERSÃO: Cancela através do backend que usa a DLL
 */
export async function cancelStonePayment(
  transactionId: string
): Promise<StonePaymentResponse> {
  try {
    console.log(`🔄 [STONE] Cancelando transação: ${transactionId}`);

    // Cancela via backend
    const response = await api.post("/api/payment/stone/cancel", {
      transactionId: transactionId,
    });

    const data = response.data;
    console.log(`✅ [STONE] Cancelamento processado:`, data);

    return {
      success: data.success,
      transactionId: transactionId,
      message: data.message || "Transação cancelada com sucesso",
    };
  } catch (error: any) {
    console.error("❌ Erro ao cancelar pagamento Stone:", error);

    // Erro de resposta do backend
    if (error.response) {
      return {
        success: false,
        error: error.response.data?.error || "Erro ao cancelar pagamento",
        message: error.response.data?.message || error.message,
      };
    }

    // Erro de conexão
    if (error.request) {
      return {
        success: false,
        error: "Backend não está respondendo",
        message: "Verifique se o servidor backend está rodando",
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
 * NOVA VERSÃO: Consulta através do backend que usa a DLL
 */
export async function checkStoneHealth(): Promise<StonePaymentResponse> {
  try {
    const response = await api.get("/api/payment/stone/health");
    const data = response.data;

    return {
      success: data.success,
      message: data.message || "TEF Stone está online",
    };
  } catch (error: any) {
    console.error("❌ Erro ao verificar saúde Stone:", error);

    return {
      success: false,
      error: "TEF Stone não está disponível",
      message: "Verifique se a DLL está carregada no backend",
    };
  }
}
