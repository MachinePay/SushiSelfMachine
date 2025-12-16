import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { useQuery } from "@tanstack/react-query"; // Importação Nova
import { useCart } from "../contexts/CartContext";
import { useAuth } from "../contexts/AuthContext";
import { getCurrentStoreId } from "../utils/tenantResolver"; // 🏪 MULTI-TENANT
import {
  createPixPayment,
  createStonePayment,
  checkStonePaymentStatus,
  cancelStonePayment,
} from "../services/paymentService";
import type { Order, CartItem } from "../types";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

// 🏪 Helper para adicionar x-store-id em todas as requisições
const fetchWithStoreId = async (url: string, options: RequestInit = {}) => {
  const storeId = getCurrentStoreId();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
    "x-store-id": storeId,
  };
  return fetch(url, { ...options, headers });
};

// Tipo para controlar o pagamento ativo
type ActivePaymentState = {
  id: string;
  type: "pix" | "card";
  orderId: string;
} | null;

const PaymentPage: React.FC = () => {
  const { cartItems, cartTotal, clearCart, observation } = useCart();
  const { currentUser, addOrderToHistory, logout } = useAuth();
  const navigate = useNavigate();

  // Estados de UI
  const [paymentMethod, setPaymentMethod] = useState<
    "credit" | "debit" | "pix" | null
  >(null);
  const [status, setStatus] = useState<
    "idle" | "processing" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [paymentStatusMessage, setPaymentStatusMessage] = useState("");

  // Estados para PIX
  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);

  // Estado que ATIVA o React Query (substitui o loop while)
  const [activePayment, setActivePayment] = useState<ActivePaymentState>(null);

  // Ref para limpeza (cleanup) ao desmontar a página
  const paymentIdRef = useRef<string | null>(null);

  // --- REACT QUERY: POLLING INTELIGENTE ---
  // Substitui o loop while. Só roda quando activePayment existe.
  const { data: paymentStatusData } = useQuery({
    queryKey: ["paymentStatus", activePayment?.id, activePayment?.type],
    queryFn: async () => {
      if (!activePayment) return null;

      // Se for Stone, usa checkStonePaymentStatus
      if (activePayment.type === "card") {
        const result = await checkStonePaymentStatus(activePayment.id);
        if (!result.success && result.error)
          throw new Error(result.error || "Erro ao verificar status");
        return {
          success: true,
          status: result.status,
          responseCode: result.responseCode,
          id: result.id,
        };
      }

      // Se for PIX, usa a API normal (já implementada)
      // Precisamos importar checkPaymentStatus para PIX
      const apiModule = await import("../services/paymentService");
      const result = await apiModule.checkPaymentStatus(activePayment.id);
      if (!result.success)
        throw new Error(result.error || "Erro ao verificar status");
      return result;
    },
    // Só executa se tiver um pagamento ativo e não tiver finalizado ainda
    enabled: !!activePayment && status === "processing",
    // Polling a cada 3 segundos
    refetchInterval: (query) => {
      const data = query.state.data;
      // Para o polling se aprovado, cancelado ou rejeitado (status final)
      if (
        data?.status === "approved" ||
        data?.status === "FINISHED" ||
        data?.status === "canceled" ||
        data?.status === "rejected"
      )
        return false;
      return 3000;
    },
    // Não refazer busca se o usuário trocar de janela (evita bugs de foco)
    refetchOnWindowFocus: false,
  });

  // --- EFEITO: Monitora o status vindo do React Query ---
  useEffect(() => {
    if (paymentStatusData?.status === "approved" && activePayment) {
      console.log(
        "✅ Pagamento detectado pelo React Query:",
        paymentStatusData
      );
      finalizeOrder(
        activePayment.orderId,
        activePayment.id,
        activePayment.type
      );
    }

    // Detecta pagamento cancelado ou rejeitado
    if (
      (paymentStatusData?.status === "canceled" ||
        paymentStatusData?.status === "rejected") &&
      activePayment
    ) {
      console.log("❌ Pagamento cancelado/rejeitado:", paymentStatusData);
      handlePaymentFailure(paymentStatusData);
    }
  }, [paymentStatusData, activePayment]);

  // --- EFEITO: Cleanup de Segurança (Zombie Killer) ---
  useEffect(() => {
    paymentIdRef.current = activePayment?.id || null;
  }, [activePayment]);

  useEffect(() => {
    return () => {
      // Se o componente desmontar (usuário clicar em Voltar) e tiver pagamento pendente
      if (paymentIdRef.current) {
        console.log(
          `🧹 Cleanup: Cancelando pagamento ${paymentIdRef.current} no backend...`
        );
        // Usa fetch com keepalive para garantir que o cancelamento vá mesmo fechando a aba
        fetchWithStoreId(
          `${BACKEND_URL}/api/payment/cancel/${paymentIdRef.current}`,
          {
            method: "DELETE",
            keepalive: true,
          }
        ).catch((err) => console.error("Erro no cleanup:", err));
      }
    };
  }, []);

  // --- Lógica de Falha de Pagamento ---
  const handlePaymentFailure = (data: any) => {
    setActivePayment(null); // Para o polling
    setStatus("error");

    // Mensagens específicas baseadas no reason
    const reasonMessages: Record<string, string> = {
      canceled_by_user: "Pagamento cancelado na maquininha pelo usuário",
      payment_error: "Erro ao processar pagamento na maquininha",
      canceled_by_system: "Pagamento cancelado pelo sistema",
      rejected_by_terminal: "Pagamento rejeitado pela maquininha",
    };

    // Prioridade: message do backend > reasonMessages > mensagem genérica
    const errorMsg =
      data.message ||
      (data.reason ? reasonMessages[data.reason] : null) ||
      "Pagamento não aprovado. Tente novamente.";

    setErrorMessage(errorMsg);
    setQrCodeBase64(null);

    console.log(`❌ Falha: ${errorMsg}`);
    if (data.reason) console.log(`  Motivo: ${data.reason}`);
    if (data.orderId) console.log(`  Pedido: ${data.orderId}`);
    if (data.paymentStatus) console.log(`  Status MP: ${data.paymentStatus}`);
  };

  // --- Lógica de Finalização ---
  const finalizeOrder = async (
    orderId: string,
    paymentId: string,
    type: "pix" | "card"
  ) => {
    try {
      // 1. Atualiza pedido no banco
      await fetchWithStoreId(`${BACKEND_URL}/api/orders/${orderId}`, {
        method: "PUT",
        body: JSON.stringify({ paymentId, paymentStatus: "paid" }),
      });

      // 2. Atualiza histórico local
      const orderData: Order = {
        id: orderId,
        userId: currentUser!.id,
        userName: currentUser!.name,
        items: cartItems.map((i) => ({
          productId: i.id,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
        })),
        total: cartTotal,
        timestamp: new Date().toISOString(),
        observation: observation,
        status: "active",
      };

      addOrderToHistory(orderData);

      // 3. Limpa UI e Redireciona
      setActivePayment(null); // Para o polling
      setStatus("success");
      clearCart();
      setQrCodeBase64(null);

      setTimeout(async () => {
        await logout();
        navigate("/", { replace: true });
      }, 5000);
    } catch (error) {
      console.error("Erro ao finalizar:", error);
      setErrorMessage(
        "Pagamento aprovado, mas erro ao salvar. Contate o caixa."
      );
      setStatus("error");
    }
  };

  // --- Helpers de Criação ---

  const createOrder = async () => {
    const orderResp = await fetchWithStoreId(`${BACKEND_URL}/api/orders`, {
      method: "POST",
      body: JSON.stringify({
        userId: currentUser!.id,
        userName: currentUser!.name,
        items: cartItems.map((i) => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          price: i.price,
        })),
        total: cartTotal,
        paymentId: null,
        observation: observation,
      }),
    });
    if (!orderResp.ok) throw new Error("Erro ao criar pedido");
    const data = await orderResp.json();
    return data.id;
  };

  // --- Handlers de Início ---

  const handlePixPayment = async () => {
    setStatus("processing");
    setPaymentStatusMessage("Gerando QR Code...");

    try {
      const orderId = await createOrder();

      const result = await createPixPayment({
        amount: cartTotal,
        description: `Pedido de ${currentUser!.name}`,
        orderId: orderId,
        email: currentUser?.email,
        payerName: currentUser?.name,
      });

      if (!result.success || !result.paymentId || !result.qrCode) {
        throw new Error(result.error || "Erro ao gerar PIX");
      }

      setQrCodeBase64(result.qrCode);
      setPaymentStatusMessage("Escaneie o QR Code...");

      // Inicia Polling Automático via React Query
      setActivePayment({ id: result.paymentId, type: "pix", orderId });
    } catch (err: any) {
      console.error(err);
      setStatus("error");
      setErrorMessage(err.message || "Erro no PIX.");
    }
  };

  const handleCardPayment = async () => {
    setStatus("processing");
    setPaymentStatusMessage("Conectando à Pinpad Stone...");

    try {
      const orderId = await createOrder();

      // Converte valor para centavos (Stone trabalha em centavos)
      const amountInCents = Math.round(cartTotal * 100);

      const result = await createStonePayment({
        amount: amountInCents,
        type: paymentMethod === "credit" ? "CREDIT" : "DEBIT",
        installments: paymentMethod === "credit" ? 1 : undefined,
        orderId: orderId,
      });

      if (!result.success || !result.id) {
        throw new Error(result.error || "Erro na Pinpad Stone");
      }

      setPaymentStatusMessage("Aguardando pagamento na Pinpad Stone...");

      // Inicia Polling Automático via React Query
      setActivePayment({ id: result.id, type: "card", orderId });
    } catch (err: any) {
      console.error(err);
      setStatus("error");
      setErrorMessage(err.message || "Erro ao conectar Pinpad Stone.");
    }
  };

  const handleCancelPayment = async () => {
    if (!activePayment) return;

    const result = await Swal.fire({
      title: "Cancelar?",
      text: "Deseja cancelar o pagamento?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Sim, cancelar",
    });

    if (result.isConfirmed) {
      try {
        // Se for Stone, usa cancelStonePayment
        if (activePayment.type === "card") {
          const cancelResult = await cancelStonePayment(activePayment.id);

          if (!cancelResult.success) {
            throw new Error(cancelResult.error || "Erro ao cancelar");
          }
        } else {
          // Se for PIX, usa cancelamento normal
          const apiModule = await import("../services/paymentService");
          const cancelResult = await apiModule.cancelPayment(activePayment.id);

          if (!cancelResult.success) {
            throw new Error(cancelResult.error || "Erro ao cancelar");
          }
        }

        setActivePayment(null); // Para o polling imediatamente
        setStatus("idle");
        setQrCodeBase64(null);
        Swal.fire("Cancelado", "Pagamento cancelado.", "success");
      } catch (e: any) {
        Swal.fire("Erro", e.message || "Erro ao cancelar.", "error");
      }
    }
  };

  const handlePayment = async () => {
    if (!paymentMethod) {
      setErrorMessage("Selecione a forma de pagamento");
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
      return;
    }
    if (paymentMethod === "pix") await handlePixPayment();
    else await handleCardPayment();
  };

  // --- Renderização ---

  if (status === "success") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-green-50 p-4 animate-fade-in-down">
        <div className="bg-white p-10 rounded-3xl shadow-2xl text-center max-w-md w-full">
          <img
            src="/selfMachine.jpg"
            alt="Self Machine"
            className="w-32 h-auto mx-auto mb-4 rounded-lg"
          />
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">✅</span>
          </div>
          <h2 className="text-3xl font-bold text-green-800 mb-2">
            Pagamento Aprovado!
          </h2>
          <p className="text-stone-600 text-lg mb-6">
            Pedido enviado para a cozinha.
          </p>
          <p className="text-sm text-stone-400">Redirecionando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold text-gray-800 mb-8 flex items-center gap-2">
        <button
          onClick={() => navigate("/menu")}
          className="text-red-600 hover:bg-red-100 p-2 rounded-full"
          disabled={status === "processing"}
        >
          ←
        </button>
        Finalizar Pagamento
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-2xl shadow-lg h-fit">
          <h2 className="text-xl font-bold text-stone-800 mb-4 border-b pb-2">
            Resumo do Pedido
          </h2>
          <ul className="space-y-3 max-h-64 overflow-y-auto mb-4">
            {cartItems.map((item) => (
              <li key={item.id} className="flex justify-between text-stone-600">
                <span>
                  {item.quantity}x {item.name}
                </span>
                <span className="font-semibold">
                  R$ {(item.price * item.quantity).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
          <div className="border-t pt-4 flex justify-between items-center">
            <span className="text-lg text-stone-500">Total a pagar:</span>
            <span className="text-3xl font-bold text-red-600">
              R$ {cartTotal.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-bold text-stone-800">
            Escolha a forma de pagamento:
          </h2>
          <PaymentOption
            label="Cartão de Crédito"
            icon="💳"
            selected={paymentMethod === "credit"}
            onClick={() => setPaymentMethod("credit")}
          />
          <PaymentOption
            label="Cartão de Débito"
            icon="💳"
            selected={paymentMethod === "debit"}
            onClick={() => setPaymentMethod("debit")}
          />
          <PaymentOption
            label="PIX"
            icon="💠"
            selected={paymentMethod === "pix"}
            onClick={() => setPaymentMethod("pix")}
          />

          {status === "processing" && !qrCodeBase64 && (
            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded animate-pulse text-center text-blue-800 font-semibold">
              {paymentStatusMessage}
            </div>
          )}

          {status === "processing" && qrCodeBase64 && (
            <div className="bg-white p-6 rounded-2xl shadow-xl border-2 border-purple-300 text-center">
              <h3 className="text-purple-900 font-bold text-xl mb-4">
                Pague com PIX
              </h3>
              <img
                src={`data:image/png;base64,${qrCodeBase64}`}
                alt="QR Code"
                className="w-64 h-64 mx-auto mb-4"
              />
              <p className="text-purple-600 text-sm">
                Escaneie com o app do seu banco
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="bg-red-100 text-red-700 p-3 rounded-lg text-center font-semibold">
              {errorMessage}
            </div>
          )}

          {status === "processing" ? (
            <button
              onClick={handleCancelPayment}
              className="mt-4 w-full py-4 rounded-xl font-bold text-xl bg-red-600 text-white hover:bg-red-700 shadow-lg transition-transform hover:scale-105"
            >
              ❌ Cancelar Pagamento
            </button>
          ) : (
            <button
              onClick={handlePayment}
              disabled={!paymentMethod}
              className={`mt-4 w-full py-4 rounded-xl font-bold text-xl shadow-lg transition-transform ${
                !paymentMethod
                  ? "bg-stone-300 text-stone-500 cursor-not-allowed"
                  : "bg-green-600 text-white hover:bg-green-700 hover:scale-105"
              }`}
            >
              Pagar R$ {cartTotal.toFixed(2)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const PaymentOption: React.FC<{
  label: string;
  icon: string;
  selected: boolean;
  onClick: () => void;
}> = ({ label, icon, selected, onClick }) => (
  <button
    onClick={onClick}
    className={`p-4 rounded-xl border-2 flex items-center gap-4 transition-all duration-200 text-left ${
      selected
        ? "border-red-500 bg-red-50 shadow-md transform scale-102"
        : "border-stone-200 bg-white hover:border-red-300 hover:bg-stone-50"
    }`}
  >
    <span className="text-3xl">{icon}</span>
    <span
      className={`font-semibold text-lg ${
        selected ? "text-gray-900" : "text-stone-600"
      }`}
    >
      {label}
    </span>
    {selected && <span className="ml-auto text-amber-600 font-bold">✓</span>}
  </button>
);

export default PaymentPage;
