// Mock de pagamento de cartão para testes frontend
export async function createCardPaymentMock({
  amount,
  paymentMethod,
}: {
  amount: number;
  paymentMethod: "credit" | "debit";
}) {
  const resp = await fetch(
    `${import.meta.env.VITE_API_URL}/api/payment/card/mock`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, paymentMethod }),
    }
  );
  return resp.json();
}
// Cancelamento exclusivo para PIX
export async function cancelPixPayment(paymentId: string) {
  const response = await api.delete(`/api/payment/cancel/${paymentId}`);
  return {
    success: true,
    message: response.data?.message,
  };
}
// Serviço de Pagamento Multi-tenant (PIX + Pin Pad Stone)
import api from "./api";
import { criarPagamentoPinpad, cancelarPagamentoPinpad } from "./pinpadApi";

/* =======================
   TYPES
======================= */

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

/* =======================
   PIX
======================= */

export async function createPixPayment(data: {
  amount: number;
  orderId: string;
  description?: string;
  email?: string;
  payerName?: string;
}): Promise<PaymentResponse> {
  try {
    const response = await api.post("/api/payment/create-pix", {
      amount: data.amount,
      description: data.description || `Pedido ${data.orderId}`,
      orderId: data.orderId,
      email: data.email || "cliente@totem.com.br",
      payerName: data.payerName || "Cliente",
    });

    return {
      success: true,
      paymentId: response.data.id,
      qrCode: response.data.qr_code_base64,
      qrCodeCopyPaste: response.data.qr_code,
      status: response.data.status,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.error || "Erro ao criar pagamento PIX",
    };
  }
}

export async function checkPaymentStatus(
  paymentId: string,
  type: "pix" | "card" = "pix"
): Promise<PaymentStatusResponse> {
  if (type === "card") {
    return {
      success: false,
      error: "Pagamento por cartão não suporta polling",
    };
  }

  try {
    const response = await api.get(`/api/payment/status/${paymentId}`);

    return {
      success: true,
      id: response.data.id,
      status: response.data.status,
      statusDetail: response.data.statusDetail,
      amount: response.data.amount,
      orderId: response.data.orderId,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.error || "Erro ao consultar status",
    };
  }
}

/* =======================
   CARTÃO (PIN PAD)
======================= */

export async function createCardPayment({
  amount,
  paymentMethod,
}: {
  amount: number;
  paymentMethod: "credit" | "debit";
}): Promise<{
  success: boolean;
  paymentId: string;
  message?: string;
  status: "approved" | "rejected";
}> {
  const valor = Math.round(amount * 100);
  const tipo = paymentMethod === "credit" ? "credito" : "debito";

  try {
    const resp = await criarPagamentoPinpad({
      valor,
      tipo,
      parcelas: 1,
    });

    return {
      success: resp.aprovado === true,
      paymentId: resp.nsu,
      message: resp.mensagem,
      status: resp.aprovado ? "approved" : "rejected",
    };
  } catch (error: any) {
    return {
      success: false,
      paymentId: "",
      message: error.message || "Erro no Pin Pad",
      status: "rejected",
    };
  }
}

export async function cancelPayment(
  paymentId: string,
  amount: number
): Promise<{ success: boolean; message?: string }> {
  try {
    const resp = await cancelarPagamentoPinpad({
      nsu: paymentId,
      valor: Math.round(amount * 100),
    });

    return {
      success: !!resp.aprovado,
      message: resp.mensagem,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Erro ao cancelar",
    };
  }
}

/* =======================
   POLLING (PIX ONLY)
======================= */

export async function startPaymentPolling(
  paymentId: string,
  onStatusChange: (s: PaymentStatusResponse) => void,
  intervalMs = 3000,
  timeoutMs = 300000
): Promise<PaymentStatusResponse> {
  let elapsed = 0;

  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      elapsed += intervalMs;

      const status = await checkPaymentStatus(paymentId, "pix");
      onStatusChange(status);

      if (
        status.status === "approved" ||
        status.status === "rejected" ||
        elapsed >= timeoutMs
      ) {
        clearInterval(interval);
        resolve(status);
      }
    }, intervalMs);
  });
}
